[CmdletBinding()]
param(
    [string]$ConfigPath = 'C:\SijilmassaDental\config\pilot.json',
    [switch]$WslKeepConsole
)
. (Join-Path $PSScriptRoot 'SijilmassaDental.Common.ps1')

$failed = $false
try { $config = Read-PilotConfig $ConfigPath }
catch { Show-ClinicFailure $_.Exception.Message; exit 1 }
try {
    $version = Assert-WslRuntime -KeepConsole:$WslKeepConsole
    Assert-WslDistribution $config.backupDistribution -KeepConsole:$WslKeepConsole
    Write-Host "WSL $version et distribution utilisateur WSL 2 disponibles."
} catch { $failed = $true; Show-ClinicFailure $_.Exception.Message }
try { Assert-ClinicNetwork $config; Assert-DockerDisk $config }
catch { $failed = $true; Show-ClinicFailure $_.Exception.Message }
try {
    Assert-LocalDocker
    Assert-ClinicInputs $config
    Assert-ClinicPort $config
    $issue = Get-ClinicServiceIssue $config
    if ($issue) { throw $issue }
} catch { $failed = $true; Show-ClinicFailure $_.Exception.Message }
try {
    Assert-TrustedCa $config
    $issue = Get-ClinicHttpsIssue $config
    if ($issue) { throw $issue }
    if (-not $failed) { Write-Host 'Services sains. La page de connexion et la sonde de session répondent en HTTPS.' }
} catch { $failed = $true; Show-ClinicFailure $_.Exception.Message }
try {
    $backup = Invoke-ClinicBackup $config 'verify' -KeepConsole:$WslKeepConsole
    foreach ($line in ($backup.Output -split '[\r\n]+')) {
        if ($line -match '^PASS (Last verified backup \d{8}T\d{6}Z \(UTC\), age \d+ h\. Manifest, checksum and OpenPGP envelope verified\.|Backup storage meets the free-space policy\.)$') { Write-Host $line }
    }
    if ($backup.Code -eq 2) { $failed = $true; Write-Warning 'Dernière sauvegarde vérifiée trop ancienne.' }
    elseif ($backup.Code -ne 0) { throw 'Vérification de sauvegarde en échec. Vérifiez le disque externe, le manifeste et lʼespace disponible dans WSL.' }
} catch { $failed = $true; Show-ClinicFailure $_.Exception.Message }
if ($failed) { exit 1 }
exit 0
