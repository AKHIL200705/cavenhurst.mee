const url = "https://ewlsrypetobkwrwtmmgh.supabase.co";
const key = "sb_publishable_apZ6lrNsDBkfDvic9YAUQw_Flzj3z1h";

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
