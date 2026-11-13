#Requires -Version 5.1
$ErrorActionPreference = 'Stop'
$windows = Split-Path -Parent $PSScriptRoot
. (Join-Path $windows 'SijilmassaDental.Common.ps1')

function Assert($Condition, [string]$Message) {
    if (-not $Condition) { throw $Message }
}
function Assert-Rejected([scriptblock]$Action, [string]$Pattern) {
    try { $null = & $Action }
    catch {
        Assert ($_.Exception.Message -match $Pattern) "Unexpected error ($($_.Exception.Message))"
        return
    }
    throw 'An unsafe input was accepted.'
}

$files = Get-ChildItem -LiteralPath $windows -Recurse -Filter '*.ps1'
foreach ($file in $files) {
    $tokens = $null
    $errors = $null
    $null = [System.Management.Automation.Language.Parser]::ParseFile($file.FullName, [ref]$tokens, [ref]$errors)
    Assert (-not $errors) "Syntax error in $($file.Name)"
}
Assert ((ConvertTo-ClinicUri 'https://192.168.10.20').Port -eq 443) 'Expected default HTTPS port.'
Assert ((ConvertTo-ClinicUri 'https://10.0.0.20:8443/').Port -eq 8443) 'Expected explicit HTTPS port.'
foreach ($unsafe in @('http://10.0.0.2','https://127.0.0.1','https://8.8.8.8','https://10.00.0.2',
    'https://10.0.0.256','https://10.0.0.2:5432','https://10.0.0.2:99999','https://10.0.0.2/login',
    'https://10.0.0.2@other.test','https://10.0.0.2/?x=1')) {
    Assert-Rejected { ConvertTo-ClinicUri $unsafe } 'HTTPS|IPv4|port'
}
Assert ((Quote-NativeArgument 'C:\Clinic Files\') -ceq '"C:\Clinic Files\\"') 'Trailing separator was not quoted.'
Assert ((Quote-NativeArgument 'x"y') -ceq '"x\"y"') 'Literal quote was not escaped.'
Assert-Rejected { Invoke-LocalCommand 'sijilmassa-nonexistent-cli' @() } 'indisponible'
$unavailable = [pscustomobject]@{ ClinicUri = [uri]'https://127.0.0.1:1'; caSha256 = ('0' * 64) }
Assert ((Get-ClinicHttpsIssue $unavailable) -match 'pas encore prête') 'Unavailable HTTPS endpoint was accepted.'
$cli = if ($PSVersionTable.PSEdition -eq 'Desktop') { 'powershell.exe' } else { 'pwsh' }
if ($env:OS -ne 'Windows_NT') { $cli = Join-Path $PSHOME 'pwsh' }
$fixture = '[Console]::Out.Write("stdout"); [Console]::Error.Write("stderr"); exit 7'
$encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($fixture))
$native = Invoke-LocalCommand $cli @('-NoProfile','-EncodedCommand',$encoded)
Assert ($native.Code -eq 7 -and $native.Output -ceq 'stdout' -and $native.ErrorOutput -ceq 'stderr') 'Native output/exit code capture failed.'
$sleep = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes('Start-Sleep -Seconds 15'))
Assert-Rejected { Invoke-LocalCommand $cli @('-NoProfile','-EncodedCommand',$sleep) 1 } 'Délai dépassé'

$versionText = "Version WSL : 3.0.5.0`r`nVersion du noyau : 6.6.87.2"
foreach ($encoding in @([Text.Encoding]::UTF8, [Text.Encoding]::Unicode)) {
    foreach ($bom in @($false,$true)) {
        $bytes = $encoding.GetBytes($versionText)
        if ($bom) { $bytes = $encoding.GetPreamble() + $bytes }
        Assert ((ConvertFrom-WslBytes $bytes) -ceq $versionText) 'WSL output encoding failed.'
    }
}

