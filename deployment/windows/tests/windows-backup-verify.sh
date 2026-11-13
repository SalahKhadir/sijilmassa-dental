#!/usr/bin/env bash
set -euo pipefail
# Portable verification of the WSL adapter and the real archive checker.
# The mountpoint is simulated with findmnt only. No Docker or WSL is used.
here=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
tmp=$(mktemp -d "$HOME/.sijilmassa-windows-backup-test.XXXXXX")
trap 'gpgconf --homedir "$tmp/public" --kill all 2>/dev/null || true; rm -rf -- "$tmp"' EXIT
mkdir -m 700 "$tmp/public" "$tmp/bin"
mkdir -p "$tmp/External Disk/Clinic Backups"
export SIJILMASSA_FIXTURE_ROOT="$tmp" PATH="$tmp/bin:$PATH"
cat > "$tmp/bin/findmnt" <<'MOCK'
#!/usr/bin/env bash
[[ $# == 3 && $1 == -rn && $2 == --mountpoint && $3 == "$SIJILMASSA_FIXTURE_ROOT/External Disk" ]]
MOCK
chmod +x "$tmp/bin/findmnt"
export GNUPGHOME="$tmp/public"
gpg --batch --passphrase '' --quick-generate-key 'Synthetic Windows Backup Test' default default 1d >/dev/null 2>&1
fingerprint=$(gpg --batch --with-colons --list-keys 2>/dev/null | awk -F: '$1 == "fpr" && !seen++ { print $10 }')
stamp=$(date -u +%Y%m%dT%H%M%SZ)
bundle="$tmp/External Disk/Clinic Backups/clinic-backup-$stamp-fixture1"
mkdir "$bundle"
printf 'synthetic backup verification fixture' |
    gpg --batch --trust-model always --recipient "$fingerprint" --encrypt --output "$bundle/database.dump.gpg"
hash=$(sha256sum < "$bundle/database.dump.gpg")
printf 'format=1\ncreated_utc=%s\nrelease=test-release\npostgres_major=17\nflyway=1:1\narchive_sha256=%s\n' \
    "$stamp" "${hash%% *}" > "$bundle/manifest"
printf 'fixture-drive\n' > "$tmp/External Disk/.sijilmassa-backup-media"
config="$tmp/backup config.conf"
cat > "$config" <<CONFIG
CLINIC_ENV_FILE=$tmp/clinic.env
GNUPGHOME=$tmp/public
BACKUP_RECIPIENT=$fingerprint
BACKUP_DESTINATION=$tmp/External Disk/Clinic Backups
BACKUP_MOUNTPOINT=$tmp/External Disk
BACKUP_MEDIA_ID=fixture-drive
CONFIG
chmod 600 "$config"
verify() { bash "$here/windows-backup.sh" verify "$config" sijilmassa-test-pilot test-release 192.168.1.20 443; }
verify > "$tmp/result"
grep -q '^PASS Last verified backup' "$tmp/result"
printf 'bad' >> "$bundle/database.dump.gpg"
if verify > "$tmp/result"; then exit 1; fi
grep -q 'checksum mismatch' "$tmp/result"
rm "$tmp/External Disk/.sijilmassa-backup-media"
if verify > "$tmp/result"; then exit 1; fi
grep -q 'external backup media is absent' "$tmp/result"
printf 'BACKUP_MEDIA_ID=duplicate\n' >> "$config"
if verify > "$tmp/result"; then exit 1; fi
grep -q 'duplicate Windows backup setting' "$tmp/result"
printf 'PASS WSL bridge verification with paths containing spaces, encrypted envelope, checksum, missing media and duplicate configuration.\n'
