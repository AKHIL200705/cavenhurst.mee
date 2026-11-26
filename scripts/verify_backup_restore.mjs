import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";

/**
 * CAVENHUSRT Backup Integrity Verifier & Isolated Restore Test
 * Usage:
 *   node --env-file=.env scripts/verify_backup_restore.mjs [optional_snapshot_dir]
 *
 * Performs:
 *  1. Checksum verification of schema.sql, full_backup.json, and all public/auth tables
 *  2. AES-256-GCM decryption verification of full_backup.enc.json (when key present)
 *  3. Storage file SHA-256 verification
 *  4. Isolated PostgreSQL schema + data restore drill inside a rolled-back transaction
 *     (ZERO persistent writes to production public or auth schemas)
 */

function sha256(bufOrStr) {
  return crypto.createHash("sha256").update(bufOrStr).digest("hex");
}

function decryptJsonBundle(encStr, secret) {
  const parsed = JSON.parse(encStr);
  if (parsed.alg !== "aes-256-gcm" || !parsed.iv || !parsed.tag || !parsed.ciphertext) {
    throw new Error("Unsupported encrypted bundle envelope");
  }
  const LEGACY_BACKUP_HMAC_CONTEXT = "cavenhurst:db-backup-v1";
  const contexts = ["cavenhusrt:db-backup-v1", LEGACY_BACKUP_HMAC_CONTEXT];
  let lastError;
  for (const ctx of contexts) {
    try {
      const key = crypto.createHmac("sha256", secret).update(ctx).digest();
      const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(parsed.iv, "hex"));
      decipher.setAuthTag(Buffer.from(parsed.tag, "hex"));
      const decrypted = Buffer.concat([
        decipher.update(Buffer.from(parsed.ciphertext, "base64")),
        decipher.final(),
      ]);
      return decrypted.toString("utf8");
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

function findLatestSnapshotDir() {
  const root = path.resolve("supabase/backups");
  if (!fs.existsSync(root)) throw new Error("No supabase/backups directory found");
  const dirs = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.startsWith("snapshot_"))
    .map((d) => d.name)
    .sort();
  if (dirs.length === 0) throw new Error("No snapshot_* directories found in supabase/backups");
  return path.join(root, dirs[dirs.length - 1]);
}

async function verify() {
  const snapshotDir = process.argv[2] ? path.resolve(process.argv[2]) : findLatestSnapshotDir();
  console.log("=== VERIFYING BACKUP SNAPSHOT:", snapshotDir, "===");

  const manifestPath = path.join(snapshotDir, "manifest.json");
  const schemaPath = path.join(snapshotDir, "schema.sql");
  const backupPath = path.join(snapshotDir, "full_backup.json");
  const encPath = path.join(snapshotDir, "full_backup.enc.json");

  if (!fs.existsSync(manifestPath) || !fs.existsSync(schemaPath) || !fs.existsSync(backupPath)) {
    throw new Error(
      "Snapshot missing required files (manifest.json, schema.sql, full_backup.json)",
    );
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const schemaSql = fs.readFileSync(schemaPath, "utf8");
  const backupJsonStr = fs.readFileSync(backupPath, "utf8");

  if (sha256(schemaSql) !== manifest.schemaSqlSha256) {
    throw new Error("Checksum mismatch on schema.sql");
  }
  if (sha256(backupJsonStr) !== manifest.fullBackupSha256) {
    throw new Error("Checksum mismatch on full_backup.json");
  }
  console.log("PASS: schema.sql and full_backup.json SHA-256 checksums match manifest.");

  // Verify AES-256-GCM decryption if encrypted bundle exists
  const encSecret = (process.env.BACKUP_ENCRYPTION_KEY || process.env.SESSION_SECRET || "").trim();
  if (fs.existsSync(encPath)) {
    if (!encSecret) {
      console.warn(
        "SKIP: full_backup.enc.json exists but BACKUP_ENCRYPTION_KEY / SESSION_SECRET unset.",
      );
    } else {
      const encRaw = fs.readFileSync(encPath, "utf8");
      const decryptedStr = decryptJsonBundle(encRaw, encSecret);
      if (sha256(decryptedStr) !== manifest.encryptedBundle?.plaintextSha256) {
        throw new Error("Decrypted AES-256-GCM payload checksum mismatch");
      }
      console.log("PASS: Encrypted backup bundle decrypted and verified via AES-256-GCM.");
    }
  }

  const bundle = JSON.parse(backupJsonStr);
  const publicData = bundle.data?.public || {};
  const authData = bundle.data?.auth || {};

  for (const [tableName, rows] of Object.entries(publicData)) {
    const key = `public.${tableName}`;
    const expected = manifest.checksums?.[key];
    if (!expected) throw new Error(`Missing manifest checksum for ${key}`);
    if (rows.length !== expected.rows || sha256(JSON.stringify(rows)) !== expected.sha256) {
      throw new Error(`Integrity mismatch for ${key}`);
    }
  }
  for (const [tableName, rows] of Object.entries(authData)) {
    const key = `auth.${tableName}`;
    const expected = manifest.checksums?.[key];
    if (!expected) throw new Error(`Missing manifest checksum for ${key}`);
    if (rows.length !== expected.rows || sha256(JSON.stringify(rows)) !== expected.sha256) {
      throw new Error(`Integrity mismatch for ${key}`);
    }
  }
  console.log(
    `PASS: Verified row counts & SHA-256 checksums across ${Object.keys(publicData).length} public tables and ${Object.keys(authData).length} auth tables.`,
  );

  // Verify storage objects checksums
  for (const sf of manifest.storageFiles || []) {
    const filePath = path.join(snapshotDir, "storage", sf.bucket, ...sf.name.split("/"));
    if (!fs.existsSync(filePath)) {
      throw new Error(`Missing storage backup file: ${filePath}`);
    }
    const bytes = fs.readFileSync(filePath);
    if (sha256(bytes) !== sf.sha256 || bytes.length !== sf.bytes) {
      throw new Error(`Storage file checksum mismatch: ${sf.bucket}/${sf.name}`);
    }
  }
  console.log(`PASS: Storage backup verification (${(manifest.storageFiles || []).length} files).`);

  // Isolated Restore Test (rolled back transaction in temporary disposable schema)
  const dbUrl = (process.env.DATABASE_URL || process.env.DIRECT_DATABASE_URL || "")
    .replace(/^["']|["']$/g, "")
    .trim();
  if (!dbUrl) {
    throw new Error("DATABASE_URL required to execute isolated PostgreSQL restore test.");
  }

  const sql = postgres(dbUrl, { ssl: { rejectUnauthorized: false }, max: 1, connect_timeout: 20 });
  const drillSchema = `_restore_drill_${Date.now()}`;
  const sentinel = "__CAVENHUSRT_RESTORE_DRILL_OK__";

  try {
    const coreTables = [
      "products",
      "product_categories",
      "product_variants",
      "inventory",
      "customers",
      "profiles",
      "orders",
      "order_items",
      "payments",
      "shipments",
      "coupons",
      "admin_users",
      "customer_welcome",
    ];

    try {
      await sql.begin(async (tx) => {
        await tx.unsafe(`CREATE SCHEMA "${drillSchema}"`);
        const restoredCounts = {};

        for (const tbl of coreTables) {
          const rows = publicData[tbl] || [];
          await tx.unsafe(
            `CREATE TABLE "${drillSchema}"."${tbl}" (LIKE public."${tbl}" INCLUDING DEFAULTS INCLUDING CONSTRAINTS)`,
          );
          if (rows.length > 0) {
            const cols = Object.keys(rows[0]);
            const colList = cols.map((c) => `"${c}"`).join(", ");
            for (const row of rows) {
              const vals = cols.map((_, idx) => `$${idx + 1}`).join(", ");
              const bound = cols.map((c) => (row[c] === undefined ? null : row[c]));
              await tx.unsafe(
                `INSERT INTO "${drillSchema}"."${tbl}" (${colList}) VALUES (${vals})`,
                bound,
              );
            }
          }
          const [countRes] = await tx.unsafe(
            `SELECT count(*)::int AS cnt FROM "${drillSchema}"."${tbl}"`,
          );
          if (countRes.cnt !== rows.length) {
            throw new Error(
              `Isolated restore count mismatch on ${tbl}: expected ${rows.length}, got ${countRes.cnt}`,
            );
          }
          restoredCounts[tbl] = countRes.cnt;
        }

        console.log(
          "PASS: Isolated schema & data restore drill counts matched 100%:",
          restoredCounts,
        );
        throw new Error(sentinel);
      });
    } catch (drillErr) {
      if (!(drillErr instanceof Error) || drillErr.message !== sentinel) {
        throw drillErr;
      }
      console.log(
        "PASS: Restore drill transaction cleanly rolled back (zero changes persisted to live DB).",
      );
    }
  } finally {
    await sql.end();
  }
}

verify().catch((err) => {
  console.error("[Backup Verification FAILED]:", err);
  process.exit(1);
});
