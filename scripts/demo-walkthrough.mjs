#!/usr/bin/env node
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";

const base = process.env.DEMO_URL || "http://127.0.0.1:3000";
const makerKey = readFileSync(new URL("../.secrets/maker.key", import.meta.url), "utf8").trim();

const browser = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  headless: false,
  args: [
    "--kiosk",
    "--start-fullscreen",
    "--disable-infobars",
    "--no-default-browser-check",
    "--window-position=0,0",
    "--window-size=1920,1200",
  ],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1200 } });

async function hold(ms) {
  await page.waitForTimeout(ms);
}

await page.goto(base, { waitUntil: "networkidle" });
await page.evaluate(
  ({ key }) => {
    localStorage.setItem("nectar.demoKey", key);
    localStorage.setItem("nectar.chainId", "31337");
  },
  { key: makerKey },
);
await hold(4000);

for (const [path, wait] of [
  ["/overview", 12000],
  ["/markets", 10000],
  ["/liquidity", 16000],
  ["/executions", 16000],
  ["/analytics", 12000],
  ["/settings", 8000],
  ["/", 8000],
]) {
  await page.goto(base + path, { waitUntil: "domcontentloaded" });
  try {
    await page.getByText("Rehearsal wallet").click({ timeout: 1500 });
  } catch {}
  if (path === "/liquidity" || path === "/overview") {
    try {
      await page.getByText("Local Anvil").click({ timeout: 1500 });
    } catch {}
  }
  await hold(wait);
}

await hold(2000);
await browser.close();
console.log("walkthrough finished");
