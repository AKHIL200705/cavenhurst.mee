import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";

/**
 * CAVENHUSRT Full Logical + Schema + Auth + Storage Database Backup Utility
 * Usage:
 *   node --env-file=.env scripts/backup_database.mjs
 *   BACKUP_ENCRYPTION_KEY=... node --env-file=.env scripts/backup_database.mjs
 *
 * Captures:
 *  - All public base table DDL, columns, PKs, FKs, CHECKs, UNIQUEs, sequences
 *  - All public indexes, views (+ reloptions), functions, triggers, RLS policies, grants
 *  - All public table rows + auth schema recovery tables (users, identities, mfa_factors, sessions)
 *  - Supabase Storage bucket configs & Storage object binaries
 *  - Per-table SHA-256 verification manifest & AES-256-GCM encrypted bundle
 */

const dbUrl = (process.env.DATABASE_URL || process.env.DIRECT_DATABASE_URL || "")
  .replace(/^["']|["']$/g, "")
  .trim();

if (!dbUrl) {
  console.error(
    "[Backup Error] Missing DATABASE_URL. Run with: node --env-file=.env scripts/backup_database.mjs",
  );
  process.exit(1);
}

const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "")
  .replace(/^["']|["']$/g, "")
  .replace(/\/+$/, "");
const serviceRoleKey = (
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SECRET_KEY ||
  ""
)
  .replace(/^["']|["']$/g, "")
  .trim();

const encSecret = (process.env.BACKUP_ENCRYPTION_KEY || process.env.SESSION_SECRET || "").trim();

const sql = postgres(dbUrl, {
  ssl: { rejectUnauthorized: false },
  max: 2,
  connect_timeout: 20,
});

function sha256(bufOrStr) {
  return crypto.createHash("sha256").update(bufOrStr).digest("hex");
}

function encryptJsonBundle(plaintextStr, secret) {
  const key = crypto.createHmac("sha256", secret).update("cavenhusrt:db-backup-v1").digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintextStr, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    alg: "aes-256-gcm",
    iv: iv.toString("hex"),
    tag: tag.toString("hex"),
    ciphertext: ciphertext.toString("base64"),
  });
}

async function exportStorageObjects(backupDir, buckets, objects) {
  const storageDir = path.join(backupDir, "storage");
  fs.mkdirSync(storageDir, { recursive: true });
  const downloaded = [];

  if (!objects.length) {
    return downloaded;
  }
  if (!supabaseUrl || !serviceRoleKey) {
    console.warn(
      "[Backup Warning] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY unset; skipping Storage binary downloads.",
    );
    return downloaded;
  }

  for (const obj of objects) {
    const bucket = obj.bucket_id;
    const objName = obj.name;
    const targetUrl = `${supabaseUrl}/storage/v1/object/authenticated/${encodeURIComponent(bucket)}/${objName
      .split("/")
      .map(encodeURIComponent)
      .join("/")}`;

    const res = await fetch(targetUrl, {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    });
    if (!res.ok) {
      throw new Error(
        `Storage object download failed for ${bucket}/${objName}: HTTP ${res.status}`,
      );
    }
    const bytes = Buffer.from(await res.arrayBuffer());
    const destPath = path.join(storageDir, bucket, ...objName.split("/"));
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.writeFileSync(destPath, bytes);
    downloaded.push({
      bucket,
      name: objName,
      bytes: bytes.length,
      sha256: sha256(bytes),
    });
  }
  return downloaded;
}

async function runBackup() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = path.resolve("supabase/backups", `snapshot_${stamp}`);
  fs.mkdirSync(backupDir, { recursive: true });

  console.log(`=== CAVENHUSRT FULL BACKUP (${stamp}) ===`);

  // 1. Metadata: Extensions, Types, Columns, Constraints, Indexes, Views, Functions, Triggers, Policies, Grants, Sequences
  const [
    pgVersionRow,
    extensions,
    enums,
    publicTables,
    columns,
    constraints,
    indexes,
    views,
    functions,
    triggers,
    policies,
    tableGrants,
    sequences,
    storageBuckets,
    storageObjects,
  ] = await Promise.all([
    sql`SELECT version() AS version, current_database() AS db_name`,
    sql`
      SELECT e.extname, n.nspname AS schema, e.extversion
      FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
      ORDER BY e.extname
    `,
    sql`
      SELECT t.typname, string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder) AS labels
      FROM pg_type t
      JOIN pg_namespace n ON n.oid = t.typnamespace
      JOIN pg_enum e ON e.enumtypid = t.oid
      WHERE n.nspname = 'public'
      GROUP BY t.typname
    `,
    sql`
      SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
      ORDER BY c.relname
    `,
    sql`
      SELECT table_schema, table_name, ordinal_position, column_name, data_type, udt_name,
             is_nullable, column_default, character_maximum_length, numeric_precision, numeric_scale
      FROM information_schema.columns
      WHERE table_schema IN ('public', 'auth')
      ORDER BY table_schema, table_name, ordinal_position
    `,
    sql`
      SELECT n.nspname AS schema_name, c.relname AS table_name, con.conname, con.contype,
             pg_get_constraintdef(con.oid, true) AS definition
      FROM pg_constraint con
      JOIN pg_class c ON c.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
      ORDER BY c.relname, con.contype, con.conname
    `,
    sql`
      SELECT schemaname, tablename, indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
      ORDER BY tablename, indexname
    `,
    sql`
      SELECT c.relname AS viewname, c.reloptions, pg_get_viewdef(c.oid, true) AS definition
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'v'
      ORDER BY c.relname
    `,
    sql`
      SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args,
             pg_get_functiondef(p.oid) AS definition, p.proacl::text AS acl
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prokind IN ('f', 'p')
      ORDER BY p.proname
    `,
    sql`
      SELECT event_object_schema, event_object_table, trigger_name, action_timing,
             event_manipulation, action_orientation, action_statement
      FROM information_schema.triggers
      WHERE event_object_schema IN ('public', 'auth')
      ORDER BY event_object_schema, event_object_table, trigger_name
    `,
    sql`
      SELECT schemaname, tablename, policyname, permissive, roles::text[] AS roles, cmd, qual, with_check
      FROM pg_policies
      WHERE schemaname IN ('public', 'storage')
      ORDER BY schemaname, tablename, policyname
    `,
    sql`
      SELECT table_schema, table_name, grantee, privilege_type, is_grantable
      FROM information_schema.role_table_grants
      WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated', 'service_role', 'PUBLIC')
      ORDER BY table_name, grantee, privilege_type
    `,
    sql`
      SELECT sequence_schema, sequence_name, data_type, start_value, increment, minimum_value, maximum_value
      FROM information_schema.sequences
      WHERE sequence_schema = 'public'
      ORDER BY sequence_name
    `,
    sql`SELECT * FROM storage.buckets ORDER BY id`,
    sql`SELECT id, bucket_id, name, owner, metadata, created_at, updated_at, last_accessed_at FROM storage.objects ORDER BY bucket_id, name`,
  ]);

  // 2. Data Extraction (public base tables + critical auth recovery tables)
  const publicData = {};
  const checksums = {};
  let totalPublicRows = 0;

  for (const t of publicTables) {
    const name = t.table_name;
    const rows = await sql.unsafe(`SELECT * FROM public."${name}"`);
    publicData[name] = rows;
    checksums[`public.${name}`] = {
      rows: rows.length,
      sha256: sha256(JSON.stringify(rows)),
    };
    totalPublicRows += rows.length;
  }

  const authTablesToBackup = ["users", "identities", "mfa_factors", "one_time_tokens"];
  const authData = {};
  for (const tbl of authTablesToBackup) {
    try {
      const rows = await sql.unsafe(`SELECT * FROM auth."${tbl}"`);
      authData[tbl] = rows;
      checksums[`auth.${tbl}`] = {
        rows: rows.length,
        sha256: sha256(JSON.stringify(rows)),
      };
    } catch (err) {
      console.warn(`[Backup Note] Could not dump auth.${tbl}:`, err.message);
    }
  }

  // 3. Generate SQL DDL snapshot for public schema reconstruction
  const sqlLines = [
    `-- CAVENHUSRT Schema & Security Snapshot (${stamp})`,
    `-- Engine: ${pgVersionRow[0]?.version || "PostgreSQL"}`,
    "",
  ];
  for (const e of extensions) {
    sqlLines.push(`CREATE EXTENSION IF NOT EXISTS "${e.extname}" WITH SCHEMA "${e.schema}";`);
  }
  sqlLines.push("");
  for (const colGroupTable of publicTables) {
    const tbl = colGroupTable.table_name;
    const tblCols = columns.filter((c) => c.table_schema === "public" && c.table_name === tbl);
    const tblCons = constraints.filter((c) => c.table_name === tbl);
    const colDefs = tblCols.map((c) => {
      const typeExpr =
        c.data_type === "ARRAY"
          ? `${c.udt_name.replace(/^_/, "")}[]`
          : c.udt_name === "jsonb"
            ? "jsonb"
            : c.udt_name === "uuid"
              ? "uuid"
              : c.udt_name === "timestamptz"
                ? "timestamptz"
                : c.data_type;
      const nn = c.is_nullable === "NO" ? " NOT NULL" : "";
      const def = c.column_default ? ` DEFAULT ${c.column_default}` : "";
      return `  "${c.column_name}" ${typeExpr}${nn}${def}`;
    });
    const pkAndUnique = tblCons
      .filter((c) => c.contype === "p" || c.contype === "u" || c.contype === "c")
      .map((c) => `  CONSTRAINT "${c.conname}" ${c.definition}`);
    sqlLines.push(`CREATE TABLE IF NOT EXISTS public."${tbl}" (`);
    sqlLines.push([...colDefs, ...pkAndUnique].join(",\n"));
    sqlLines.push(");");
    if (colGroupTable.rls_enabled) {
      sqlLines.push(`ALTER TABLE public."${tbl}" ENABLE ROW LEVEL SECURITY;`);
    }
    sqlLines.push("");
  }
  for (const fc of constraints.filter((c) => c.contype === "f")) {
    sqlLines.push(
      `ALTER TABLE public."${fc.table_name}" ADD CONSTRAINT "${fc.conname}" ${fc.definition};`,
    );
  }
  sqlLines.push("");
  for (const idx of indexes) {
    if (
      !constraints.some(
        (c) => c.conname === idx.indexname && (c.contype === "p" || c.contype === "u"),
      )
    ) {
      sqlLines.push(`${idx.indexdef};`);
    }
  }
  sqlLines.push("");
  for (const v of views) {
    const opts = v.reloptions ? ` WITH (${v.reloptions.join(", ")})` : "";
    sqlLines.push(`CREATE OR REPLACE VIEW public."${v.viewname}"${opts} AS\n${v.definition};`);
  }
  sqlLines.push("");
  for (const fn of functions) {
    sqlLines.push(`${fn.definition};`);
  }
  sqlLines.push("");
  for (const pol of policies) {
    const roleList = Array.isArray(pol.roles) ? pol.roles.join(", ") : "public";
    const perm = pol.permissive === "PERMISSIVE" ? "AS PERMISSIVE" : "AS RESTRICTIVE";
    const usingClause = pol.qual ? ` USING (${pol.qual})` : "";
    const checkClause = pol.with_check ? ` WITH CHECK (${pol.with_check})` : "";
    sqlLines.push(
      `CREATE POLICY "${pol.policyname}" ON "${pol.schemaname}"."${pol.tablename}" ${perm} FOR ${pol.cmd} TO ${roleList}${usingClause}${checkClause};`,
    );
  }

  const schemaSql = sqlLines.join("\n");

  // 4. Storage object binaries export
  const storageExported = await exportStorageObjects(backupDir, storageBuckets, storageObjects);

  // 5. Write logical bundle + schema + manifest + encrypted archive (when key present)
  const fullBundle = {
    version: 2,
    timestamp: new Date().toISOString(),
    database: pgVersionRow[0] || {},
    metadata: {
      extensions,
      enums,
      publicTables,
      columns,
      constraints,
      indexes,
      views,
      functions: functions.map((f) => ({
        proname: f.proname,
        args: f.args,
        acl: f.acl,
        definition: f.definition,
      })),
      triggers,
      policies,
      tableGrants,
      sequences,
      storageBuckets,
      storageObjects,
    },
    data: {
      public: publicData,
      auth: authData,
    },
  };

  const bundleJson = JSON.stringify(fullBundle, null, 2);
  fs.writeFileSync(path.join(backupDir, "schema.sql"), schemaSql, "utf8");
  fs.writeFileSync(path.join(backupDir, "full_backup.json"), bundleJson, "utf8");

  let encryptedFile = null;
  if (encSecret) {
    const encPayload = encryptJsonBundle(bundleJson, encSecret);
    fs.writeFileSync(path.join(backupDir, "full_backup.enc.json"), encPayload, "utf8");
    encryptedFile = {
      path: "full_backup.enc.json",
      alg: "aes-256-gcm",
      sha256: sha256(encPayload),
      plaintextSha256: sha256(bundleJson),
    };
  }

  const manifest = {
    version: 2,
    timestamp: fullBundle.timestamp,
    snapshotDir: backupDir,
    publicTableCount: publicTables.length,
    totalPublicRows,
    authUsersCount: authData.users?.length || 0,
    authIdentitiesCount: authData.identities?.length || 0,
    storageBucketsCount: storageBuckets.length,
    storageObjectsCount: storageObjects.length,
    storageDownloadedCount: storageExported.length,
    schemaSqlSha256: sha256(schemaSql),
    fullBackupSha256: sha256(bundleJson),
    encryptedBundle: encryptedFile,
    checksums,
    storageFiles: storageExported,
  };

  fs.writeFileSync(
    path.join(backupDir, "manifest.json"),
    JSON.stringify(manifest, null, 2),
    "utf8",
  );

  console.log(`Public tables backed up: ${publicTables.length} (${totalPublicRows} rows)`);
  console.log(
    `Auth users / identities: ${manifest.authUsersCount} / ${manifest.authIdentitiesCount}`,
  );
  console.log(`Storage buckets / objects: ${storageBuckets.length} / ${storageObjects.length}`);
  console.log(
    `Encrypted AES-256-GCM archive: ${encryptedFile ? "CREATED" : "SKIPPED (no encryption key)"}`,
  );
  console.log(`Snapshot saved at: ${backupDir}`);
}

runBackup()
  .catch((err) => {
    console.error("[Backup Error]:", err);
    process.exit(1);
  })
  .finally(() => sql.end());
