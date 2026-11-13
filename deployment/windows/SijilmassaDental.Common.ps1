Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$script:Deployment = Split-Path -Parent $PSScriptRoot
$script:RepoRoot = Split-Path -Parent $script:Deployment
$script:WindowsDeployment = $PSScriptRoot

function Quote-NativeArgument([string]$Value) {
    # CommandLineToArgvW quoting, including literal quotes and trailing backslashes.
    '"' + [regex]::Replace([regex]::Replace($Value, '(\\*)"', '$1$1\"'), '(\\+)$', '$1$1') + '"'
}

function Invoke-LocalCommand {
    param([string]$Name, [string[]]$Arguments, [int]$TimeoutSeconds = 15)
    $command = Get-Command $Name -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $command) { throw "Commande indisponible ($Name). Consultez le guide Windows." }
    $info = New-Object System.Diagnostics.ProcessStartInfo
    $info.FileName = $command.Source
    $info.Arguments = ($Arguments | ForEach-Object { Quote-NativeArgument $_ }) -join ' '
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    $process = [System.Diagnostics.Process]::Start($info)
    try {
        $output = $process.StandardOutput.ReadToEndAsync()
        $errors = $process.StandardError.ReadToEndAsync()
        if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
            try { $process.Kill() } catch { }
            throw "Délai dépassé ($Name). Vérifiez lʼétat des services avant de réessayer."
        }
        if (-not $output.Wait(1000) -or -not $errors.Wait(1000)) { throw "Sortie indisponible ($Name)." }
        [pscustomobject]@{ Code = $process.ExitCode; Output = $output.Result }
    } finally { $process.Dispose() }
}

function ConvertTo-ClinicUri([string]$Value) {
    if ($Value -notmatch '^https://(?<ip>(?:[0-9]{1,3}\.){3}[0-9]{1,3})(?::(?<port>[1-9][0-9]{0,4}))?/?$') {
        throw 'Indiquez une URL HTTPS privée avec une adresse IPv4 et un port facultatif.'
    }
    $ip = $Matches.ip
    $port = if ($Matches.ContainsKey('port')) { [int]$Matches.port } else { 443 }
    $octets = @($ip.Split('.') | ForEach-Object { [int]$_ })
    if (($octets -join '.') -cne $ip -or @($octets | Where-Object { $_ -gt 255 }).Count -gt 0 -or
        -not ($octets[0] -eq 10 -or ($octets[0] -eq 172 -and $octets[1] -in (16..31)) -or
            ($octets[0] -eq 192 -and $octets[1] -eq 168))) {
        throw 'Utilisez lʼadresse IPv4 privée réservée au PC dentiste.'
    }
    if ($port -gt 65535 -or $port -in @(5432,8080,3000,2019)) { throw 'Le port HTTPS est invalide ou réservé.' }
    [uri]$Value
}

function Read-PilotConfig([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw 'Configuration du pilote introuvable. Préparez pilot.json avec lʼinstallateur.' }
    try { $config = Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json -ErrorAction Stop }
    catch { throw 'Configuration du pilote illisible ou JSON invalide.' }
    $required = @('syntheticPilot','project','release','url','appPasswordFile','adminPasswordFile','practitionerDirectory',
        'practitionerSha256','caFile','caSha256','dockerDiskDirectory','backupDistribution','backupConfig')
    foreach ($name in $required) {
        if (-not $config.PSObject.Properties[$name]) { throw "Champ de configuration manquant ($name)." }
        if ($name -ne 'syntheticPilot' -and $config.$name -isnot [string]) { throw "Champ de configuration invalide ($name)." }
    }
    if ($config.syntheticPilot -isnot [bool] -or -not $config.syntheticPilot -or $config.project -cnotmatch '^sijilmassa-[a-z0-9-]+-pilot$') {
        throw 'Réservé à un projet Compose de pilote fictif nommé sijilmassa-…-pilot.'
    }
    if ($config.release -cnotmatch '^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$' -or $config.release -eq 'latest') {
        throw 'Renseignez le tag local du lot pilote vérifié.'
    }
    if ($config.practitionerSha256 -and $config.practitionerSha256 -notmatch '^[a-f0-9]{64}$') { throw 'Empreinte du profil praticien invalide.' }
    if ($config.caSha256 -and $config.caSha256 -notmatch '^[a-f0-9]{64}$') { throw 'Empreinte SHA-256 de la CA invalide.' }
    $config | Add-Member -NotePropertyName ClinicUri -NotePropertyValue (ConvertTo-ClinicUri $config.url)
    $config
}