& {
    function Invoke-LocalCommand($Name, $Arguments, $TimeoutSeconds, [switch]$KeepConsole) {
        $script:capturedConsole = [bool]$KeepConsole
        switch ($Arguments[0]) {
            '--version' { $script:wslVersion }
            '--status' { [pscustomobject]@{ Code=$script:wslStatus; Output='' } }
            '--list' { $script:wslList }
            '--distribution' { $script:wslMode }
            default { throw 'Unexpected native command.' }
        }
    }
    $script:wslVersion = [pscustomobject]@{ Code=0; Output=$versionText; ErrorOutput=''; Executable='/System32/wsl.exe' }
    $script:wslStatus = 0
    Assert ((Assert-WslRuntime) -eq [version]'3.0.5.0') 'Localized WSL version failed.'
    $script:wslVersion.Output = "WSL バージョン：2.1.5`nKernel version: 6.6.0"
    Assert ((Assert-WslRuntime -KeepConsole) -eq [version]'2.1.5') 'Minimum WSL version failed.'
    Assert $script:capturedConsole 'Console flag was lost.'
    $script:wslVersion.Output = 'WSL version: 2.1.4.0'
    Assert-Rejected { Assert-WslRuntime } 'trop ancien'
    foreach ($bad in @('', 'Kernel version: 6.6.87.2', 'WSL version: 3.0.5.broken', 'WSL version: 999999999999.0.0')) {
        $script:wslVersion.Output = $bad
        Assert-Rejected { Assert-WslRuntime } 'illisible'
    }
    $script:wslVersion.Output = ''
    $script:wslVersion.Code = 1
    Assert-Rejected { Assert-WslRuntime } 'code 1.*System32.*stdout vide, stderr vide'
    $script:wslVersion.ErrorOutput = 'secret-sentinel'
    Assert-Rejected { Assert-WslRuntime } 'stderr présent'
    try { $null = Assert-WslRuntime } catch {
        Assert ($_.Exception.Message -notmatch 'secret-sentinel') 'Diagnostic leaked native stderr.'
    }
    $script:wslVersion.Code = 0
    $script:wslVersion.Output = $versionText
    $script:wslStatus = 3
    Assert-Rejected { Assert-WslRuntime } 'wsl --status.*code 3'

    $script:wslList = [pscustomobject]@{ Code=0; Output="  NAME   STATE    VERSION`r`n* Ubuntu    Stopped    2`r`n  docker-desktop    Running    2" }
    Assert-WslDistribution Ubuntu
    Assert-Rejected { Assert-WslDistribution 'docker-desktop' } 'distribution utilisateur WSL 2'
    Assert-Rejected { Assert-WslDistribution 'Ubuntu-24.04' } 'Distribution utilisateur absente'
    $script:wslList.Output = '* Ubuntu    Stopped    1'
    Assert-Rejected { Assert-WslDistribution Ubuntu } 'WSL 1'
    $script:wslList.Output = ''
    $script:wslMode = [pscustomobject]@{ Code=0; Output='nat'; ErrorOutput='' }
    Assert-WslDistribution Ubuntu
    $script:wslMode.Output = 'wsl1'
    Assert-Rejected { Assert-WslDistribution Ubuntu } 'WSL 1'
    $script:wslMode.Code = 1
    $script:wslMode.ErrorOutput = 'Wsl/Service/WSL_E_DISTRO_NOT_FOUND'
    Assert-Rejected { Assert-WslDistribution Ubuntu } 'Distribution utilisateur absente'
    $script:wslMode.ErrorOutput = ''
    Assert-Rejected { Assert-WslDistribution Ubuntu } 'Impossible de vérifier'
}

