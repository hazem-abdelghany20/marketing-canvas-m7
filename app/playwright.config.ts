import os from "node:os";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

// Own ports and a throwaway data directory, so e2e never touches a dev board.
const API_PORT = 4100;
const APP_PORT = 5174;
export const API_URL = `http://localhost:${API_PORT}`;

export default defineConfig({
  testDir: "e2e",
  // Specs share one API, and reset it between tests.
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${APP_PORT}`,
    trace: "retain-on-failure",
  },
  // The chat rail is a 360px column beside the canvas, so the window is 360px wider than Desktop
  // Chrome's 1280 and the canvas keeps the 1280x720 that older geometry specs were written against.
  projects: [
    {
      name: "chromium",
      // The phone layout has its own project, below.
      testIgnore: /phone-.*\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280 + 360, height: 720 } },
    },
    {
      // Below 640px the workspace is four screens and a bar (tickets 023-029): a touch screen, 390 wide,
      // which a spec resizes across the sizes it cares about.
      name: "phone",
      testMatch: /phone-.*\.spec\.ts/,
      use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } },
    },
  ],
  webServer: [
    {
      command: "node ../api/server.js",
      url: `${API_URL}/health`,
      env: { PORT: String(API_PORT), MC_DATA_DIR: path.join(os.tmpdir(), "marketing-canvas-e2e") },
      reuseExistingServer: false,
    },
    {
      command: `npx vite --port ${APP_PORT} --strictPort`,
      url: `http://localhost:${APP_PORT}`,
      env: { VITE_API_URL: API_URL },
      reuseExistingServer: false,
    },
  ],
});
