#!/usr/bin/env node
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const outDir = "/opt/cursor/artifacts/demo_raw";
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  recordVideo: { dir: outDir, size: { width: 1280, height: 720 } },
});
const page = await context.newPage();
const base = "http://localhost:3000";

async function go(route, wait = 2500) {
  await page.goto(`${base}${route}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(wait);
}

await go("/");
await go("/markets");
await go("/liquidity", 3500);
await go("/executions", 3000);
await go("/analytics");
await go("/settings");
await go("/");

await context.close();
await browser.close();

const webm = fs.readdirSync(outDir).find((f) => f.endsWith(".webm"));
console.log(path.join(outDir, webm));