function Assert-PrivatePath([string]$Path, [string]$Type, [string]$Label) {
    if ($Path -notmatch '^[A-Za-z]:[/\\]' -or $Path -match '[\x00-\x1f"]' -or
        -not (Test-Path -LiteralPath $Path -PathType $Type)) { throw "Chemin local introuvable ou invalide ($Label)." }
    $resolved = (Resolve-Path -LiteralPath $Path).ProviderPath
    if ($resolved.StartsWith($script:RepoRoot.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase) -or
        $resolved -eq $script:RepoRoot -or $resolved -match '[/\\]OneDrive[^/\\]*[/\\]') {
        throw "Placez $Label hors du dépôt et de OneDrive."
    }
    $resolved
}

function Read-PasswordFile([string]$Path, [string]$Key) {
    $file = Assert-PrivatePath $Path Leaf $Key
    $item = Get-Item -LiteralPath $file
    if ($item.Length -gt 4096 -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw "Fichier privé invalide ($Key)." }
    $acl = Get-Acl -LiteralPath $file
    if (-not $acl.AreAccessRulesProtected) { throw "Désactivez lʼhéritage ACL du fichier privé ($Key) selon le guide." }
    $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    foreach ($rule in $acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier])) {
        if ($rule.AccessControlType -eq 'Allow' -and $rule.IdentityReference.Value -notin @($sid,'S-1-5-18','S-1-5-32-544')) {
            throw "Restreignez les droits dʼaccès au fichier privé ($Key)."
        }
    }
    $text = [Text.Encoding]::UTF8.GetString([IO.File]::ReadAllBytes($file))
    if ($text -cnotmatch ('\A' + $Key + '=([A-Za-z0-9_-]{32,256})(?:\r?\n)?\z')) {
        throw "Le fichier $Key doit contenir une seule valeur aléatoire Base64URL ou hexadécimale de 32 caractères minimum."
    }
    $Matches[1]
}

function Assert-PinnedCa($Config) {
    if (-not $Config.caSha256) { throw 'Empreinte de la CA absente. Vérifiez et installez le certificat public selon le guide.' }
    $path = Assert-PrivatePath $Config.caFile Leaf 'certificat public CA'
    $bytes = [IO.File]::ReadAllBytes($path)
    $text = [Text.Encoding]::ASCII.GetString($bytes)
    if ($text.Contains('-----BEGIN')) {
        if ($text -notmatch '\A\s*-----BEGIN CERTIFICATE-----\s+([A-Za-z0-9+/=\r\n]+)\s*-----END CERTIFICATE-----\s*\z') {
            throw 'Le fichier doit contenir un seul certificat public.'
        }
        $bytes = [Convert]::FromBase64String($Matches[1])
    }
    try { $cert = [Security.Cryptography.X509Certificates.X509Certificate2]::new($bytes) }
    catch { throw 'Certificat public CA illisible.' }
    try {
        $hash = [Security.Cryptography.SHA256]::Create()
        try { $fingerprint = [BitConverter]::ToString($hash.ComputeHash($cert.RawData)).Replace('-', '') }
        finally { $hash.Dispose() }
        $constraints = @($cert.Extensions | Where-Object { $_.Oid.Value -eq '2.5.29.19' })
        if ($cert.HasPrivateKey -or $fingerprint -ne $Config.caSha256 -or $constraints.Count -ne 1 -or
            -not $constraints[0].CertificateAuthority -or $cert.NotBefore -gt (Get-Date) -or $cert.NotAfter -le (Get-Date)) {
            throw 'CA invalide, expirée ou différente de lʼempreinte vérifiée.'
        }
        $cert.Thumbprint
    } finally { $cert.Dispose() }
}

