import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const env = fs.readFileSync(".env", "utf8");
const urlMatch = env.match(/SUPABASE_URL="?([^\r\n"]+)"?/);
const keyMatch = env.match(/SUPABASE_PUBLISHABLE_KEY="?([^\r\n"]+)"?/);

const client = createClient(urlMatch[1], keyMatch[1]);

async function test() {
  console.log("Testing client.auth.getUser with dummy token...");
  const { data, error } = await client.auth.getUser("dummy.jwt.token");
  console.log("Response:", { user: data.user, error: error?.message });
}

test();
