#!/usr/bin/env bash
# SV Car Customs — production database + storage backup (READ-ONLY against prod).
#
# Connection string source (first match wins; value is NEVER printed):
#   SVCAR_DB_URL                 env var with the postgres:// URL
#   SVCAR_DB_URL_FILE            path to a file (chmod 600) containing the URL
#   SVCAR_DB_KEYCHAIN_SERVICE    macOS Keychain generic-password service name
#                                (security add-generic-password -a "$USER" -s svcar-db-url -w)
# Storage (optional; skipped if unset):
#   SUPABASE_URL                 https://<ref>.supabase.co
#   SUPABASE_SERVICE_ROLE_KEY    service role key (or SUPABASE_SERVICE_ROLE_KEY_FILE)
# Encryption (optional):
#   SVCAR_BACKUP_AGE_RECIPIENT   age public key  -> backup.tar.age
#   SVCAR_BACKUP_PASSPHRASE      openssl AES-256 + PBKDF2 -> backup.tar.enc
#   SVCAR_BACKUP_DELETE_PLAINTEXT=1  remove unencrypted dir after encrypting
# Output:
#   SVCAR_BACKUP_ROOT            default ~/SVCAR-DB-BACKUPS (must be outside any git repo)
set -euo pipefail
umask 077

die() { echo "ERROR: $*" >&2; exit 1; }
log() { echo "[$(date +%H:%M:%S)] $*"; }

# ---------- tools ----------
for t in pg_dump pg_dumpall psql shasum tar; do
  command -v "$t" >/dev/null 2>&1 || die "'$t' not found. Install: brew install libpq && brew link --force libpq (or brew install postgresql@17)"
done

# ---------- connection string (never echoed) ----------
DB_URL="${SVCAR_DB_URL:-}"
if [[ -z "$DB_URL" && -n "${SVCAR_DB_URL_FILE:-}" ]]; then
  [[ -r "$SVCAR_DB_URL_FILE" ]] || die "SVCAR_DB_URL_FILE is not readable"
  DB_URL="$(tr -d '\r\n' < "$SVCAR_DB_URL_FILE")"
fi
if [[ -z "$DB_URL" && -n "${SVCAR_DB_KEYCHAIN_SERVICE:-}" ]]; then
  DB_URL="$(security find-generic-password -s "$SVCAR_DB_KEYCHAIN_SERVICE" -w 2>/dev/null)" \
    || die "Keychain item '$SVCAR_DB_KEYCHAIN_SERVICE' not found"
