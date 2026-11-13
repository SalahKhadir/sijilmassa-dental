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
Assert (-not (Test-ClinicHttps $unavailable)) 'Unavailable HTTPS endpoint was accepted.'

$temp = Join-Path ([IO.Path]::GetTempPath()) ([guid]::NewGuid().ToString())
$null = New-Item -ItemType Directory -Path $temp
try {
    $path = Join-Path $temp 'pilot configuration.json'
    Assert-Rejected { Read-PilotConfig $path } 'introuvable'
    $config = Get-Content (Join-Path $windows 'pilot.example.json') -Raw | ConvertFrom-Json
    $config.release = 'test-release'
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
    function Invoke-ClinicCompose($Config, $Arguments, $TimeoutSeconds) {
        if ($Arguments[0] -eq 'ps') {
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
    $script:composeCode = 1
    Assert-Rejected { Start-ClinicServices $accepted 20 } 'services ne sont pas prêts'
    $script:existingImage = 'localhost/sijilmassa-postgres:other'
    Assert-Rejected { Start-ClinicServices $accepted 20 } 'autre lot'
} finally { Remove-Item -LiteralPath $temp -Recurse -Force }
Write-Host 'PASS PowerShell syntax, HTTPS inputs, quoting, config, Docker and Compose branches (portable tests, Docker mocked).'
