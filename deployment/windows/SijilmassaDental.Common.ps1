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
    param([string]$Name, [string[]]$Arguments, [int]$TimeoutSeconds = 15, [switch]$KeepConsole)
    $isWsl = $Name -eq 'wsl.exe'
    $command = Get-Command $Name -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $command) {
        if ($isWsl) { throw 'WSL indisponible. Vérifiez wsl.exe dans Windows PowerShell 64 bits.' }
        throw "Commande indisponible ($Name). Consultez le guide Windows."
    }
    $info = New-Object System.Diagnostics.ProcessStartInfo
    $info.FileName = $command.Source
    $info.Arguments = ($Arguments | ForEach-Object { Quote-NativeArgument $_ }) -join ' '
    $info.UseShellExecute = $false
    $info.CreateNoWindow = -not $KeepConsole
    if ($isWsl) {
        # Microsoft uses this setting for redirected WSL diagnostics. Scope it to the child.
        $info.EnvironmentVariables['WSL_UTF8'] = '1'
    }
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    try { $process = [System.Diagnostics.Process]::Start($info) }
    catch { throw "Impossible de lancer $Name. Vérifiez le chemin de lʼexécutable et les droits du compte." }
    $stdout = $null
    $stderr = $null
    try {
        if ($isWsl) {
            $stdout = [IO.MemoryStream]::new()
            $stderr = [IO.MemoryStream]::new()
            $output = $process.StandardOutput.BaseStream.CopyToAsync($stdout)
            $errors = $process.StandardError.BaseStream.CopyToAsync($stderr)
        } else {
            $output = $process.StandardOutput.ReadToEndAsync()
            $errors = $process.StandardError.ReadToEndAsync()
        }
        if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
            try { $process.Kill() } catch { }
            throw "Délai dépassé ($Name). Vérifiez lʼétat des services avant de réessayer."
        }
        if (-not $output.Wait(1000) -or -not $errors.Wait(1000)) { throw "Sortie indisponible ($Name)." }
        [pscustomobject]@{
            Code = $process.ExitCode
            Output = if ($isWsl) { ConvertFrom-WslBytes $stdout.ToArray() } else { $output.Result }
            ErrorOutput = if ($isWsl) { ConvertFrom-WslBytes $stderr.ToArray() } else { $errors.Result }
            Executable = $command.Source
        }
    } finally {
        $process.Dispose()
        if ($stdout) { $stdout.Dispose() }
        if ($stderr) { $stderr.Dispose() }
    }
}

function ConvertFrom-WslBytes([byte[]]$Bytes) {
    # WSL can still return UTF-16LE without a BOM (notably table output).
    if ($Bytes.Length -ge 2 -and (($Bytes[0] -eq 255 -and $Bytes[1] -eq 254) -or
        ($Bytes.Length % 2 -eq 0 -and [Array]::IndexOf($Bytes, [byte]0) -ge 0))) {
        return [Text.Encoding]::Unicode.GetString($Bytes).TrimStart([char]0xFEFF)
    }
    [Text.Encoding]::UTF8.GetString($Bytes).TrimStart([char]0xFEFF)
}

