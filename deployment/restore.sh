#!/usr/bin/env bash
set -euo pipefail
umask 077
here=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=backup-common.sh
source "$here/backup-common.sh"

[[ $# == 5 && $4 == --confirm && $2 == "$5" ]] ||
    fail 'Usage: restore.sh BUNDLE clinic-recovery-NAME EXPECTED_RELEASE --confirm clinic-recovery-NAME'
[[ $1 = /* && -d $1 && ! -L $1 ]] || fail 'Choose an absolute backup bundle directory.'
target=$2
release=$3
[[ $target =~ ^clinic-recovery-[a-z0-9][a-z0-9-]{0,39}$ ]] || fail 'Invalid recovery name.'
release_valid "$release" || fail 'Invalid expected release.'
bundle=$(realpath -e -- "$1")
archive="$bundle/database.dump.gpg"
manifest="$bundle/manifest"
[[ -f $archive && ! -L $archive && -s $archive && -f $manifest && ! -L $manifest &&
   $(wc -c < "$manifest") -le 4096 ]] || fail 'Backup bundle is incomplete.'
setting() {
    local value
    value=$(sed -n "s/^$1=//p" "$manifest")
    [[ -n $value && $value != *$'\n'* ]] || fail 'Invalid backup manifest.'
    printf '%s' "$value"
}
format=$(setting format)
saved_release=$(setting release)
major=$(setting postgres_major)
saved_flyway=$(setting flyway)
saved_hash=$(setting archive_sha256)
[[ $format == 1 && $saved_release == "$release" && $major == "$postgres_major" ]] ||
    fail 'Backup release or PostgreSQL version does not match the requested recovery.'
expected_flyway "$saved_flyway" || fail 'Use the matching release with the same Flyway migration inventory.'
[[ $saved_hash =~ ^[0-9a-f]{64}$ && $(archive_hash "$archive") == "$saved_hash" ]] || fail 'Encrypted archive checksum mismatch.'

check_private_db_envs
# run owns an entirely new name, network namespace and anonymous volume. Existing targets are never used.
id=$(docker run --detach --pull=never --network none --name "$target" --label sijilmassa.recovery=isolated \
    --env-file "$CLINIC_DB_PASSWORD_FILE" --env-file "$CLINIC_PG_ADMIN_FILE" \
    --env POSTGRES_DB="$db_name" --env POSTGRES_USER=postgres --env POSTGRES_HOST_AUTH_METHOD=scram-sha-256 \
    --env TZ=UTC --env PGTZ=UTC \
    "localhost/sijilmassa-postgres:$release" 2>/dev/null) || fail 'Cannot create a fresh isolated recovery container. No existing target was used.'
ready=false
for ((i=0; i<90; i++)); do
    if docker exec "$id" pg_isready -h 127.0.0.1 -U postgres -d "$db_name" >/dev/null 2>&1; then
        ready=true
        break
    fi
    sleep 1
done
[[ $ready == true ]] || fail "Recovery container $target is unavailable. Leave its volume isolated."
if ! gpg --batch --no-tty --decrypt "$archive" 2>/dev/null |
    docker exec -i --user postgres "$id" pg_restore --no-password --exit-on-error --single-transaction \
        --no-owner --no-privileges --role=clinic_app --host=/var/run/postgresql --username=postgres --dbname="$db_name" 2>/dev/null; then
    fail "Recovery failed. Leave $target isolated and use a fresh recovery name for another attempt."
fi
actual=$(flyway_state docker exec --user postgres "$id") || fail "Cannot verify Flyway in $target."
[[ $actual == "$saved_flyway" ]] || fail "Restored Flyway history differs. Leave $target isolated."
actual_major=$(major_state docker exec --user postgres "$id") || fail "Cannot verify PostgreSQL in $target."
[[ $actual_major == "$major" ]] || fail "Restored PostgreSQL version differs. Leave $target isolated."
printf 'Isolated restore complete: %s. Start the matching application in an isolated drill before any cutover.\n' "$target"
