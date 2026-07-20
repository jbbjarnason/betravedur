import { defineConfig } from "@playwright/test";

// E2E drives the PRODUCTION preview build (vite build && vite preview), NOT the dev
// server — the maplibre-gl 5.21.x × Vite worker breakage (RESEARCH A1 / Pitfall 2) was
// production-only. baseURL honours the /betravedur/ base path (Pitfall 4).
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:4173/betravedur/",
    headless: true,
    trace: "off",
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
  webServer: {
    command: "npm run build && npm run preview -- --port 4173 --strictPort",
    url: "http://localhost:4173/betravedur/",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