function Assert-WslRuntime([switch]$KeepConsole) {
    if ([Environment]::Is64BitOperatingSystem -and -not [Environment]::Is64BitProcess) {
        throw 'Ouvrez Windows PowerShell 64 bits pour accéder à WSL depuis System32.'
    }
    $result = Invoke-LocalCommand wsl.exe @('--version') -KeepConsole:$KeepConsole
    if ($result.Code -ne 0) {
        $out = if ([string]::IsNullOrWhiteSpace($result.Output)) { 'vide' } else { 'présent' }
        $err = if ([string]::IsNullOrWhiteSpace($result.ErrorOutput)) { 'vide' } else { 'présent' }
        $location = Split-Path -Leaf (Split-Path -Parent $result.Executable)
        throw "wsl --version a échoué (code $($result.Code), exécutable dans $location, stdout $out, stderr $err). Comparez avec la console et suivez le dépannage WSL du guide."
    }
    $line = ($result.Output.Trim() -split '[\r\n]+')[0]
    $version = [version]'0.0'
    if ($line -notmatch '^\s*[^:：\r\n]*WSL[^:：\r\n]*[:：]\s*([0-9]+\.[0-9]+\.[0-9]+(?:\.[0-9]+)?)\s*$' -or
        -not [version]::TryParse($Matches[1], [ref]$version)) {
        throw 'Version WSL illisible. Comparez la première ligne de wsl --version dans la console avec le guide.'
    }
    if ($version -lt [version]'2.1.5') { throw "WSL $version est trop ancien. Installez une version 2.1.5 ou ultérieure." }
    $status = Invoke-LocalCommand wsl.exe @('--status') -KeepConsole:$KeepConsole
    if ($status.Code -ne 0) { throw "wsl --status a échoué (code $($status.Code)). Vérifiez lʼétat de WSL depuis la console." }
    $version
}

function Assert-WslDistribution([string]$Distribution, [switch]$KeepConsole) {
    if ($Distribution -notmatch '^[A-Za-z0-9][A-Za-z0-9._ -]{0,80}$' -or $Distribution -like 'docker-desktop*') {
        throw 'Indiquez le nom exact de la distribution utilisateur WSL 2 prévue pour la sauvegarde.'
    }
    $list = Invoke-LocalCommand wsl.exe @('--list','--verbose') -KeepConsole:$KeepConsole
    $inventory = $list.Output.Trim()
    $row = '(?im)^[ \t]*(?:\*[ \t]*)?' + [regex]::Escape($Distribution) + '[ \t]{2,}[^\r\n]+?[ \t]+([12])[ \t]*\r?$'
    if ($list.Code -eq 0 -and $inventory -match $row) {
        if ($Matches[1] -ne '2') { throw "La distribution $Distribution utilise WSL 1. Vérifiez sa migration vers WSL 2 avec lʼinstallateur." }
        return
    }
    if ($list.Code -eq 0 -and ($inventory -split '[\r\n]+' | Where-Object { $_ -match '[ \t]{2,}[12]\s*$' })) {
        throw "Distribution utilisateur absente ($Distribution). Vérifiez son nom avec wsl --list --verbose."
    }
    # Some WSL 3.x builds return an empty list under redirection. Ask the
    # selected distribution for its networking mode instead of trusting Docker.
    $mode = Invoke-LocalCommand wsl.exe @('--distribution',$Distribution,'--exec','wslinfo','--networking-mode') 30 -KeepConsole:$KeepConsole
    $modeName = $mode.Output.Trim()
    if ($mode.Code -eq 0 -and $modeName -match '^(nat|mirrored|bridged|virtioproxy|consomme|none)$') { return }
    if ($mode.Code -eq 0 -and $modeName -eq 'wsl1') { throw "La distribution $Distribution utilise WSL 1." }
    if ("$($mode.Output) $($mode.ErrorOutput)" -match 'WSL_E_DISTRO_NOT_FOUND|WSL_E_DEFAULT_DISTRO_NOT_FOUND') {
        throw "Distribution utilisateur absente ($Distribution). Vérifiez son nom avec wsl --list --verbose."
    }
    throw "Impossible de vérifier la distribution $Distribution (liste code $($list.Code), wslinfo code $($mode.Code)). Vérifiez wsl --list --verbose dans la console."
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
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw 'Configuration du pilote introuvable. Suivez la création de pilot.json dans le guide sur site.' }
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

