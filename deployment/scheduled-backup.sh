#!/usr/bin/env bash
set -euo pipefail
here=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=backup-common.sh
source "$here/backup-common.sh"
[[ $# == 0 || ( $# == 1 && ( $1 == --check || $1 == --check-storage ) ) ]] ||
    fail 'Usage: scheduled-backup.sh [--check|--check-storage]'
args=("${BACKUP_DESTINATION:-}")
if [[ -n ${BACKUP_MOUNTPOINT:-} || -n ${BACKUP_MEDIA_ID:-} ]]; then
    args+=(--external "${BACKUP_MOUNTPOINT:-}" "${BACKUP_MEDIA_ID:-}")
fi
if [[ $# == 1 ]]; then
    backup_destination "${args[@]}"
    [[ -r $destination && -w $destination && -x $destination ]] || fail 'Backup destination is not writable.'
    check_backup_media || fail 'Configured external backup media is absent or does not match.'
    check_backup_space
    check_backup_public_keyring
    if [[ $1 == --check ]]; then
        [[ ${CLINIC_DEPLOYMENT_DIR:-} = /* && -d $CLINIC_DEPLOYMENT_DIR &&
           $(realpath -e -- "$CLINIC_DEPLOYMENT_DIR") == "$here" ]] ||
            fail 'Set CLINIC_DEPLOYMENT_DIR to the directory containing the scheduled backup script.'
        "$here/clinic.sh" config --quiet >/dev/null 2>&1 || fail 'Clinic configuration or Compose is unavailable.'
    fi
    printf 'PASS Backup job configuration validated.\n'
    exit
fi
# Logs contain fixed status messages only. Preserve failure status for systemd.
if output=$("$here/backup.sh" "${args[@]}" 2>&1); then
    printf 'PASS Scheduled encrypted backup completed.\n'
elif [[ $output == *'external backup media'* || $output == *'External media'* ||
        ( -n ${BACKUP_MOUNTPOINT:-} && ( $output == *'Backup destination must be an existing absolute directory.'* ||
                                       $output == *'Invalid external backup destination.'* ) ) ]]; then
    fail 'Scheduled backup failed. External backup media is unavailable or does not match.'
elif [[ $output == *'Another backup is '* ]]; then
    fail 'Scheduled backup failed. A backup is already running.'
else
    fail 'Scheduled backup failed. Check the configuration, free space and local service health.'
fi
