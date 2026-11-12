#!/usr/bin/env bash
set -euo pipefail
umask 077
here=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=backup-common.sh
source "$here/backup-common.sh"

backup_destination "$@"
check_backup_media || fail 'Configured external backup media is absent or does not match.'
check_backup_recipient
check_backup_space
# Serialize manual and scheduled jobs using the same private clinic configuration directory.
[[ ${CLINIC_ENV_FILE:-} = /* && -f $CLINIC_ENV_FILE ]] || fail 'Set CLINIC_ENV_FILE to the absolute local configuration path.'
config_file=$(realpath -e -- "$CLINIC_ENV_FILE")
exec 8<"${config_file%/*}"
flock -n 8 || fail 'Another backup is running for this clinic configuration.'
# Lock the opened destination directory itself. No lock file can follow a symlink.
exec 9<"$destination"
flock -n 9 || fail 'Another backup is writing to this destination.'

compose=("$here/clinic.sh" exec -T --user postgres db)
release=$("$here/clinic.sh" exec -T backend printenv CLINIC_RELEASE 2>/dev/null) || fail 'Cannot identify the running clinic release.'
release_valid "$release" || fail 'Invalid running clinic release.'
major=$(major_state "${compose[@]}") || fail 'Database connectivity check failed.'
[[ $major == "$postgres_major" ]] || fail 'Unexpected PostgreSQL major version.'
before=$(flyway_state "${compose[@]}") || fail 'Flyway history is unavailable.'
expected_flyway "$before" || fail 'Flyway history does not match the deployment migration inventory.'
stamp=$(date -u +%Y%m%dT%H%M%SZ)
staged=$(mktemp -d -- "$destination/.clinic-backup-${stamp}-XXXXXXXX")
trap 'rm -rf -- "$staged"' EXIT
trap 'exit 143' TERM
trap 'exit 130' INT
archive=$staged/database.dump.gpg
if ! "${compose[@]}" pg_dump --no-password --host=/var/run/postgresql --username=postgres \
        --format=custom --no-owner --no-privileges --no-comments --lock-wait-timeout=15s --dbname="$db_name" 2>/dev/null |
    gpg --batch --no-tty --trust-model always --recipient "$BACKUP_RECIPIENT" --output "$archive" --encrypt 2>/dev/null; then
    fail 'Backup failed during PostgreSQL export or encryption. Prior backups are untouched.'
fi
[[ -s $archive ]] || fail 'The encrypted archive is empty.'
after=$(flyway_state "${compose[@]}") || fail 'Cannot recheck Flyway after export.'
[[ $before == "$after" ]] || fail 'Flyway changed during the backup. Retry after maintenance.'
hash=$(archive_hash "$archive") || fail 'Cannot checksum the encrypted archive.'
printf 'format=1\ncreated_utc=%s\nrelease=%s\npostgres_major=%s\nflyway=%s\narchive_sha256=%s\n' \
    "$stamp" "$release" "$major" "$before" "$hash" > "$staged/manifest"
check_backup_media || fail 'External media became unavailable during backup.'
sync -f -- "$staged"
name=${staged##*/}
published="$destination/${name#.}"
mv -T --no-clobber -- "$staged" "$published"
[[ ! -e $staged ]] || fail 'Backup name already exists.'
sync -f -- "$destination"
printf 'Encrypted backup complete: %s\n' "$published"