function Get-ClinicHttpsIssue($Config) {
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
            bool rejectedCertificate = false;
            request.ServerCertificateValidationCallback = (sender, cert, chain, errors) => {
                if (errors != SslPolicyErrors.None || chain == null || chain.ChainElements.Count == 0) {
                    rejectedCertificate = true;
                    return false;
                }
                var anchor = chain.ChainElements[chain.ChainElements.Count - 1].Certificate;
                using (var sha = SHA256.Create()) {
                    bool matches = String.Equals(BitConverter.ToString(sha.ComputeHash(anchor.RawData)).Replace("-", ""),
                                         root, StringComparison.OrdinalIgnoreCase);
                    rejectedCertificate = !matches;
                    return matches;
                }
            };
            try {
                using (var response = (HttpWebResponse)request.GetResponse()) return (int)response.StatusCode;
            } catch (WebException exception) {
                if (rejectedCertificate || exception.Status == WebExceptionStatus.TrustFailure) return -2;
                using (var response = exception.Response as HttpWebResponse)
                    return response == null ? -1 : (int)response.StatusCode;
            }
        }
    }
}
'@
    }
    $origin = $Config.ClinicUri.GetLeftPart([UriPartial]::Authority)
    $session = [Sijilmassa.PilotHttps]::Status("$origin/api/v1/auth/me", $Config.caSha256)
    $login = if ($session -eq 401) { [Sijilmassa.PilotHttps]::Status("$origin/login", $Config.caSha256) }
    if ($session -eq -2 -or $login -eq -2) {
        return 'Certificat HTTPS rejeté. Vérifiez la CA épinglée, lʼIPv4 du certificat et ses dates de validité.'
    }
    if ($session -ne 401 -or $login -ne 200) {
        return 'Application pas encore prête en HTTPS. Vérifiez les services et lʼadresse du pilote.'
    }
}

