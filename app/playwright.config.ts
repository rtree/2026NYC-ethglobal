import { defineConfig } from "@playwright/test";

// E2E against the running dev server (Vite on 5174 proxying /api to the control panel on 8080).
// Start both before running: see app/e2e/README note. CI-friendly: set E2E_BASE_URL.
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:5174",
    headless: true,
    trace: "off",
  },
});
