import fs from "fs";

const url = "https://ewlsrypetobkwrwtmmgh.supabase.co";
const key = "sb_publishable_apZ6lrNsDBkfDvic9YAUQw_Flzj3z1h";

async function testApi() {
  console.log("Testing Supabase REST API...");
  try {
    const res = await fetch(`${url}/rest/v1/products?select=count`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
    });
    console.log("Status with Bearer:", res.status, res.statusText);
    const text = await res.text();
    console.log("Response body:", text);
  } catch (err) {
    console.error("Fetch error:", err.message);
  }

  try {
    const res2 = await fetch(`${url}/rest/v1/products?select=count`, {
      headers: {
        apikey: key,
      },
    });
    console.log("Status without Bearer (apikey only):", res2.status, res2.statusText);
    const text2 = await res2.text();
    console.log("Response body:", text2);
  } catch (err) {
    console.error("Fetch error 2:", err.message);
  }
}

testApi();
