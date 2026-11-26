#!/usr/bin/env bash
# Verify a backup produced by db-backup.sh. NEVER touches production:
# it ignores every DB URL env var and only restores into a throwaway local
# docker container bound to 127.0.0.1.
#
# Usage: verify-backup.sh <backup-dir>            checksums + pg_restore --list
#        verify-backup.sh <backup-dir> --restore  also restore into local docker and print row counts
set -euo pipefail
die() { echo "ERROR: $*" >&2; exit 1; }

DIR="${1:-}"; MODE="${2:-}"
[[ -n "$DIR" && -d "$DIR" ]] || die "Usage: $0 <backup-dir> [--restore]"
DIR="$(cd "$DIR" && pwd -P)"
unset SVCAR_DB_URL DATABASE_URL PGHOST PGDATABASE PGUSER PGPASSWORD PGSERVICE

command -v pg_restore >/dev/null || die "pg_restore not found (brew install libpq)"
[[ -f "$DIR/SHA256SUMS" ]] || die "No SHA256SUMS in $DIR"
[[ -f "$DIR/full.dump" ]] || die "No full.dump in $DIR"

echo "== checksums"
( cd "$DIR" && shasum -a 256 -c --quiet SHA256SUMS ) || die "Checksum mismatch"
echo "OK"

echo "== pg_restore --list"
LIST="$(pg_restore --list "$DIR/full.dump")" || die "full.dump is not a valid custom-format archive"
echo "TOC entries: $(grep -cv '^;' <<<"$LIST")"
for s in public auth storage; do
  printf '  schema %-8s table-data entries: %s\n' "$s" "$(grep -c "TABLE DATA $s " <<<"$LIST" || true)"
done
[[ -f "$DIR/schema.sql" ]] && echo "schema.sql: $(wc -l < "$DIR/schema.sql") lines"

[[ "$MODE" == "--restore" ]] || { echo "Done (add --restore for a local docker restore test)."; exit 0; }

command -v docker >/dev/null || die "docker not found"
docker info >/dev/null 2>&1 || die "docker daemon not running"
SRV_MAJOR="$(grep -m1 '^server version' "$DIR/backup.log" 2>/dev/null | awk '{print $3}' | cut -d. -f1)"
IMG="postgres:${SRV_MAJOR:-17}"
NAME="svcar-verify-$$"
PORT="${SVCAR_VERIFY_PORT:-55432}"
PW="verify-$RANDOM$RANDOM"
cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "== starting throwaway $IMG on 127.0.0.1:$PORT"
docker run -d --rm --name "$NAME" -e POSTGRES_PASSWORD="$PW" -p "127.0.0.1:$PORT:5432" "$IMG" >/dev/null
for _ in $(seq 1 30); do docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
LOCAL="postgresql://postgres:$PW@127.0.0.1:$PORT/postgres"
case "$LOCAL" in *127.0.0.1*) ;; *) die "refusing non-local target";; esac

# Supabase-managed roles referenced by the dump; create stubs so grants resolve.
for r in anon authenticated service_role supabase_admin supabase_auth_admin supabase_storage_admin authenticator dashboard_user pgbouncer; do
  psql "$LOCAL" -Xq -c "do \$\$begin create role $r; exception when duplicate_object then null; end\$\$" >/dev/null
done

echo "== pg_restore (errors from Supabase-only extensions are expected and logged)"
pg_restore --no-owner --no-privileges -d "$LOCAL" "$DIR/full.dump" 2>"$DIR/../verify-$(basename "$DIR").log" || \
  echo "  pg_restore reported errors; see $(dirname "$DIR")/verify-$(basename "$DIR").log"

psql "$LOCAL" -Xqc analyze >/dev/null 2>&1 || true
echo "== row counts (restored local copy)"
for t in public.products public.orders public.order_items public.customers public.users auth.users storage.objects; do
  n="$(psql "$LOCAL" -XAtqc "select count(*) from $t" 2>/dev/null || echo 'n/a')"
  printf '  %-22s %s\n' "$t" "$n"
done
psql "$LOCAL" -XAtq -F $'\t' -c "select schemaname||'.'||relname, n_live_tup from pg_stat_user_tables where schemaname='public' order by 1" | sed 's/^/  /' || true
[[ -f "$DIR/row-estimates.tsv" ]] && echo "(compare with prod estimates in row-estimates.tsv)"
echo "Done. Container removed."
