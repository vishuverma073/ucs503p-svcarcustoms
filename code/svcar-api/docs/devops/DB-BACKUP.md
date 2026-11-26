# Database + storage backup (Supabase Free plan)

The Supabase Free plan gives no backups we can rely on. These scripts are our backup.
They are **read-only against production** and write only to your Mac, outside any git repo.

- `scripts/backup/db-backup.sh` — pg_dump (full, custom format) + schema-only SQL + auth data (if allowed) + roles (if allowed) + storage bucket/object metadata + product image files + SHA256 manifest, optional encryption.
- `scripts/backup/verify-backup.sh` — checksums + `pg_restore --list`; with `--restore`, restores into a throwaway **local docker** Postgres and prints row counts. It never connects to production.

## One-time setup (owner)

1. Install tools:
   ```sh
   brew install libpq age jq        # libpq = pg_dump/psql/pg_restore
   brew link --force libpq
   pg_dump --version                # must be >= the Supabase server major version (e.g. 17)
   ```
   If the script says pg_dump is too old: `brew install postgresql@17` and put `/opt/homebrew/opt/postgresql@17/bin` first on PATH.
2. Get the connection string: Supabase dashboard → your project → **Project Settings → Database → Connection string** (or the **Connect** button at the top) → choose **Session pooler** (port 5432) or **Direct connection**. Do **not** use the Transaction pooler (port 6543) — the script refuses it. Replace `[YOUR-PASSWORD]` with the DB password (reset it on the same page if unknown).
3. Store it in the macOS Keychain (it will prompt for the value; nothing goes to shell history):
   ```sh
   security add-generic-password -a "$USER" -s svcar-db-url -w
   ```
4. For product images, get the service role key: **Project Settings → API Keys → service_role** (secret). Store it in a file only you can read:
   ```sh
   mkdir -p ~/.svcar && chmod 700 ~/.svcar
   pbpaste > ~/.svcar/service-role-key && chmod 600 ~/.svcar/service-role-key   # after copying the key
   ```
5. Create an encryption key (recommended):
   ```sh
   age-keygen -o ~/.svcar/backup-age.key      # prints "Public key: age1..."
   ```
   Keep a copy of `backup-age.key` in your password manager — without it encrypted backups cannot be restored.

## Run a backup

```sh
cd svcar-api
SVCAR_DB_KEYCHAIN_SERVICE=svcar-db-url \
SUPABASE_URL=https://<project-ref>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY_FILE=~/.svcar/service-role-key \
SVCAR_BACKUP_AGE_RECIPIENT=age1...your-public-key \
  ./scripts/backup/db-backup.sh

./scripts/backup/verify-backup.sh ~/SVCAR-DB-BACKUPS/<timestamp>            # quick check
./scripts/backup/verify-backup.sh ~/SVCAR-DB-BACKUPS/<timestamp> --restore  # local docker restore test
```

Alternatives: `SVCAR_DB_URL_FILE=/path/to/file` (chmod 600) or `SVCAR_DB_URL` env var; `SVCAR_BACKUP_PASSPHRASE` for openssl instead of age. Set `SVCAR_BACKUP_DELETE_PLAINTEXT=1` to keep only the encrypted archive.

Output: `~/SVCAR-DB-BACKUPS/<timestamp>/` (chmod 700) containing `full.dump`, `schema.sql`, `auth-data.dump`, `roles.sql` (Supabase usually refuses — that's fine), `storage-buckets.csv`, `storage-objects.csv`, `storage/<bucket>/...`, `row-estimates.tsv`, `backup.log`, `SHA256SUMS`, plus `<timestamp>.tar.age` if encrypted.

## Schedule

- **Weekly** (e.g. Sunday night), and
- **Before every migration / bulk SQL edit / Supabase upgrade** — no exceptions.
- Run `verify-backup.sh --restore` at least monthly.
- Retention: keep the last 4 weekly + 3 monthly; delete older ones.

## Offsite storage

- Copy only the **encrypted** archive (`.tar.age` / `.tar.enc`) offsite: an external drive and/or a private cloud drive (iCloud Drive / Google Drive).
- **Never** commit backups to GitHub or any repo (they contain customer PII and password hashes). `.gitignore` blocks `*.dump`, `*.backup`, `*.tar.age`, `*.tar.enc`, `SVCAR-DB-BACKUPS/`.
- Store the age private key / passphrase separately from the archive.

## Restore procedure

1. Decrypt: `age -d -i ~/.svcar/backup-age.key -o b.tar <ts>.tar.age && tar -xf b.tar` (or `openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:SVCAR_BACKUP_PASSPHRASE -in <ts>.tar.enc | tar -x`).
2. `verify-backup.sh <dir>` — checksums must pass.
3. Restore to **local docker** (`verify-backup.sh <dir> --restore`) or a **new/staging Supabase project** first:
   ```sh
   pg_restore --no-owner --no-privileges --schema=public -d "<STAGING session-pooler URL>" full.dump
   ```
   (Supabase already owns `auth`/`storage` schemas; restore their data selectively with `--data-only --schema=auth` only if needed.) Re-upload images from `storage/` via the dashboard or Storage API.
4. Point a staging API at it and smoke test.
5. **Production restore only with an explicit owner decision**, after a fresh backup of the current prod state, during a maintenance window.
