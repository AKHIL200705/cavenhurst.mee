import postgres from 'postgres';

async function testDirect() {
  console.log("Testing direct connection to db.ewlsrypetobkwrwtmmgh.supabase.co:5432...");
  try {
    const sql = postgres('postgresql://postgres:Cavenhurst%40123@db.ewlsrypetobkwrwtmmgh.supabase.co:5432/postgres', {
      ssl: { rejectUnauthorized: false },
      connect_timeout: 5
    });
    const res = await sql`SELECT current_database(), version()`;
    console.log("DIRECT CONNECTION SUCCESS:", res[0]);
    await sql.end();
  } catch (err) {
    console.error("DIRECT CONNECTION FAILED:", err.message);
  }

  console.log("\nTesting pooler connection to aws-0-ap-southeast-1.pooler.supabase.com:5432...");
  try {
    const sqlPooler = postgres('postgresql://postgres.ewlsrypetobkwrwtmmgh:Cavenhurst%40123@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres', {
      ssl: { rejectUnauthorized: false },
      connect_timeout: 5
    });
    const resPooler = await sqlPooler`SELECT current_database(), version()`;
    console.log("POOLER CONNECTION SUCCESS:", resPooler[0]);
    await sqlPooler.end();
  } catch (err) {
    console.error("POOLER CONNECTION FAILED:", err.message);
  }
}

testDirect();