function Assert-TrustedCa($Config) {
    $thumbprint = Assert-PinnedCa $Config
    if (-not ((Test-Path "Cert:\CurrentUser\Root\$thumbprint") -or (Test-Path "Cert:\LocalMachine\Root\$thumbprint"))) {
        throw 'La CA vérifiée doit être importée manuellement dans le magasin Windows approuvé.'
    }
}

function Test-ClinicHttps($Config) {
    # The HTTP request uses the Windows trust store and normal hostname validation.
    # The callback additionally pins the root of the validated peer chain.
    if (-not ('Sijilmassa.PilotHttps' -as [type])) {
        # Windows PowerShell 5.1 uses .NET Framework's per-request certificate callback.
        $compiler = @{}
        if ($PSVersionTable.PSEdition -eq 'Core') { $compiler.CompilerOptions = '/nowarn:SYSLIB0014' }
        Add-Type @compiler -TypeDefinition @'
using System;
using System.Net;
using System.Net.Security;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
namespace Sijilmassa {
    public static class PilotHttps {
        public static int Status(string url, string root) {
            var request = (HttpWebRequest)WebRequest.Create(url);
            request.Method = "GET";
            request.AllowAutoRedirect = false;
            request.Proxy = null;
            request.Timeout = 3000;
            request.ReadWriteTimeout = 3000;
            request.ServerCertificateValidationCallback = (sender, cert, chain, errors) => {
                if (errors != SslPolicyErrors.None || chain == null || chain.ChainElements.Count == 0) return false;
                var anchor = chain.ChainElements[chain.ChainElements.Count - 1].Certificate;
                using (var sha = SHA256.Create()) {
                    return String.Equals(BitConverter.ToString(sha.ComputeHash(anchor.RawData)).Replace("-", ""),
                                         root, StringComparison.OrdinalIgnoreCase);
                }
            };
            try {
                using (var response = (HttpWebResponse)request.GetResponse()) return (int)response.StatusCode;
            } catch (WebException exception) {
                using (var response = exception.Response as HttpWebResponse)
                    return response == null ? -1 : (int)response.StatusCode;
            }
        }
    }
}
'@
    }
    $origin = $Config.ClinicUri.GetLeftPart([UriPartial]::Authority)
    ([Sijilmassa.PilotHttps]::Status("$origin/api/v1/auth/me", $Config.caSha256) -eq 401 -and
        [Sijilmassa.PilotHttps]::Status("$origin/login", $Config.caSha256) -eq 200)
}

function Assert-LocalDocker {
    $desktop = Invoke-LocalCommand docker.exe @('context','inspect','desktop-linux','--format','{{.Endpoints.docker.Host}}')
    if ($desktop.Code -eq 0 -and $desktop.Output.Trim() -ne 'npipe:////./pipe/dockerDesktopLinuxEngine') {
        throw 'Le contexte desktop-linux ne désigne pas le moteur local Docker Desktop.'
    }
    $info = Invoke-LocalCommand docker.exe @('--context','desktop-linux','info','--format','{{.OSType}}')
    if ($desktop.Code -ne 0 -or $info.Code -ne 0) {
        # The current local Desktop context can reveal Windows-container mode.
        $context = Invoke-LocalCommand docker.exe @('context','show')
        if ($context.Code -eq 0 -and $context.Output.Trim() -eq 'default') {
            $endpoint = Invoke-LocalCommand docker.exe @('context','inspect','default','--format','{{.Endpoints.docker.Host}}')
            if ($endpoint.Code -eq 0 -and $endpoint.Output.Trim() -eq 'npipe:////./pipe/docker_engine') {
                $mode = Invoke-LocalCommand docker.exe @('--context','default','info','--format','{{.OSType}}')
                if ($mode.Code -eq 0 -and $mode.Output.Trim() -eq 'windows') { throw 'Passez Docker Desktop en mode conteneurs Linux (WSL 2).' }
            }
        }
        throw 'Démarrez Docker Desktop en mode Linux (WSL 2) et attendez que le moteur soit prêt.'
    }
    if ($info.Output.Trim() -ne 'linux') { throw 'Passez Docker Desktop en mode conteneurs Linux (WSL 2).' }
}

