[CmdletBinding()]
param(
    [string]$ConfigPath = 'C:\SijilmassaDental\config\pilot.json',
    [switch]$WslKeepConsole,
    [switch]$ValidateOnly
)
. (Join-Path $PSScriptRoot 'SijilmassaDental.Common.ps1')

# The operator prepares this private directory. Only fixed status text is recorded.
$logDirectory = Join-Path (Split-Path -Parent (Split-Path -Parent ([IO.Path]::GetFullPath($ConfigPath)))) 'logs'
if (-not (Test-Path -LiteralPath $logDirectory -PathType Container)) {
    [Console]::Error.WriteLine('Préparez le dossier privé logs avant de planifier cette commande.')
    exit 1
}
$exitCode = 1
try {
    $config = Read-PilotConfig $ConfigPath
    $mode = if ($ValidateOnly) { 'check' } else { 'run' }
    $result = Invoke-ClinicBackup $config $mode -KeepConsole:$WslKeepConsole
    if ($result.Code -ne 0) {
        if ($result.Output -match 'External backup media is unavailable|external backup media is absent|External media is unavailable') {
            throw 'Support externe absent ou non reconnu.'
        }
        if ($result.Output -match 'already running') { throw 'Une sauvegarde est déjà en cours.' }
        throw 'Sauvegarde indisponible. Vérifiez le disque, la clé publique, WSL et Docker Desktop.'
    }
    $message = if ($ValidateOnly) { 'Configuration sauvegarde vérifiée.' } else { 'Sauvegarde chiffrée terminée.' }
    $exitCode = 0
} catch { $message = $_.Exception.Message }
Add-Content -LiteralPath (Join-Path $logDirectory 'backup.log') -Encoding UTF8 -Value (
    '{0:yyyy-MM-ddTHH:mm:ssZ} exit={1} {2}' -f [DateTime]::UtcNow, $exitCode, $(if ($exitCode) { 'Échec sauvegarde ou validation.' } else { $message }))
if ($exitCode) { Show-ClinicFailure $message } else { Write-Host $message }
exit $exitCode
