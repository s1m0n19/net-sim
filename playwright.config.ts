import { defineConfig, devices } from "@playwright/test";

// I test della pagina: pochi percorsi completi, eseguiti in un browser
// vero sul sito costruito, cioè su ciò che viene pubblicato.
//
//   npm run test:e2e
//
// Prima costruiscono il sito e lo servono in locale sulla porta 4173.
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  // Un test alla volta: il tempo reale della simulazione non va messo
  // in gara con altri browser sulla stessa macchina.
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: "http://localhost:4173",
    viewport: { width: 1400, height: 860 },
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1400, height: 860 } } },
    { name: "firefox", use: { ...devices["Desktop Firefox"], viewport: { width: 1400, height: 860 } } },
    { name: "webkit", use: { ...devices["Desktop Safari"], viewport: { width: 1400, height: 860 } } },
  ],
  webServer: {
    command: "npm run build && npx vite preview --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
