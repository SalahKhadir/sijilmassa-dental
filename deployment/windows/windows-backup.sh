#!/usr/bin/env bash
set -euo pipefail
exec 2>&1
here=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
# shellcheck source=../backup-common.sh
source "$here/backup-common.sh"

[[ $# == 6 ]] || fail 'Usage: windows-backup.sh MODE CONFIG PROJECT RELEASE IP PORT'
mode=$1 config=$2 project=$3 release=$4 address=$5 port=$6
[[ $mode == check || $mode == run || $mode == verify ]] || fail 'Unsupported Windows backup operation.'
[[ $project =~ ^sijilmassa-[a-z0-9-]+-pilot$ ]] && release_valid "$release" || fail 'Expected a synthetic pilot project and release.'

# Only accept private files on the Linux side. Never evaluate a configuration as shell code.
private_config() {
    local path=$1 canonical
    [[ $path == /* && -f $path && ! -L $path && -O $path ]] || fail 'Missing owner-controlled WSL configuration.'
    canonical=$(realpath -e -- "$path")
    [[ $canonical == "$HOME/"* && $canonical != "$(realpath -e -- "$here/..")/"* ]] ||
        fail 'Keep private configuration under the WSL home directory, outside the repository.'
    [[ $(stat -c '%a' -- "$path") == 600 ]] || fail 'Restrict WSL configuration to mode 0600.'
}
private_config "$config"
unset CLINIC_ENV_FILE GNUPGHOME BACKUP_RECIPIENT BACKUP_DESTINATION BACKUP_MOUNTPOINT BACKUP_MEDIA_ID
declare -A seen=()
while IFS= read -r line || [[ -n $line ]]; do
    [[ -z $line || $line == '#'* ]] && continue
    key=${line%%=*}
    value=${line#*=}
    case $key in
        CLINIC_ENV_FILE|GNUPGHOME|BACKUP_RECIPIENT|BACKUP_DESTINATION|BACKUP_MOUNTPOINT|BACKUP_MEDIA_ID) ;;
        *) fail 'Unknown Windows backup setting.' ;;
    esac
    [[ $line == *=* && -n $value && $value != *$'\r'* && ! ${seen[$key]+present} ]] ||
        fail 'Invalid or duplicate Windows backup setting.'
    seen[$key]=1
    export "$key=$value"
done < "$config"
(( ${#seen[@]} == 6 )) || fail 'Complete all Windows backup settings.'
[[ $GNUPGHOME == "$HOME/"* && -d $GNUPGHOME && ! -L $GNUPGHOME && -O $GNUPGHOME &&
   $(stat -c '%a' -- "$GNUPGHOME") == 700 ]] || fail 'Use a private public-key-only GPG directory under WSL home.'
export CLINIC_DEPLOYMENT_DIR=$here

args=("$BACKUP_DESTINATION" --external "$BACKUP_MOUNTPOINT" "$BACKUP_MEDIA_ID")
# Verification works with the external drive even when Docker Desktop is stopped.
if [[ $mode == verify ]]; then
    exec "$here/verify-backup.sh" "${args[@]}"
fi
private_config "$CLINIC_ENV_FILE"
key_inventory=$(gpg --batch --no-tty --no-autostart --with-colons --list-secret-keys 2>/dev/null) ||
    fail 'Cannot check the WSL backup keyring.'
if grep -q '^sec:' <<<"$key_inventory"; then
    fail 'Use a public-key-only backup keyring. Keep the recovery key off this server.'
fi
for pair in "CLINIC_PROJECT=$project" "CLINIC_RELEASE=$release" "CLINIC_LAN_IP=$address" "CLINIC_HTTPS_PORT=$port"; do
    [[ $(grep -Fxc -- "$pair" "$CLINIC_ENV_FILE" || true) == 1 &&
       $(grep -c "^${pair%%=*}=" "$CLINIC_ENV_FILE" || true) == 1 ]] ||
        fail 'WSL backup configuration does not match the Windows pilot.'
done
unset DOCKER_CONTEXT CLINIC_LAN_IP CLINIC_DB_PASSWORD_FILE CLINIC_PG_ADMIN_FILE CLINIC_PRIVATE_CONFIG_DIR
export DOCKER_HOST=unix:///var/run/docker.sock COMPOSE_DISABLE_ENV_FILE=1
[[ -S /var/run/docker.sock ]] || fail 'Enable Docker Desktop WSL integration for this distribution.'
[[ $(docker info --format '{{.OperatingSystem}}|{{.OSType}}' 2>/dev/null) == 'Docker Desktop|linux' ]] || fail 'Docker Desktop Linux is unavailable.'
if [[ $mode == run ]]; then
    [[ $("$here/clinic.sh" exec -T backend printenv CLINIC_RELEASE 2>/dev/null) == "$release" ]] ||
        fail 'The running backend does not match the configured pilot release.'
fi
# scheduled-backup.sh preserves the external media check, locks, pg_dump/GPG and manifest.
if [[ $mode == check ]]; then
    exec "$here/scheduled-backup.sh" --check 2>&1
fi
"$here/scheduled-backup.sh" 2>&1
exec "$here/verify-backup.sh" "${args[@]}"
