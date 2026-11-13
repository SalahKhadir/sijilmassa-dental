[CmdletBinding()]
param([string]$ConfigPath = 'C:\SijilmassaDental\config\pilot.json')
. (Join-Path $PSScriptRoot 'SijilmassaDental.Common.ps1')

$failed = $false
try { $config = Read-PilotConfig $ConfigPath }
catch { Show-ClinicFailure $_.Exception.Message; exit 1 }
try {
    Assert-LocalDocker
    Write-Host 'Docker Desktop Linux disponible.'
    $status = Invoke-ClinicCompose $config @('ps','--all','--format','{{.Service}} {{.State}} {{.Health}}')
    if ($status.Code -ne 0) { throw 'État Compose indisponible. Vérifiez le fichier pilote.' }
    if ($status.Output.Trim()) { Write-Host $status.Output.Trim() }
    else { Write-Host 'Aucun conteneur dans ce projet.' }
} catch { $failed = $true; Show-ClinicFailure $_.Exception.Message }
try {
    Assert-TrustedCa $config
    if (-not (Test-ClinicHttps $config)) { throw 'HTTPS indisponible. Vérifiez la CA, lʼadresse et les sondes Compose.' }
    Write-Host 'HTTPS prêt. Le proxy répond au contrôle de session anonyme.'
} catch { $failed = $true; Show-ClinicFailure $_.Exception.Message }
try {
    $disk = [IO.DriveInfo]::new([IO.Path]::GetPathRoot((Assert-PrivatePath $config.dockerDiskDirectory Container 'disque Docker')))
    Write-Host ('Disque Docker déclaré · {0:N1} Gio libres.' -f ($disk.AvailableFreeSpace / 1GB))
    if ($disk.AvailableFreeSpace -lt 20GB) { Write-Warning 'Espace faible sur le disque Docker déclaré.' }
} catch { $failed = $true; Show-ClinicFailure $_.Exception.Message }
try {
    $backup = Invoke-ClinicBackup $config 'verify'
    foreach ($line in ($backup.Output -split '[\r\n]+')) {
        if ($line -match '^PASS (Last verified backup \d{8}T\d{6}Z \(UTC\), age \d+ h\. Manifest, checksum and OpenPGP envelope verified\.|Backup storage meets the free-space policy\.)$') { Write-Host $line }
    }
    if ($backup.Code -eq 2) { $failed = $true; Write-Warning 'Dernière sauvegarde vérifiée trop ancienne.' }
    elseif ($backup.Code -ne 0) { throw 'Vérification de sauvegarde en échec. Vérifiez le disque externe, le manifeste et lʼespace disponible dans WSL.' }
} catch { $failed = $true; Show-ClinicFailure $_.Exception.Message }
if ($failed) { exit 1 }
