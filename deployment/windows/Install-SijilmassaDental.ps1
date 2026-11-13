[CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
param(
    [string]$ConfigPath = 'C:\SijilmassaDental\config\pilot.json',
    [switch]$Install,
    [switch]$BeforeInstall,
    [switch]$WslKeepConsole,
    [switch]$BootstrapAccounts,
    [switch]$ExportPublicCa,
    [ValidateRange(20,300)][int]$WaitSeconds = 150
)
. (Join-Path $PSScriptRoot 'SijilmassaDental.Common.ps1')

$ErrorActionPreference = 'Stop'
$failed = $false
function Check([string]$Label, [scriptblock]$Action) {
    try { & $Action; Write-Host "OK  $Label" }
    catch { $script:failed = $true; Write-Host "ÉCHEC  ${Label} — $($_.Exception.Message)" }
}

Write-Host 'Pilote Windows sur données fictives. Mise en service clinique bloquée.'
if ($env:OS -ne 'Windows_NT') { Write-Error 'Exécutez le préflight sur le PC Windows 11 du dentiste.'; exit 1 }
if ($BeforeInstall -and $Install) { throw 'Utilisez -BeforeInstall ou -Install dans deux commandes distinctes.' }
$config = $null
$dockerReady = $false
$wslReady = $false
Check 'Windows, virtualisation et mémoire' {
    $os = Get-CimInstance Win32_OperatingSystem
    $pc = Get-CimInstance Win32_ComputerSystem
    $processors = @(Get-CimInstance Win32_Processor)
    $edition = (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion').EditionID
    Write-Host "    $($os.Caption), édition $edition, build $($os.BuildNumber)"
    if ([int]$os.BuildNumber -lt 22631 -or $os.ProductType -ne 1 -or $edition -notmatch '^(Professional|Enterprise|Education)') {
        throw 'Le pilote cible Windows 11 Pro, Enterprise ou Education x64, build 22631 ou ultérieur encore pris en charge.'
    }
    if ($processors.Count -eq 0 -or @($processors | Where-Object Architecture -ne 9).Count) { throw 'Le lot pilote a été construit pour linux/amd64. Utilisez un PC x64.' }
    if (-not $pc.HypervisorPresent -and @($processors | Where-Object { -not $_.VirtualizationFirmwareEnabled -or -not $_.SecondLevelAddressTranslationExtensions }).Count) {
        throw 'Vérifiez la virtualisation et SLAT dans lʼUEFI.'
    }
    if ($pc.TotalPhysicalMemory -lt 7500000000) { throw 'Prévoyez au moins 8 Go de RAM installée.' }
}
Check 'WSL' {
    $version = Assert-WslRuntime -KeepConsole:$WslKeepConsole
    Write-Host "    WSL $version"
    $script:wslReady = $true
}
Check 'Docker Desktop et Compose' {
    Assert-LocalDocker
    $compose = Invoke-LocalCommand docker.exe @('--context','desktop-linux','compose','version','--short')
    if ($compose.Code -ne 0 -or $compose.Output.Trim() -notmatch '^v?(\d+\.\d+\.\d+)' -or
        [version]$Matches[1] -lt [version]'2.30.0') { throw 'Mettez Docker Desktop à jour (Compose 2.30 ou plus récent pour env_file format: raw).' }
    Write-Host "    Compose $($compose.Output.Trim())"
    $script:dockerReady = $true
}
Check 'Configuration pilote' { $script:config = Read-PilotConfig $ConfigPath }
if ($config) {
    Check 'Adresse LAN et pare-feu' {
        Assert-ClinicNetwork $config
        Write-Host '    Contrôle manuel requis pour la portée de la règle et le refus hors LAN.'
    }
    if ($wslReady) {
        Check 'Distribution WSL 2' { Assert-WslDistribution $config.backupDistribution -KeepConsole:$WslKeepConsole }
    }
    Check 'Emplacement du disque Docker' {
        Assert-DockerDisk $config
        Write-Host '    Comparez cet emplacement avec le réglage Resources de Docker Desktop.'
    }
    if ($dockerReady) {
        Check 'Fichiers privés, images locales et modèle Compose' { Assert-ClinicInputs $config }
        Check 'Port HTTPS' { Assert-ClinicPort $config }
    } else {
        Check 'Fichiers privés' { Assert-ClinicFiles $config }
    }
    if ($config.caSha256) {
        Check 'Certificat public CA et magasin Windows' {
            Assert-TrustedCa $config
        }
    } elseif (-not $Install -and -not $BeforeInstall) {
        $failed = $true
        Write-Host 'À FAIRE  Certificat CA à exporter après le premier démarrage, vérifier puis installer.'
    }
    if ($wslReady -and $dockerReady) {
        Check 'Destination et clé publique de sauvegarde (WSL)' {
            $result = Invoke-ClinicBackup $config 'check' -KeepConsole:$WslKeepConsole
            if ($result.Code -ne 0) { throw 'Vérifiez lʼintégration Docker dans WSL, le disque externe et le trousseau public avec le guide.' }
        }
    }
    if (-not $Install -and -not $BeforeInstall -and $config.caSha256 -and $dockerReady) {
        Check 'HTTPS actif' {
            $issue = Get-ClinicServiceIssue $config
            if (-not $issue) { $issue = Get-ClinicHttpsIssue $config }
            if ($issue) { throw $issue }
        }
    }
}
if ($failed) { exit 1 }
if (($BootstrapAccounts -or $ExportPublicCa) -and -not $Install) { throw 'Ajoutez -Install pour initialiser les comptes ou exporter le certificat public.' }
if ($BeforeInstall) { Write-Host 'Contrôles avant installation réussis. Prévoyez la vérification HTTPS après démarrage.'; exit 0 }
if (-not $Install) { Write-Host 'Préflight terminé. Reportez les contrôles manuels sur la fiche de recette.'; exit 0 }
if ($PSCmdlet.ShouldProcess($config.project, 'Démarrer la pile pilote en conservant les volumes')) {
    try {
        $validation = Invoke-LocalCommand docker.exe @('--context','desktop-linux','run','--rm','--pull','never',
            '--network','none','--read-only','--tmpfs','/data','--tmpfs','/config',
            '-e',"CLINIC_LAN_IP=$($config.ClinicUri.Host)","localhost/sijilmassa-https:$($config.release)",
            'caddy','validate','--adapter','caddyfile','--config','/etc/caddy/Caddyfile')
        if ($validation.Code -ne 0) { throw 'Le Caddyfile livré avec le lot ne valide pas la configuration HTTPS.' }
        Start-ClinicServices $config $WaitSeconds
        if ($BootstrapAccounts) {
            if (-not $PSCmdlet.ShouldProcess($config.project, 'Créer les deux comptes fictifs dans le terminal')) {
                throw 'Création des comptes reportée. La pile a démarré.'
            }
            Invoke-ClinicCompose $config @('run','--rm','--no-deps','--pull','never','backend','--spring.profiles.active=prod,bootstrap') -Interactive
        }
        if ($ExportPublicCa) {
            if (-not $PSCmdlet.ShouldProcess($config.caFile, 'Exporter le certificat public CA sans écrasement')) {
                throw 'Export de la CA reporté. La pile a démarré.'
            }
            if (Test-Path -LiteralPath $config.caFile) {
                throw 'Le fichier CA existe déjà. Comparez-le à la CA du volume avant de poursuivre.'
            }
            $parent = Assert-PrivatePath (Split-Path -Parent $config.caFile) Container 'dossier du certificat'
            $public = Invoke-ClinicCompose $config @('exec','-T','https','cat','/data/caddy/pki/authorities/local/root.crt')
            if ($public.Code -ne 0 -or $public.Output -notmatch '\A\s*-----BEGIN CERTIFICATE-----\s+([A-Za-z0-9+/=\r\n]+)\s*-----END CERTIFICATE-----\s*\z') {
                throw 'Certificat public CA indisponible. Vérifiez le volume Caddy.'
            }
            $der = [Convert]::FromBase64String($Matches[1])
            $path = Join-Path $parent (Split-Path -Leaf $config.caFile)
            $stream = [IO.File]::Open($path, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
            try { $stream.Write($der, 0, $der.Length) } finally { $stream.Dispose() }
            Write-Host "Empreinte SHA-256 du certificat public DER : $((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash)"
        }
        Write-Host 'Pile pilote démarrée. Terminez la vérification HTTPS et la recette avant usage.'
    } catch { Show-ClinicFailure $_.Exception.Message; exit 1 }
}
elseif (-not $WhatIfPreference) {
    Show-ClinicFailure 'Démarrage annulé.'
    exit 1
}
exit 0