function Invoke-ClinicCompose($Config, [string[]]$Arguments, [int]$TimeoutSeconds = 20, [switch]$Interactive) {
    $variables = @{
        CLINIC_PROJECT = $Config.project; CLINIC_RELEASE = $Config.release
        CLINIC_LAN_IP = $Config.ClinicUri.Host; CLINIC_HTTPS_PORT = [string]$Config.ClinicUri.Port
        CLINIC_DB_PASSWORD_FILE = $Config.appPasswordFile.Replace('\','/')
        CLINIC_PG_ADMIN_FILE = $Config.adminPasswordFile.Replace('\','/')
        CLINIC_PRIVATE_CONFIG_DIR = $Config.practitionerDirectory.Replace('\','/')
        CLINIC_PRACTITIONER_SHA256 = $Config.practitionerSha256
        COMPOSE_DISABLE_ENV_FILE = '1'; COMPOSE_PROFILES = $null; COMPOSE_REMOVE_ORPHANS = $null; COMPOSE_ENV_FILES = $null
        DOCKER_HOST = $null; DOCKER_CONTEXT = $null
    }
    $saved = @{}
    foreach ($key in $variables.Keys) {
        $saved[$key] = [Environment]::GetEnvironmentVariable($key, 'Process')
        [Environment]::SetEnvironmentVariable($key, $variables[$key], 'Process')
    }
    try {
        $prefix = @('--context','desktop-linux','compose','--project-name',$Config.project,
            '-f',(Join-Path $script:Deployment 'compose.yml'),'-f',(Join-Path $script:WindowsDeployment 'compose.windows.yml'))
        if ($Interactive) {
            $allArguments = $prefix + $Arguments
            & docker.exe @allArguments
            if ($LASTEXITCODE -ne 0) { throw 'Initialisation des comptes en échec. Consultez le guide avant de recommencer.' }
        } else {
            Invoke-LocalCommand docker.exe ($prefix + $Arguments) $TimeoutSeconds
        }
    } finally {
        foreach ($key in $saved.Keys) { [Environment]::SetEnvironmentVariable($key, $saved[$key], 'Process') }
    }
}

function Assert-ClinicInputs($Config) {
    $app = Read-PasswordFile $Config.appPasswordFile 'DB_PASSWORD'
    $admin = Read-PasswordFile $Config.adminPasswordFile 'POSTGRES_PASSWORD'
    if ($app -ceq $admin) { throw 'Les mots de passe PostgreSQL doivent être distincts.' }
    $profile = Assert-PrivatePath $Config.practitionerDirectory Container 'profil praticien'
    if ($Config.practitionerSha256) {
        $file = Join-Path $profile 'practitioner.json'
        if (-not (Test-Path -LiteralPath $file -PathType Leaf) -or
            (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -ne $Config.practitionerSha256) {
            throw 'Le profil praticien est absent ou son empreinte ne correspond pas.'
        }
    }
    $model = Invoke-ClinicCompose $Config @('config','--quiet','--no-env-resolution')
    if ($model.Code -ne 0) { throw 'Configuration Compose invalide. Vérifiez les chemins et la version de Compose.' }
    foreach ($service in @('backend','frontend','postgres','https')) {
        $image = Invoke-LocalCommand docker.exe @('--context','desktop-linux','image','inspect','--format','{{.Id}}',
            "localhost/sijilmassa-${service}:$($Config.release)")
        if ($image.Code -ne 0) { throw "Image locale manquante ($service). Chargez les quatre images du lot vérifié." }
    }
}

function Assert-ClinicNetwork($Config) {
    $ip = Get-NetIPAddress -AddressFamily IPv4 -IPAddress $Config.ClinicUri.Host -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if (-not $ip) { throw 'LʼIPv4 du pilote nʼest pas affectée à ce PC.' }
    $network = Get-NetConnectionProfile -InterfaceIndex $ip.InterfaceIndex
    if ($network.NetworkCategory -ne 'Private') { throw 'Utilisez le réseau privé approuvé du cabinet.' }
    $firewall = Get-NetFirewallProfile -Name Private
    if ([string]$firewall.Enabled -ne 'True') { throw 'Le pare-feu du profil privé doit être actif.' }
}

function Start-ClinicServices($Config, [int]$WaitSeconds) {
    Assert-ClinicNetwork $Config
    Assert-ClinicInputs $Config
    $services = [ordered]@{ db='postgres'; backend='backend'; frontend='frontend'; https='https' }
    foreach ($service in $services.Keys) {
        $existing = Invoke-ClinicCompose $Config @('ps','--all','--quiet',$service)
        if ($existing.Code -ne 0) { throw 'Impossible de vérifier les conteneurs existants.' }
        $ids = @($existing.Output.Trim() -split '[
]+' | Where-Object { $_ })
        if ($ids.Count -gt 1) { throw "Plusieurs conteneurs existent pour $service. Demandez une intervention de maintenance." }
        if ($ids.Count) {
            if ($ids[0] -notmatch '^[a-f0-9]{12,64}$') { throw 'Identifiant de conteneur inattendu.' }
            $actual = Invoke-LocalCommand docker.exe @('--context','desktop-linux','inspect','--format','{{.Config.Image}} {{.Image}}',$ids[0])
            $expected = "localhost/sijilmassa-$($services[$service]):$($Config.release)"
            $local = Invoke-LocalCommand docker.exe @('--context','desktop-linux','image','inspect','--format','{{.Id}}',$expected)
            if ($actual.Code -ne 0 -or $local.Code -ne 0 -or $actual.Output.Trim() -cne "$expected $($local.Output.Trim())") {
                throw "Le conteneur $service utilise un autre lot. Suivez la procédure de maintenance."
            }
        }
    }
    $start = Invoke-ClinicCompose $Config @('up','-d','--no-recreate','--no-build','--pull','never','--wait','--wait-timeout',"$WaitSeconds") ($WaitSeconds + 15)
    if ($start.Code -ne 0) { throw 'Les services ne sont pas prêts. Ouvrez lʼoutil État ou contactez lʼinstallateur. Les volumes sont conservés.' }
}

function Show-ClinicFailure([string]$Message, [switch]$Dialog) {
    if ($Dialog) {
        Add-Type -AssemblyName System.Windows.Forms
        [void][Windows.Forms.MessageBox]::Show($Message, 'Sijilmassa Dental', 'OK', 'Error')
    } else { [Console]::Error.WriteLine($Message) }
}

function Invoke-ClinicBackup($Config, [string]$Mode) {
    if ($Config.backupDistribution -notmatch '^[A-Za-z0-9][A-Za-z0-9._ -]{0,80}$' -or
        $Config.backupConfig -notmatch '^/home/[^/]+/.+[^/]$' -or $Config.backupConfig -match '[\x00-\x1f]') {
        throw 'Indiquez une distribution WSL et une configuration privée sous /home.'
    }
    $prefix = @('--distribution',$Config.backupDistribution,'--exec')
    $scriptPath = Join-Path $script:WindowsDeployment 'windows-backup.sh'
    $translated = Invoke-LocalCommand wsl.exe ($prefix + @('wslpath','-a',$scriptPath))
    if ($translated.Code -ne 0 -or -not $translated.Output.Trim().StartsWith('/')) { throw 'Le dossier des scripts est inaccessible depuis WSL.' }
    $timeout = if ($Mode -eq 'run') { 1800 } elseif ($Mode -eq 'verify') { 180 } else { 30 }
    Invoke-LocalCommand wsl.exe ($prefix + @('bash',$translated.Output.Trim(),$Mode,$Config.backupConfig,
        $Config.project,$Config.release,$Config.ClinicUri.Host,[string]$Config.ClinicUri.Port)) $timeout
}