$temp = Join-Path ([IO.Path]::GetTempPath()) ([guid]::NewGuid().ToString())
$null = New-Item -ItemType Directory -Path $temp
try {
    $path = Join-Path $temp 'pilot configuration.json'
    Assert-Rejected { Read-PilotConfig $path } 'introuvable'
    $config = Get-Content (Join-Path $windows 'pilot.example.json') -Raw | ConvertFrom-Json
    $config.release = 'latest'
    $config | ConvertTo-Json | Set-Content -LiteralPath $path
    Assert-Rejected { Read-PilotConfig $path } 'tag local'
    $config.release = 'test-release'
    $config | ConvertTo-Json | Set-Content -LiteralPath $path
    Assert-Rejected { Read-PilotConfig $path } 'IPv4'
    $config.url = 'https://192.168.1.20'
    $config | ConvertTo-Json | Set-Content -LiteralPath $path
    $accepted = Read-PilotConfig $path
    Assert ($accepted.ClinicUri.Host -eq '192.168.1.20') 'Expected pilot origin.'
    Assert-Rejected { Assert-PinnedCa $accepted } 'absente'
    $config.syntheticPilot = $false
    $config | ConvertTo-Json | Set-Content -LiteralPath $path
    Assert-Rejected { Read-PilotConfig $path } 'pilote'

    function Invoke-LocalCommand($Name, $Arguments) {
        if ($Arguments -contains 'inspect') {
            if ($Arguments -contains 'context') {
                $endpoint = if ($script:remote) { 'tcp://remote.test:2376' } else { 'npipe:////./pipe/dockerDesktopLinuxEngine' }
                return [pscustomobject]@{Code=0;Output=$endpoint}
            }
            if ($Arguments -contains 'image') { return [pscustomobject]@{Code=0;Output='sha256:fixture'} }
            return [pscustomobject]@{Code=0;Output="$script:existingImage sha256:fixture"}
        }
        [pscustomobject]@{Code=$script:dockerCode;Output=$script:dockerMode}
    }
    function Get-Command($Name, $CommandType, $ErrorAction) {
        if ($script:dockerInstalled) { [pscustomobject]@{ Source='fixture' } }
    }
    $script:dockerInstalled = $false
    Assert-Rejected { Assert-LocalDocker } 'introuvable'
    $script:dockerInstalled = $true
    $script:remote = $false
    $script:dockerCode = 0
    $script:dockerMode = 'linux'
    Assert-LocalDocker
    $script:dockerMode = 'windows'
    Assert-Rejected { Assert-LocalDocker } 'conteneurs Linux'
    $script:dockerCode = 1
    Assert-Rejected { Assert-LocalDocker } 'Docker Desktop'
    $script:remote = $true
    Assert-Rejected { Assert-LocalDocker } 'moteur local'

    function Assert-ClinicInputs($Config) {}
    function Assert-ClinicNetwork($Config) {}
    function Get-NetTCPConnection($State, $LocalPort, $ErrorAction) {
        if ($script:portInUse) { [pscustomobject]@{ LocalAddress='0.0.0.0' } }
    }
    $script:portInUse = $false
    $script:portResult = [pscustomobject]@{ Code=0; Output='192.168.1.20:443' }
    $script:serviceRows = "db running healthy`nbackend running healthy`nfrontend running healthy`nhttps running healthy"
    function Invoke-ClinicCompose($Config, $Arguments, $TimeoutSeconds) {
        if ($Arguments[0] -eq 'port') { return $script:portResult }
        if ($Arguments[0] -eq 'ps') {
            if ($Arguments -contains '--format') { return [pscustomobject]@{ Code=0; Output=$script:serviceRows } }
            $id = if ($Arguments[-1] -eq 'db') { '123456789abc' } else { '' }
            return [pscustomobject]@{Code=0;Output=$id}
        }
        $script:lastStart = $Arguments
        [pscustomobject]@{Code=$script:composeCode;Output=''}
    }
    $script:existingImage = 'localhost/sijilmassa-postgres:test-release'
    $script:composeCode = 0
    Start-ClinicServices $accepted 20
    Assert (($script:lastStart -join ' ') -eq 'up -d --no-recreate --no-build --pull never --wait --wait-timeout 20') 'Unsafe Compose flags.'
    Assert (-not (Get-ClinicServiceIssue $accepted)) 'Healthy services were rejected.'
    $script:portInUse = $true
    Assert-ClinicPort $accepted
    $script:portResult.Output = '0.0.0.0:443'
    Assert-Rejected { Start-ClinicServices $accepted 20 } 'Port HTTPS déjà occupé'
    $script:portInUse = $false
    $script:composeCode = 1
    $script:serviceRows = "db running healthy`nbackend running starting"
    Assert-Rejected { Start-ClinicServices $accepted 20 } 'pas encore prête'
    $script:serviceRows = "db running unhealthy"
    Assert-Rejected { Start-ClinicServices $accepted 20 } 'PostgreSQL en échec'
    $script:serviceRows = "db running healthy`nbackend exited"
    Assert-Rejected { Start-ClinicServices $accepted 20 } 'backend en échec'
    $script:existingImage = 'localhost/sijilmassa-postgres:other'
    Assert-Rejected { Start-ClinicServices $accepted 20 } 'autre lot'
} finally { Remove-Item -LiteralPath $temp -Recurse -Force }
Write-Host 'PASS PowerShell syntax, native capture and timeout, WSL preflight, HTTPS, config, Docker, port and Compose diagnostics (WSL and Docker mocked).'
