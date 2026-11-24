import { defineConfig, loadEnv } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";
import path from "node:path";

export default defineConfig(({ mode }) => {
  // Load full environment variables into process.env so server functions have DATABASE_URL
  const env = loadEnv(mode, process.cwd(), "");
  for (const [key, val] of Object.entries(env)) {
    if (!process.env[key]) {
      process.env[key] = val;
    }
  }

  const nitroPreset = process.env["NITRO_PRESET"] || (process.env["VERCEL"] ? "vercel" : undefined);

  return {
    plugins: [
      tailwindcss(),
      tanstackStart({
        server: { entry: "server" },
      }),
      viteReact(),
      nitro(nitroPreset ? { preset: nitroPreset } : {}),
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
