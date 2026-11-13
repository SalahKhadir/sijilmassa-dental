[CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
param(
    [string]$ConfigPath = 'C:\SijilmassaDental\config\pilot.json',
    [switch]$Install,
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
$config = $null
$dockerReady = $false
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
Check 'WSL 2' {
    $version = Invoke-LocalCommand wsl.exe @('--version')
    $line = (($version.Output -replace "\x00",'') -split '[\r\n]+' | Select-Object -First 1)
    if ($version.Code -ne 0 -or $line -notmatch '([0-9]+\.[0-9]+\.[0-9]+)' -or [version]$Matches[1] -lt [version]'2.1.5') {
        throw 'Installez ou mettez à jour WSL (2.1.5 minimum), puis vérifiez wsl --status.'
    }
    $status = Invoke-LocalCommand wsl.exe @('--status')
    if ($status.Code -ne 0) { throw 'WSL ne répond pas. Vérifiez les fonctionnalités Windows et redémarrez si nécessaire.' }
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
    Check 'Emplacement du disque Docker' {
        $directory = Assert-PrivatePath $config.dockerDiskDirectory Container 'disque Docker Desktop'
        $disk = [IO.DriveInfo]::new([IO.Path]::GetPathRoot($directory))
        if ($disk.DriveType -ne 'Fixed' -or $disk.AvailableFreeSpace -lt 20GB) { throw 'Prévoyez un disque fixe hors synchronisation avec 20 Gio libres pour le pilote.' }
        Write-Host '    Confirmez cet emplacement dans Docker Desktop > Resources et conservez le volume PostgreSQL géré par Docker.'
    }
    if ($dockerReady) {
        Check 'Fichiers privés, images locales et modèle Compose' { Assert-ClinicInputs $config }
        Check 'Port HTTPS' {
            $listeners = @(Get-NetTCPConnection -State Listen -LocalPort $config.ClinicUri.Port -ErrorAction SilentlyContinue |
                Where-Object { $_.LocalAddress -in @('0.0.0.0','::',$config.ClinicUri.Host) })
            if ($listeners.Count) {
                $port = Invoke-ClinicCompose $config @('port','https','443')
                if ($port.Code -ne 0 -or $port.Output.Trim() -ne "$($config.ClinicUri.Host):$($config.ClinicUri.Port)") {
                    throw 'Port déjà occupé par un autre service ou liaison différente.'
                }
            }
        }
    }
    if ($config.caSha256) {
        Check 'Certificat public CA et magasin Windows' {
            Assert-TrustedCa $config
        }
    } elseif (-not $Install) {
        $failed = $true
        Write-Host 'À FAIRE  Certificat CA à exporter après le premier démarrage, vérifier puis installer.'
    }
    if (-not $Install) {
        Check 'Destination et clé publique de sauvegarde (WSL)' {
            $result = Invoke-ClinicBackup $config 'check'
            if ($result.Code -ne 0) { throw 'Vérifiez la distribution WSL, le disque externe et le trousseau public avec le guide.' }
        }
        if ($config.caSha256 -and $dockerReady) {
            Check 'HTTPS actif' {
                if (-not (Test-ClinicHttps $config)) { throw 'Application arrêtée, CA non reconnue ou adresse du certificat incorrecte.' }
            }
        }
    }
}
if ($failed) { exit 1 }
if (($BootstrapAccounts -or $ExportPublicCa) -and -not $Install) { throw 'Ajoutez -Install pour initialiser les comptes ou exporter le certificat public.' }
if (-not $Install) { Write-Host 'Préflight terminé. Reportez les contrôles manuels sur la fiche de recette.'; exit 0 }
if ($PSCmdlet.ShouldProcess($config.project, 'Démarrer la pile pilote en conservant les volumes')) {
    try {
        $validation = Invoke-LocalCommand docker.exe @('--context','desktop-linux','run','--rm','--pull','never',
            '--network','none','--read-only','--tmpfs','/data','--tmpfs','/config',
            '-e',"CLINIC_LAN_IP=$($config.ClinicUri.Host)","localhost/sijilmassa-https:$($config.release)",
            'caddy','validate','--adapter','caddyfile','--config','/etc/caddy/Caddyfile')
        if ($validation.Code -ne 0) { throw 'Le Caddyfile livré avec le lot ne valide pas la configuration HTTPS.' }
        Start-ClinicServices $config $WaitSeconds
        if ($BootstrapAccounts -and $PSCmdlet.ShouldProcess($config.project, 'Créer les deux comptes fictifs dans le terminal')) {
            Invoke-ClinicCompose $config @('run','--rm','--no-deps','--pull','never','backend','--spring.profiles.active=prod,bootstrap') -Interactive
        }
        if ($ExportPublicCa -and $PSCmdlet.ShouldProcess($config.caFile, 'Exporter le certificat public CA sans écrasement')) {
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
