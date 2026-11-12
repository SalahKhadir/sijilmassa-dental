#!/usr/bin/env bash
set -euo pipefail
export LC_ALL=C
here=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=backup-common.sh
source "$here/backup-common.sh"

backup_destination "$@"
[[ -r $destination && -x $destination ]] || fail 'Backup destination is not accessible.'
check_backup_media || fail 'Configured external backup media is absent or does not match.'
max_hours=${BACKUP_MAX_AGE_HOURS:-30}
[[ $max_hours =~ ^[1-9][0-9]{0,5}$ ]] || fail 'Invalid backup age policy.'
# Bundles sort by UTC publication stamp. Do not silently fall back if the newest is corrupt.
shopt -s nullglob
bundles=("$destination"/clinic-backup-*)
(( ${#bundles[@]} )) || fail 'No published backup found.'
bundle=${bundles[-1]}
[[ -d $bundle && ! -L $bundle &&
   ${bundle##*/} =~ ^clinic-backup-([0-9]{8}T[0-9]{6}Z)-[a-zA-Z0-9]{8}$ ]] ||
    fail 'Newest backup bundle has an invalid name or location.'
stamp=${BASH_REMATCH[1]}
manifest=$bundle/manifest
archive=$bundle/database.dump.gpg
[[ -f $manifest && ! -L $manifest && -f $archive && ! -L $archive && -s $archive &&
   $(wc -c < "$manifest") -le 4096 ]] || fail 'Newest backup bundle is incomplete.'
declare -A metadata=()
while IFS='=' read -r key value || [[ -n $key ]]; do
    case $key in
        format|created_utc|release|postgres_major|flyway|archive_sha256) ;;
        *) fail 'Invalid backup manifest.' ;;
    esac
    [[ ! ${metadata[$key]+present} && -n $value ]] || fail 'Invalid backup manifest.'
    metadata[$key]=$value
done < "$manifest"
[[ ${metadata[format]:-} == 1 && ${metadata[created_utc]:-} == "$stamp" &&
   ${metadata[postgres_major]:-} =~ ^[1-9][0-9]{0,2}$ &&
   ${metadata[flyway]:-} =~ ^[0-9]+:-?[0-9]+(,[0-9]+:-?[0-9]+)*$ &&
   ${metadata[archive_sha256]:-} =~ ^[0-9a-f]{64}$ ]] || fail 'Invalid backup manifest.'
release_valid "${metadata[release]:-}" || fail 'Invalid backup manifest.'
created=$(date -u -d "${stamp:0:4}-${stamp:4:2}-${stamp:6:2} ${stamp:9:2}:${stamp:11:2}:${stamp:13:2} UTC" +%s 2>/dev/null) ||
    fail 'Invalid backup timestamp.'
age=$(( $(date -u +%s) - created ))
(( age >= 0 )) || fail 'Backup timestamp is in the future. Check the system clock.'
[[ $(archive_hash "$archive") == "${metadata[archive_sha256]}" ]] || fail 'Encrypted archive checksum mismatch.'
# List the outer OpenPGP packets without decryption or agent startup. Never show GPG output.
if ! gpg --no-options --batch --no-tty --no-autostart --no-keyring --list-only --list-packets < "$archive" 2>/dev/null |
    awk '/^:pubkey enc packet:/ { recipient=1 } /^:encrypted data packet:/ { encrypted=1 }
         /^:aead encrypted packet:/ { encrypted=protected=1 } /mdc_method: [1-9]/ { protected=1 }
         END { exit !(recipient && encrypted && protected) }'; then
    fail 'Archive is not a supported integrity-protected OpenPGP backup.'
fi
check_backup_media || fail 'Configured external backup media disappeared during verification.'
printf 'PASS Last verified backup %s (UTC), age %s h. Manifest, checksum and OpenPGP envelope verified.\n' "$stamp" "$(( age / 3600 ))"
check_backup_space
printf 'PASS Backup storage meets the free-space policy.\n'
if (( age > max_hours * 3600 )); then
    printf 'WARNING Backup exceeds the %s h freshness policy.\n' "$max_hours" >&2
    exit 2
fi
