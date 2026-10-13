import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  timeout: 45000,
  use: {
    baseURL: "http://127.0.0.1:5174",
    headless: true,
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 5174 --strictPort",
    url: "http://127.0.0.1:5174",
    reuseExistingServer: false,
    env: {
      VITE_SUPABASE_URL: "https://controlgps-tests.supabase.co",
      VITE_SUPABASE_ANON_KEY: "public-test-key",
      VITE_SUPABASE_SCHEMA: "controlgps",
      VITE_GPS_STALE_MS: "120000",
    },
  },
});
