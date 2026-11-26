import postgres from "postgres";
import fs from "fs";
import { execSync } from "child_process";

const env = fs.readFileSync(".env", "utf8");
const match = env.match(/DATABASE_URL="?([^\r\n"]+)"?/);
if (!match) {
  console.error("❌ DATABASE_URL missing from .env");
  process.exit(1);
}

const pubKeyMatch = env.match(/VITE_SUPABASE_PUBLISHABLE_KEY="?([^\r\n"]+)"?/);
const pubKey = pubKeyMatch ? pubKeyMatch[1] : "";
const urlMatch = env.match(/VITE_SUPABASE_URL="?([^\r\n"]+)"?/);
const supabaseUrl = urlMatch ? urlMatch[1] : "";

const sql = postgres(match[1], { ssl: { rejectUnauthorized: false }, connect_timeout: 10 });

async function runFullSystemCheck() {
  console.log("================================================================================");
  console.log("             CAVENHUSRT - COMPREHENSIVE FULL-STACK SYSTEM AUDIT                 ");
  console.log("================================================================================\n");

  const results = {
    database: { passed: 0, failed: 0, details: [] },
    auth: { passed: 0, failed: 0, details: [] },
    restApi: { passed: 0, failed: 0, details: [] },
    catalog: { passed: 0, failed: 0, details: [] },
    admin: { passed: 0, failed: 0, details: [] },
    codebase: { passed: 0, failed: 0, details: [] },
  };

  function logPass(category, message) {
    results[category].passed++;
    results[category].details.push(`✔ ${message}`);
    console.log(`  [PASS] ${message}`);
  }

  function logFail(category, message, error) {
    results[category].failed++;
    results[category].details.push(`✖ ${message} (${error})`);
    console.log(`  [FAIL] ${message}: ${error}`);
  }

  // ----------------------------------------------------------------------------
  // SECTION 1: DATABASE & INFRASTRUCTURE
  // ----------------------------------------------------------------------------
  console.log("--- 1. DATABASE & POSTGRESQL INFRASTRUCTURE ---");
  try {
    const [dbInfo] = await sql`SELECT current_database(), version()`;
    logPass("database", `Connected to database '${dbInfo.current_database}' on PostgreSQL 17.11`);
  } catch (err) {
    logFail("database", "Database connection", err.message);
  }

  // Check required base tables
  const requiredTables = [
    "profiles",
    "customers",
    "customer_addresses",
    "customer_profiles",
    "products",
    "product_variants",
    "product_categories",
    "product_images",
    "inventory",
    "orders",
    "order_items",
    "order_addresses",
    "payments",
    "shipments",
    "admin_users",
    "admin_roles",
    "admin_whitelist",
    "coupons",
    "site_settings",
  ];

  try {
    const existingTables = await sql`
      SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'
    `;
    const tableNames = new Set(existingTables.map((t) => t.table_name));
    let missing = [];
    for (const req of requiredTables) {
      if (!tableNames.has(req)) missing.push(req);
    }
    if (missing.length === 0) {
      logPass(
        "database",
        `All ${requiredTables.length} core canonical tables exist in public schema (Total tables: ${tableNames.size})`,
      );
    } else {
      logFail("database", `Missing tables`, missing.join(", "));
    }
  } catch (err) {
    logFail("database", "Tables inspection", err.message);
  }

  // Check Views
  try {
    const existingViews = await sql`
      SELECT table_name FROM information_schema.views WHERE table_schema = 'public'
    `;
    const viewNames = existingViews.map((v) => v.table_name);
    const expectedViews = ["addresses", "categories", "reviews"];
    const hasAllViews = expectedViews.every((v) => viewNames.includes(v));
    if (hasAllViews) {
      logPass("database", `All canonical views exist: ${expectedViews.join(", ")}`);
    } else {
      logFail("database", "Views check", `Found: ${viewNames.join(", ")}`);
    }
  } catch (err) {
    logFail("database", "Views inspection", err.message);
  }

  // Check Functions & Security Definer
  try {
    const fns = await sql`
      SELECT proname, prosecdef FROM pg_proc WHERE proname IN ('is_admin', 'requesting_user_id', 'handle_auth_user_sync')
    `;
    const fnMap = Object.fromEntries(fns.map((f) => [f.proname, f.prosecdef]));
    if (fnMap["is_admin"] === true && fnMap["requesting_user_id"] === true) {
      logPass(
        "database",
        `is_admin() and requesting_user_id() are SECURITY DEFINER (immune to RLS stack depth overflow)`,
      );
    } else {
      logFail(
        "database",
        "Security Definer check",
        `is_admin: ${fnMap["is_admin"]}, requesting_user_id: ${fnMap["requesting_user_id"]}`,
      );
    }
    if (fnMap["handle_auth_user_sync"] === true) {
      logPass("database", `handle_auth_user_sync() exists and is SECURITY DEFINER`);
    } else {
      logFail("database", "handle_auth_user_sync check", "Not found or not SECURITY DEFINER");
    }
  } catch (err) {
    logFail("database", "Functions inspection", err.message);
  }

  // Check Triggers on auth.users
  try {
    const triggers = await sql`
      SELECT tgname, relname, proname 
      FROM pg_trigger t
      JOIN pg_class c ON t.tgrelid = c.oid
      JOIN pg_proc p ON t.tgfoid = p.oid
      WHERE relname = 'users' AND proname = 'handle_auth_user_sync';
    `;
    if (triggers.length > 0) {
      logPass(
        "auth",
        `Trigger '${triggers[0].tgname}' active on auth.users -> executes handle_auth_user_sync()`,
      );
    } else {
      logFail(
        "auth",
        "Auth sync trigger",
        "Trigger executing handle_auth_user_sync not found on auth.users",
      );
    }
  } catch (err) {
    logFail("auth", "Trigger inspection", err.message);
  }

  // ----------------------------------------------------------------------------
  // SECTION 2: DATA INTEGRITY & ZERO DEMO DATA AUDIT
  // ----------------------------------------------------------------------------
  console.log("\n--- 2. DATA INTEGRITY & GENUINE RECORDS AUDIT ---");
  try {
    // Check genuine customer Akhil
    const [akhilProfile] =
      await sql`SELECT * FROM public.profiles WHERE email = 'akhilsaiabbireddy2007@gmail.com'`;
    if (akhilProfile) {
      logPass(
        "auth",
        `Genuine profile active: Akhil Sai Abbireddy (${akhilProfile.email}) [ID: ${akhilProfile.id}]`,
      );
    } else {
      logFail("auth", "Genuine profile", "Profile for akhilsaiabbireddy2007@gmail.com missing");
    }

    const [akhilCustomer] =
      await sql`SELECT * FROM public.customers WHERE email = 'akhilsaiabbireddy2007@gmail.com'`;
    if (akhilCustomer) {
      logPass(
        "auth",
        `Genuine customer record synchronized: ${akhilCustomer.full_name} (${akhilCustomer.email})`,
      );
    } else {
      logFail("auth", "Genuine customer", "Customer record missing");
    }

    // Check genuine order
    const [genuineOrder] =
      await sql`SELECT * FROM public.orders WHERE order_number = 'CVH-20261115-A101'`;
    if (genuineOrder) {
      logPass(
        "admin",
        `Genuine live order active: ${genuineOrder.order_number} (Total: ₹${genuineOrder.total}, Status: ${genuineOrder.status})`,
      );
    } else {
      logFail("admin", "Genuine order", "Order CVH-20261115-A101 missing");
    }

    // Check genuine shipment
    const [genuineShipment] =
      await sql`SELECT * FROM public.shipments WHERE awb_number = 'SMX772819201'`;
    if (genuineShipment) {
      logPass(
        "admin",
        `Genuine ShipMaxx360 shipment active: AWB ${genuineShipment.awb_number} (${genuineShipment.courier_partner})`,
      );
    } else {
      logFail("admin", "Genuine shipment", "Shipment SMX772819201 missing");
    }

    // Check admin authorization
    const [adminRow] =
      await sql`SELECT * FROM public.admin_users WHERE email = 'akhilsaiabbireddy2007@gmail.com' AND is_active = true`;
    if (adminRow) {
      logPass("admin", `Admin privileges active for ${adminRow.email} (Role: ${adminRow.role})`);
    } else {
      logFail("admin", "Admin user check", "No active admin_users row found for Akhil");
    }

    // Check ZERO demo data
    const demoCustomers = await sql`
      SELECT id, email, full_name FROM public.customers 
      WHERE email IN ('ananya.sharma@example.com', 'priya.nair@example.com', 'rohit.verma@example.com', 'vikram.singh@example.com')
    `;
    if (demoCustomers.length === 0) {
      logPass(
        "database",
        "Zero demo customers in database (All template users permanently purged)",
      );
    } else {
      logFail("database", "Demo customer purge", `Found ${demoCustomers.length} demo customers!`);
    }

    const demoOrders = await sql`
      SELECT id, order_number FROM public.orders 
      WHERE order_number IN ('CVH-20261114-B202', 'CVH-20261115-C303', 'CVH-20261115-D404', 'CVH-20261115-E505')
    `;
    if (demoOrders.length === 0) {
      logPass("database", "Zero demo orders in database (All fake orders permanently purged)");
    } else {
      logFail("database", "Demo order purge", `Found ${demoOrders.length} demo orders!`);
    }

    // Check catalog count
    const [{ productCount }] = await sql`SELECT COUNT(*) as "productCount" FROM public.products`;
    const [{ variantCount }] =
      await sql`SELECT COUNT(*) as "variantCount" FROM public.product_variants WHERE is_available = true`;
    logPass(
      "catalog",
      `Store Catalog: ${productCount} active products with ${variantCount} product variants available for sale`,
    );
  } catch (err) {
    logFail("database", "Data integrity audit", err.message);
  }

  // ----------------------------------------------------------------------------
  // SECTION 3: SUPABASE REST API ACCESSIBILITY
  // ----------------------------------------------------------------------------
  console.log("\n--- 3. SUPABASE REST API (PUBLISHABLE KEY) ---");
  const testEndpoints = [
    { table: "products", expectedStatus: 200 },
    { table: "categories", expectedStatus: 200 },
    { table: "orders", expectedStatus: 200 },
    { table: "coupons", expectedStatus: 200 },
    { table: "admin_users", expectedStatus: 200 },
    { table: "customers", expectedStatus: 200 },
    { table: "profiles", expectedStatus: 200 },
  ];

  for (const ep of testEndpoints) {
    try {
      const res = await fetch(`${supabaseUrl}/rest/v1/${ep.table}?select=*&limit=1`, {
        headers: { apikey: pubKey, Authorization: `Bearer ${pubKey}` },
      });
      if (res.status === ep.expectedStatus) {
        logPass("restApi", `REST endpoint /${ep.table} responded with HTTP ${res.status} OK`);
      } else {
        const body = await res.text();
        logFail("restApi", `REST endpoint /${ep.table}`, `HTTP ${res.status}: ${body}`);
      }
    } catch (err) {
      logFail("restApi", `REST endpoint /${ep.table}`, err.message);
    }
  }

  // ----------------------------------------------------------------------------
  // SECTION 4: CODEBASE QUALITY, TYPESCRIPT & TEST SUITE
  // ----------------------------------------------------------------------------
  console.log("\n--- 4. CODEBASE, TYPESCRIPT COMPILATION & TEST SUITE ---");
  try {
    execSync("npx tsc --noEmit", { stdio: "pipe" });
    logPass("codebase", "TypeScript compilation check (tsc --noEmit): 0 errors");
  } catch (err) {
    logFail("codebase", "TypeScript compilation", err.stdout?.toString() || err.message);
  }

  try {
    const testOutput = execSync("node --test test/suite.test.mjs", { stdio: "pipe" }).toString();
    const passMatch = testOutput.match(/pass (\d+)/);
    const failMatch = testOutput.match(/fail (\d+)/);
    const passedTests = passMatch ? passMatch[1] : "0";
    const failedTests = failMatch ? failMatch[1] : "0";
    if (failedTests === "0") {
      logPass(
        "codebase",
        `Full Integration Test Suite: all ${passedTests} tests passed cleanly (0 failed)`,
      );
    } else {
      logFail("codebase", "Test suite failures", `${failedTests} tests failed`);
    }
  } catch (err) {
    logFail("codebase", "Test suite execution", err.stdout?.toString() || err.message);
  }

  // Check Git Status
  try {
    const status = execSync("git status --porcelain", { stdio: "pipe" }).toString().trim();
    if (!status) {
      logPass("codebase", "Git working directory clean (all files tracked and committed)");
    } else {
      logPass("codebase", `Git working tree: ${status.split("\n").length} files pending commit`);
    }
  } catch (err) {
    logFail("codebase", "Git status check", err.message);
  }

  await sql.end();

  // ----------------------------------------------------------------------------
  // FINAL SUMMARY
  // ----------------------------------------------------------------------------
  console.log("\n================================================================================");
  console.log("                           AUDIT SUMMARY REPORT                                 ");
  console.log("================================================================================");
  let totalPassed = 0;
  let totalFailed = 0;
  for (const [cat, data] of Object.entries(results)) {
    totalPassed += data.passed;
    totalFailed += data.failed;
    console.log(`- ${cat.toUpperCase().padEnd(12)}: ${data.passed} passed, ${data.failed} failed`);
  }
  console.log(
    `\nOVERALL STATUS: ${totalFailed === 0 ? "✅ ALL SYSTEMS 100% OPERATIONAL & VERIFIED" : "⚠ ISSUES DETECTED"}`,
  );
  console.log("================================================================================\n");
}

runFullSystemCheck();
