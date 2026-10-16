import { defineConfig, devices } from "@playwright/test";
import { tmpdir } from "node:os";
import path from "node:path";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5173";
const base = new URL(baseURL);
const skipWebServer = process.env.PLAYWRIGHT_SKIP_WEB_SERVER === "true";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: process.env.PLAYWRIGHT_LIVE === "1" ? 1 : undefined,
  timeout: 60_000,
  expect: {
    timeout: 15_000,
  },
  use: {
    baseURL,
    screenshot: "only-on-failure",
    trace: "on-first-retry",
    video: "off",
  },
  projects: [
    {
      name: "chrome",
      use: {
        ...devices["Desktop Chrome"],
        channel: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
          ? undefined
          : "chrome",
        launchOptions: {
          executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
        },
      },
    },
  ],
  webServer: skipWebServer
    ? undefined
    : {
        env: {
          ...(process.env.PLAYWRIGHT_LIVE !== "1" && {
            NEOS_RESOURCE_DIR: path.join(tmpdir(), "neos-ts-e2e-resources"),
            NEOS_RESOURCE_CONFIG_DIR: path.join(tmpdir(), "neos-ts-e2e-config"),
          }),
          NEOS_RESOURCE_AUTO_SYNC: "0",
          NEOS_RESOURCE_OFFLINE:
            process.env.PLAYWRIGHT_LIVE === "1" ? "0" : "1",
        },
        command: `npm run dev -- --host ${base.hostname} --port ${
          base.port || "5173"
        }`,
        url: baseURL,
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