function Assert-LocalDocker {
    if (-not (Get-Command docker.exe -CommandType Application -ErrorAction SilentlyContinue)) {
        throw 'Docker Desktop ou sa commande docker.exe est introuvable. Vérifiez lʼinstallation et rouvrez PowerShell.'
    }
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
        throw 'Le moteur Linux Docker Desktop est indisponible. Ouvrez Docker Desktop et attendez le démarrage du moteur WSL 2.'
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

function Assert-ClinicFiles($Config) {
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
}

function Assert-ClinicInputs($Config) {
    Assert-ClinicFiles $Config
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
    if (-not $ip -or $ip.AddressState -ne 'Preferred') { throw 'LʼIPv4 du pilote doit être affectée et disponible sur ce PC.' }
    $network = Get-NetConnectionProfile -InterfaceIndex $ip.InterfaceIndex
    if ($network.NetworkCategory -ne 'Private') { throw 'Utilisez le réseau privé approuvé du cabinet.' }
    $firewall = Get-NetFirewallProfile -Name Private
    if ([string]$firewall.Enabled -ne 'True') { throw 'Le pare-feu du profil privé doit être actif.' }
}

function Assert-DockerDisk($Config) {
    $directory = Assert-PrivatePath $Config.dockerDiskDirectory Container 'disque Docker Desktop'
    $disk = [IO.DriveInfo]::new([IO.Path]::GetPathRoot($directory))
    if ($disk.DriveType -ne 'Fixed' -or $disk.AvailableFreeSpace -lt 20GB) {
        throw 'Prévoyez un disque fixe hors synchronisation avec 20 Gio libres pour le pilote.'
    }
}

function Assert-ClinicPort($Config) {
    $listeners = @(Get-NetTCPConnection -State Listen -LocalPort $Config.ClinicUri.Port -ErrorAction SilentlyContinue |
        Where-Object { $_.LocalAddress -in @('0.0.0.0','::',$Config.ClinicUri.Host) })
    if ($listeners.Count) {
        $port = Invoke-ClinicCompose $Config @('port','https','443')
        if ($port.Code -ne 0 -or $port.Output.Trim() -ne "$($Config.ClinicUri.Host):$($Config.ClinicUri.Port)") {
            throw 'Port HTTPS déjà occupé. Identifiez le service à lʼécoute ou choisissez un port libre dans pilot.json.'
        }
    }
}

function Get-ClinicServiceIssue($Config) {
    $status = Invoke-ClinicCompose $Config @('ps','--all','--format','{{.Service}} {{.State}} {{.Health}}')
    if ($status.Code -ne 0) { return 'État Compose indisponible. Vérifiez le moteur et la configuration du pilote.' }
    $rows = $status.Output -split '[\r\n]+'
    $pending = @()
    foreach ($service in @('db','backend','frontend','https')) {
        $label = if ($service -eq 'db') { 'PostgreSQL' } else { $service }
        $row = $rows | Where-Object { $_ -match "^$service\s" } | Select-Object -First 1
        if ($row -match "^$service\s+(?:exited|dead|restarting)\b" -or $row -match '\bunhealthy\s*$') {
            return "$label en échec. Consultez son état dans Docker Desktop avec lʼinstallateur."
        }
        if ($row -notmatch "^$service\s+running\s+healthy\s*$") { $pending += $label }
    }
    if ($pending.Count) { return "Application pas encore prête. Services en attente : $($pending -join ', ')." }
}

function Start-ClinicServices($Config, [int]$WaitSeconds) {
    Assert-ClinicNetwork $Config
    Assert-ClinicInputs $Config
    Assert-ClinicPort $Config
    $services = [ordered]@{ db='postgres'; backend='backend'; frontend='frontend'; https='https' }
    foreach ($service in $services.Keys) {
        $existing = Invoke-ClinicCompose $Config @('ps','--all','--quiet',$service)
        if ($existing.Code -ne 0) { throw 'Impossible de vérifier les conteneurs existants.' }
        $ids = @($existing.Output.Trim() -split '[\r\n]+' | Where-Object { $_ })
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
    if ($start.Code -ne 0) {
        Assert-ClinicPort $Config
        $issue = Get-ClinicServiceIssue $Config
        if ($issue) { throw $issue }
        throw 'Le démarrage Compose a échoué. Consultez Docker Desktop avec lʼinstallateur.'
    }
}

function Show-ClinicFailure([string]$Message, [switch]$Dialog) {
    if ($Dialog) {
        Add-Type -AssemblyName System.Windows.Forms
        [void][Windows.Forms.MessageBox]::Show($Message, 'Sijilmassa Dental', 'OK', 'Error')
    } else { [Console]::Error.WriteLine($Message) }
}

function Invoke-ClinicBackup($Config, [string]$Mode, [switch]$KeepConsole) {
    if ($Config.backupDistribution -notmatch '^[A-Za-z0-9][A-Za-z0-9._ -]{0,80}$' -or
        $Config.backupConfig -notmatch '^/home/[^/]+/.+[^/]$' -or $Config.backupConfig -match '[\x00-\x1f]') {
        throw 'Indiquez une distribution WSL et une configuration privée sous /home.'
    }
    $prefix = @('--distribution',$Config.backupDistribution,'--exec')
    $scriptPath = Join-Path $script:WindowsDeployment 'windows-backup.sh'
    $translated = Invoke-LocalCommand wsl.exe ($prefix + @('wslpath','-a',$scriptPath)) -KeepConsole:$KeepConsole
    if ($translated.Code -ne 0 -or -not $translated.Output.Trim().StartsWith('/')) { throw 'Le dossier des scripts est inaccessible depuis WSL.' }
    $timeout = if ($Mode -eq 'run') { 1800 } elseif ($Mode -eq 'verify') { 180 } else { 30 }
    Invoke-LocalCommand wsl.exe ($prefix + @('bash',$translated.Output.Trim(),$Mode,$Config.backupConfig,
        $Config.project,$Config.release,$Config.ClinicUri.Host,[string]$Config.ClinicUri.Port)) $timeout -KeepConsole:$KeepConsole
}
