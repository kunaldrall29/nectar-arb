import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "demo.walkthrough.ts",
  use: {
    video: { mode: "on", size: { width: 1280, height: 720 } },
    viewport: { width: 1280, height: 720 },
  },
});
