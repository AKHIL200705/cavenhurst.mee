import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "@playwright/test";

function loadEnvMap(): Record<string, string> {
  const result: Record<string, string> = {};
  const envPath = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return result;

  for (const rawLine of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx).trim();
    const val = line
      .slice(eqIdx + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    if (key) result[key] = val;
  }
  return result;
}

const fileEnv = loadEnvMap();
const e2ePort = Number(process.env["E2E_PORT"] || 3100);
const e2eBaseUrl = `http://127.0.0.1:${e2ePort}`;
const webhookSecret =
  process.env["RAZORPAY_WEBHOOK_SECRET"] ||
  fileEnv["RAZORPAY_WEBHOOK_SECRET"] ||
  "cavenhurst_e2e_razorpay_webhook_secret";

process.env["RAZORPAY_WEBHOOK_SECRET"] = webhookSecret;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: {
    timeout: 15_000,
  },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: e2eBaseUrl,
    channel: "chrome",
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    reducedMotion: "reduce",
  },
  webServer: {
    command: `npx vite dev --host 127.0.0.1 --port ${e2ePort}`,
    url: e2eBaseUrl,
    reuseExistingServer: false,
    timeout: 90_000,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...fileEnv,
      ...(process.env as Record<string, string>),
      RAZORPAY_WEBHOOK_SECRET: webhookSecret,
      E2E_DRY_RUN_EMAILJS: "true",
    },
  },
});
