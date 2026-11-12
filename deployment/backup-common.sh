#!/usr/bin/env bash
# Sourced by the backup and restore commands.
: "${here:?Caller must set the deployment directory}"
fail() { printf '%s\n' "$*" >&2; exit 1; }
private_value() {
    local file=$1 key=$2 mode value repo
    repo=$(realpath -e -- "$here/..")
    [[ $file = /* && -f $file && ! -L $file ]] || fail "Missing private env file for $key."
    file=$(realpath -e -- "$file")
    [[ $file != "$repo/"* ]] || fail 'Store database secrets outside the repository.'
    mode=$(stat -c '%a' -- "$file")
    (( (8#$mode & 077) == 0 )) || fail "Restrict the $key file to its owner."
    value=$(cat -- "$file")
    [[ $value == "$key="* && $value != *$'\n'* ]] ||
        fail "The $key file must contain one non-empty password of at least 24 characters."
    (( ${#value} >= ${#key} + 25 )) || fail "Use at least 24 characters for $key."
    printf '%s' "${value#*=}"
}
check_private_db_envs() {
    local app_secret admin_secret
    app_secret=$(private_value "${CLINIC_DB_PASSWORD_FILE:-}" DB_PASSWORD) || exit 1
    admin_secret=$(private_value "${CLINIC_PG_ADMIN_FILE:-}" POSTGRES_PASSWORD) || exit 1
    [[ $app_secret != "$admin_secret" ]] || fail 'Use distinct application and database administrator passwords.'
}
release_valid() { [[ $1 =~ ^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$ ]]; }
# Used by backup.sh and restore.sh.
# shellcheck disable=SC2034
readonly postgres_major=17
db_name=sijilmassa
pg_query() {
    local sql=$1
    shift
    "$@" psql -X -qAt --no-password --set=ON_ERROR_STOP=1 \
        --host=/var/run/postgresql --username=postgres --dbname="$db_name" --command "$sql" 2>/dev/null
}
flyway_state() {
    local sql
    sql="SELECT CASE WHEN bool_and(success AND checksum IS NOT NULL) THEN
          string_agg(version || ':' || checksum::text, ',' ORDER BY installed_rank) END
          FROM public.flyway_schema_history WHERE version IS NOT NULL;"
    pg_query "$sql" "$@"
}
major_state() {
    local sql="SELECT current_setting('server_version_num')::integer / 10000;"
    pg_query "$sql" "$@"
}
expected_flyway() {
    local state=$1
    [[ $state =~ ^[0-9]+:-?[0-9]+(,[0-9]+:-?[0-9]+)*$ ]] || return 1
    local migration expected
    expected=$(for migration in "$here"/../backend/src/main/resources/db/migration/V*__*.sql; do
        migration=${migration##*/V}
        printf '%s\n' "${migration%%__*}"
    done | sort -n | paste -sd, -)
    [[ $(sed -E 's/:-?[0-9]+//g' <<<"$state") == "$expected" ]]
}
archive_hash() { sha256sum < "$1" | cut -d ' ' -f 1; }

backup_destination() {
    [[ $# == 1 || $# == 4 ]] || fail 'Provide DESTINATION [--external MOUNTPOINT MEDIA_ID].'
    local repo
    [[ $1 = /* && -d $1 ]] || fail 'Backup destination must be an existing absolute directory.'
    destination=$(realpath -e -- "$1")
    repo=$(realpath -e -- "$here/..")
    [[ $destination != "$repo" && $destination != "$repo/"* ]] || fail 'Choose a backup destination outside the repository.'
    mountpoint=
    media_id=
    if [[ $# == 4 ]]; then
        [[ $2 == --external && $3 = /* && -d $3 && $4 =~ ^[a-zA-Z0-9._-]{1,80}$ ]] || fail 'Invalid external backup destination.'
        mountpoint=$(realpath -e -- "$3")
        media_id=$4
        [[ $mountpoint != / && ( $destination == "$mountpoint" || $destination == "$mountpoint/"* ) ]] ||
            fail 'Destination must be on the configured external filesystem.'
    fi
}
check_backup_media() {
    [[ -z $mountpoint ]] || {
        findmnt -rn --mountpoint "$mountpoint" >/dev/null &&
        [[ -f $mountpoint/.sijilmassa-backup-media && ! -L $mountpoint/.sijilmassa-backup-media &&
           $(cat -- "$mountpoint/.sijilmassa-backup-media") == "$media_id" ]];
    }
}
check_backup_recipient() {
    : "${BACKUP_RECIPIENT:?Set the full operator-verified GPG recipient fingerprint}"
    [[ $BACKUP_RECIPIENT =~ ^([[:xdigit:]]{40}|[[:xdigit:]]{64})$ ]] || fail 'Use a complete GPG fingerprint.'
    if ! gpg --batch --with-colons --fingerprint --list-keys "$BACKUP_RECIPIENT" 2>/dev/null |
        awk -F: -v expected="${BACKUP_RECIPIENT^^}" '$1 == "fpr" && toupper($10) == expected { ok=1 } END { exit !ok }'; then
        fail 'The configured GPG recipient key is unavailable.'
    fi
}
check_backup_public_keyring() {
    [[ ${GNUPGHOME:-} = /* && -d $GNUPGHOME && -r $GNUPGHOME && -x $GNUPGHOME ]] ||
        fail 'Set GNUPGHOME to an accessible absolute backup keyring directory.'
    check_backup_recipient
    gpg --batch --no-tty --no-autostart --no-random-seed-file --no-auto-check-trustdb \
        --trust-model always --recipient "$BACKUP_RECIPIENT" \
        --output - --encrypt </dev/null >/dev/null 2>&1 || fail 'The backup recipient cannot encrypt.'
}
check_backup_space() {
    local min_free available
    min_free=${BACKUP_MIN_FREE_KIB:-1048576}
    [[ $min_free =~ ^[1-9][0-9]{0,11}$ ]] || fail 'Invalid backup disk-space threshold.'
    available=$(df -Pk -- "$destination" | awk 'END { print $4 }')
    [[ $available =~ ^[0-9]+$ ]] || fail 'Cannot determine the free space for a backup.'
    (( available >= min_free )) || fail 'Insufficient free space for a backup.'
}