fi
[[ -n "$DB_URL" ]] || die "No connection string. Set SVCAR_DB_URL, SVCAR_DB_URL_FILE or SVCAR_DB_KEYCHAIN_SERVICE (see docs/devops/DB-BACKUP.md)."
[[ "$DB_URL" =~ ^postgres(ql)?:// ]] || die "Connection string must start with postgres:// or postgresql://"
case "$DB_URL" in *:6543/*|*:6543\?*) die "Port 6543 is the transaction pooler; pg_dump needs the SESSION pooler (5432) or the direct connection." ;; esac
export PGCONNECT_TIMEOUT=15

# ---------- output dir (refuse inside a git repo) ----------
ROOT="${SVCAR_BACKUP_ROOT:-$HOME/SVCAR-DB-BACKUPS}"
mkdir -p "$ROOT"; chmod 700 "$ROOT"
ROOT="$(cd "$ROOT" && pwd -P)"
if git -C "$ROOT" rev-parse --show-toplevel >/dev/null 2>&1; then
  die "Backup root $ROOT is inside a git repository. Refusing (backups must never be committed)."
fi
TS="$(date +%Y%m%d-%H%M%S)"
OUT="$ROOT/$TS"
mkdir -m 700 "$OUT"
log "Writing to $OUT"
exec 3>"$OUT/backup.log"
note() { echo "$*" | tee -a /dev/fd/3; }

# ---------- database ----------
PGV="$(pg_dump --version | awk '{print $3}')"
note "pg_dump version: $PGV"
SRV="$(psql "$DB_URL" -XAtqc 'show server_version' 2>>"$OUT/backup.log")" || die "Cannot connect (see $OUT/backup.log; URL not logged)."
note "server version: $SRV"
if [[ "${PGV%%.*}" -lt "${SRV%%.*}" ]]; then
  die "pg_dump $PGV is older than server $SRV. brew install postgresql@${SRV%%.*} and put it first on PATH."
fi

log "Full dump (custom format, all schemas incl. auth/storage where readable)..."
pg_dump "$DB_URL" -Fc -f "$OUT/full.dump" 2>>"$OUT/backup.log" \
  || die "pg_dump failed (see backup.log)"
log "Schema-only dump..."
pg_dump "$DB_URL" --schema-only --no-owner -f "$OUT/schema.sql" 2>>"$OUT/backup.log" \
  || die "schema-only pg_dump failed"

log "Explicit auth schema data dump (Supabase may restrict)..."
if pg_dump "$DB_URL" -Fc --data-only --schema=auth -f "$OUT/auth-data.dump" 2>>"$OUT/backup.log"; then
  note "auth schema: dumped"
else
  rm -f "$OUT/auth-data.dump"; note "auth schema: NOT permitted (continuing)"
fi

log "Roles (no passwords)..."
if pg_dumpall --dbname="$DB_URL" --roles-only --no-role-passwords -f "$OUT/roles.sql" 2>>"$OUT/backup.log"; then
  note "roles: dumped"
else
  rm -f "$OUT/roles.sql"; note "roles: refused by server (normal on Supabase; continuing)"
fi

log "Row counts + storage metadata..."
psql "$DB_URL" -XAtq -F $'\t' -c "select schemaname||'.'||relname, n_live_tup from pg_stat_user_tables order by 1" \
  > "$OUT/row-estimates.tsv" 2>>"$OUT/backup.log" || note "row estimates unavailable"
psql "$DB_URL" -Xq -c "\copy (select * from storage.buckets) to '$OUT/storage-buckets.csv' csv header" 2>>"$OUT/backup.log" \
  || note "storage.buckets not readable"
psql "$DB_URL" -Xq -c "\copy (select id,bucket_id,name,owner,created_at,updated_at,metadata from storage.objects order by bucket_id,name) to '$OUT/storage-objects.csv' csv header" 2>>"$OUT/backup.log" \
  || note "storage.objects not readable"

# ---------- storage files ----------
SRK="${SUPABASE_SERVICE_ROLE_KEY:-}"
if [[ -z "$SRK" && -n "${SUPABASE_SERVICE_ROLE_KEY_FILE:-}" ]]; then SRK="$(tr -d '\r\n' < "$SUPABASE_SERVICE_ROLE_KEY_FILE")"; fi
if [[ -n "${SUPABASE_URL:-}" && -n "$SRK" ]]; then
  command -v curl >/dev/null || die "curl missing"
  HDR="$(mktemp)"; trap 'rm -f "$HDR"' EXIT
  printf 'Authorization: Bearer %s\napikey: %s\n' "$SRK" "$SRK" > "$HDR"   # header file keeps key out of argv
  unset SRK
  ok=0; fail=0
  while IFS=$'\t' read -r bucket name; do
    [[ -z "$bucket" || "$name" == *"/.emptyFolderPlaceholder" ]] && continue
    [[ "$name" == *..* ]] && { note "skip suspicious path: $bucket/$name"; continue; }
    dest="$OUT/storage/$bucket/$name"; mkdir -p "$(dirname "$dest")"
    enc="$(printf '%s' "$name" | jq -sRr @uri 2>/dev/null | sed 's/%2F/\//g' || printf '%s' "$name")"
    if curl -fsS -H @"$HDR" -o "$dest" "${SUPABASE_URL%/}/storage/v1/object/authenticated/$bucket/$enc"; then
      ok=$((ok+1))
    else
      fail=$((fail+1)); echo "$bucket/$name" >> "$OUT/storage-failed.txt"
    fi
  done < <(psql "$DB_URL" -XAtq -F $'\t' -c "select bucket_id, name from storage.objects order by 1,2" 2>>"$OUT/backup.log" || true)
  note "storage files: $ok downloaded, $fail failed"
else
  note "storage files: SKIPPED (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set)"
fi
unset DB_URL

# ---------- manifest ----------
log "sha256 manifest..."
( cd "$OUT" && find . -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 shasum -a 256 > ../.sums.tmp && mv ../.sums.tmp SHA256SUMS )
chmod -R go-rwx "$OUT"

# ---------- optional encryption ----------
if [[ -n "${SVCAR_BACKUP_AGE_RECIPIENT:-}" ]]; then
  command -v age >/dev/null || die "age not installed (brew install age)"
  tar -C "$ROOT" -cf - "$TS" | age -r "$SVCAR_BACKUP_AGE_RECIPIENT" -o "$ROOT/$TS.tar.age"
  ENC="$ROOT/$TS.tar.age"
elif [[ -n "${SVCAR_BACKUP_PASSPHRASE:-}" ]]; then
  tar -C "$ROOT" -cf - "$TS" | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:SVCAR_BACKUP_PASSPHRASE -out "$ROOT/$TS.tar.enc"
  ENC="$ROOT/$TS.tar.enc"
fi
if [[ -n "${ENC:-}" ]]; then
  chmod 600 "$ENC"; shasum -a 256 "$ENC" > "$ENC.sha256"
  log "Encrypted archive: $ENC"
  [[ "${SVCAR_BACKUP_DELETE_PLAINTEXT:-0}" == 1 ]] && rm -rf "$OUT" && log "Plaintext removed."
fi
log "Done. Verify with: scripts/backup/verify-backup.sh $OUT"
