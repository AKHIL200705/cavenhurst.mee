const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").replace(/\/+$/, "");
const key = (
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  ""
).trim();

if (!url || !key) {
  console.error(
    "Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY. Run with: node --env-file=.env scripts/test_supabase_tables.mjs",
  );
  process.exit(1);
}

const tables = [
  "products",
  "categories",
  "profiles",
  "orders",
  "admin_users",
  "customers",
  "coupons",
];

async function checkAll() {
  for (const t of tables) {
    try {
      const res = await fetch(`${url}/rest/v1/${t}?select=*&limit=1`, {
        headers: { apikey: key },
      });
      const data = await res.json();
      console.log(
        `Table ${t}: status ${res.status}`,
        Array.isArray(data) ? `rows: ${data.length}` : data,
      );
    } catch (e) {
      console.error(`Error on ${t}:`, e.message);
    }
  }
}

checkAll();
