[CmdletBinding()]
param(
    [string]$ConfigPath = 'C:\SijilmassaDental\config\pilot.json',
    [ValidateRange(20,300)][int]$WaitSeconds = 150,
    [switch]$NoBrowser,
    [switch]$WaitForDocker,
    [switch]$Dialog
)
. (Join-Path $PSScriptRoot 'SijilmassaDental.Common.ps1')

try {
    $config = Read-PilotConfig $ConfigPath
    Assert-TrustedCa $config
    if (-not (Test-ClinicHttps $config)) {
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
        Start-ClinicServices $config $WaitSeconds
        $deadline = [DateTime]::UtcNow.AddSeconds(20)
        do {
            if (Test-ClinicHttps $config) { break }
            if ([DateTime]::UtcNow -ge $deadline) {
                throw 'Les conteneurs répondent mais HTTPS nʼest pas prêt. Vérifiez la CA, le certificat, lʼIPv4 et lʼétat des services.'
            }
            Start-Sleep -Seconds 2
        } while ($true)
    }
    if (-not $NoBrowser) { Start-Process $config.ClinicUri.AbsoluteUri }
} catch { Show-ClinicFailure $_.Exception.Message -Dialog:$Dialog; exit 1 }
