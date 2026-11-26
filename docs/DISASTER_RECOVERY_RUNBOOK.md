# CAVENHUSRT — Backup & Disaster Recovery Runbook

## 1. Why Application-Managed Backups Exist

CAVENHUSRT currently runs on Supabase Free Tier (`max_connections = 60`), which does not provide built-in Supabase automated daily backups or Point-in-Time Recovery (PITR). Therefore, all schema, auth metadata, data, and Storage recovery rely on full logical snapshots verified before migrations and on a recurring schedule.

## 2. Creating a Verified Full Backup

Run from the repository root with valid `.env` credentials (`DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, plus optional `BACKUP_ENCRYPTION_KEY` or `SESSION_SECRET` for AES-256-GCM encryption):

```powershell
node --env-file=.env scripts/backup_database.mjs
```

### Snapshot Contents (`supabase/backups/snapshot_<timestamp>/`)

- `schema.sql` — Full DDL snapshot (`extensions`, all `public` tables, constraints/PKs/FKs/CHECKs, indexes, views + `reloptions`, functions, RLS policies).
- `full_backup.json` — Complete JSON export containing metadata, all `public` base tables, and `auth` recovery tables (`auth.users`, `auth.identities`, `auth.mfa_factors`, `auth.one_time_tokens`).
- `full_backup.enc.json` — AES-256-GCM encrypted backup archive (`hmac-sha256` key derived from `BACKUP_ENCRYPTION_KEY` or `SESSION_SECRET`).
- `storage/<bucket>/...` — Binary backup of all files in Supabase Storage buckets.
- `manifest.json` — Per-table row counts and SHA-256 integrity hashes.

> [!IMPORTANT]
> `supabase/backups/` is git-ignored. Immediately copy `snapshot_<timestamp>/` (preferring `full_backup.enc.json` + `manifest.json` + `storage/`) to encrypted off-site storage (e.g., private S3/B2/encrypted drive) after creation.

## 3. Verifying Integrity & Isolated Restore Test

Verify checksums, AES-256-GCM decryption, Storage checksums, and execute a non-destructive rolled-back PostgreSQL schema+data restore drill:

```powershell
node --env-file=.env scripts/verify_backup_restore.mjs
```

## 4. Emergency Full Restoration Procedure

1. **Provision Target Database:** Create a fresh Supabase or PostgreSQL 17 database (or pause storefront maintenance mode first if restoring in-place). Never run destructive wipes without preserving the previous snapshot.
2. **Decrypt Backup Bundle (if restoring from `full_backup.enc.json`):** Decrypt AES-256-GCM envelope using `BACKUP_ENCRYPTION_KEY` / `SESSION_SECRET` and verify SHA-256 against `manifest.json`.
3. **Restore Schema & Policies:** Apply `schema.sql` to an empty target database (creating extensions, tables, constraints, indexes, views, functions, triggers, and RLS policies).
4. **Restore Auth & Public Data:**
   - Insert `auth.users`, `auth.identities`, and `auth.mfa_factors` first (so `profiles` and `auth.users` FKs resolve).
   - Insert `public` parent tables before child tables in topological FK order (`product_categories` → `products` → `product_variants` → `inventory`; `customers` → `orders` → `order_items`/`payments`/`shipments`).
   - Disable/avoid re-triggering side-effect triggers if duplicating synced rows, or rely on `ON CONFLICT DO NOTHING`.
5. **Restore Sequences & Storage:** Upload `storage/<bucket>/*` binaries via `supabase.storage.from(bucket).upload(...)` and verify bucket settings (`product-images`: public read, 5 MB limit).
6. **Post-Restore Verification:**
   - Run read-only row count + SHA-256 checks against `manifest.json`.
   - Test customer login, admin authentication, product catalog, and order history before re-opening storefront traffic.
