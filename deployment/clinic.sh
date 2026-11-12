#!/usr/bin/env bash
set -euo pipefail
here=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=backup-common.sh
source "$here/backup-common.sh"
[[ ${CLINIC_ENV_FILE:-} = /* && -f $CLINIC_ENV_FILE ]] || fail 'Set CLINIC_ENV_FILE to the absolute local configuration path.'
setting() { sed -n "s/^$1=//p" "$CLINIC_ENV_FILE"; }
export CLINIC_LAN_IP="${CLINIC_LAN_IP:-$(setting CLINIC_LAN_IP)}"
[[ $CLINIC_LAN_IP =~ ^([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})$ ]] || fail 'A private IPv4 binding is required.'
a=$((10#${BASH_REMATCH[1]}))
b=$((10#${BASH_REMATCH[2]}))
c=$((10#${BASH_REMATCH[3]}))
d=$((10#${BASH_REMATCH[4]}))
(( b <= 255 && c <= 255 && d <= 255 && (a == 10 || (a == 172 && b >= 16 && b <= 31)
    || (a == 192 && b == 168) || (a == 127 && b == 0 && c == 0 && d == 1)) )) || fail 'Use an RFC 1918 clinic address or 127.0.0.1 for a local drill.'
export CLINIC_DB_PASSWORD_FILE="${CLINIC_DB_PASSWORD_FILE:-$(setting CLINIC_DB_PASSWORD_FILE)}"
export CLINIC_PG_ADMIN_FILE="${CLINIC_PG_ADMIN_FILE:-$(setting CLINIC_PG_ADMIN_FILE)}"
check_private_db_envs
export CLINIC_PRIVATE_CONFIG_DIR="${CLINIC_PRIVATE_CONFIG_DIR:-$(setting CLINIC_PRIVATE_CONFIG_DIR)}"
[[ $CLINIC_PRIVATE_CONFIG_DIR = /* && -d $CLINIC_PRIVATE_CONFIG_DIR && $CLINIC_PRIVATE_CONFIG_DIR != *:* ]] ||
    fail 'Set CLINIC_PRIVATE_CONFIG_DIR to an existing absolute directory.'
exec docker compose --env-file "$CLINIC_ENV_FILE" -f "$here/compose.yml" "$@"
