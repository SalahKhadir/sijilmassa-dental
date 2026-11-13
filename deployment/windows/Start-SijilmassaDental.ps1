[CmdletBinding()]
param(
    [string]$ConfigPath = 'C:\SijilmassaDental\config\pilot.json',
    [ValidateRange(20,300)][int]$WaitSeconds = 150,
    [switch]$NoBrowser,
    [switch]$WslKeepConsole,
    [switch]$WaitForDocker,
    [switch]$Dialog
)
. (Join-Path $PSScriptRoot 'SijilmassaDental.Common.ps1')

try {
    $config = Read-PilotConfig $ConfigPath
    $null = Assert-WslRuntime -KeepConsole:$WslKeepConsole
    Assert-WslDistribution $config.backupDistribution -KeepConsole:$WslKeepConsole
    if ($WaitForDocker) {
        $deadline = [DateTime]::UtcNow.AddSeconds($WaitSeconds)
        do {
            try { Assert-LocalDocker; break }
            catch {
                if ([DateTime]::UtcNow -ge $deadline) { throw }
                Start-Sleep -Seconds 3
            }
        } while ($true)
    } else { Assert-LocalDocker }
    Assert-TrustedCa $config
    Start-ClinicServices $config $WaitSeconds
    $deadline = [DateTime]::UtcNow.AddSeconds(20)
    do {
        $issue = Get-ClinicHttpsIssue $config
        if (-not $issue) { break }
        if ([DateTime]::UtcNow -ge $deadline) { throw $issue }
        Start-Sleep -Seconds 2
    } while ($true)
    if (-not $NoBrowser) { Start-Process $config.ClinicUri.AbsoluteUri }
} catch { Show-ClinicFailure $_.Exception.Message -Dialog:$Dialog; exit 1 }
exit 0
