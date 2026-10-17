import { defineConfig, devices } from "@playwright/test";

// Tests get their own port: reusing a dev server on 5199 could serve another checkout.
const port = 5197;

// Headless Firefox on GitHub-hosted Ubuntu exposes no WebGL, so supportsWebGL()
// falls back to scene-dom. CI runs this project headed under xvfb with software GL.
const firefoxCi = !!process.env.CI;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  fullyParallel: true,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: `http://localhost:${port}`,
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: `npx vite --port ${port} --strictPort`,
    url: `http://localhost:${port}/index.html`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    {
      name: "firefox",
      use: {
        ...devices["Desktop Firefox"],
        headless: !firefoxCi,
        launchOptions: firefoxCi
          ? {
              firefoxUserPrefs: {
                "webgl.force-enabled": true,
                "webgl.disabled": false,
                "webgl.enable-webgl2": true,
                "webgl.forbid-software": false,
                "gfx.webrender.all": true,
                "gfx.webrender.software": true,
                "layers.acceleration.disabled": false,
                "layers.acceleration.force-enabled": true,
              },
            }
          : undefined,
      },
    },
    { name: "mobile-safari", use: { ...devices["iPhone 14"] } },
  ],
});
