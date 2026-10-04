import { test } from "@playwright/test";

test("nectar walkthrough", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("http://127.0.0.1:3000/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  await page.goto("http://127.0.0.1:3000/markets");
  await page.waitForTimeout(4000);
  await page.goto("http://127.0.0.1:3000/liquidity");
  await page.waitForTimeout(4000);
  await page.goto("http://127.0.0.1:3000/executions");
  await page.waitForTimeout(5000);
  await page.goto("http://127.0.0.1:3000/analytics");
  await page.waitForTimeout(4000);
  await page.goto("http://127.0.0.1:3000/settings");
  await page.waitForTimeout(3000);
  await page.goto("http://127.0.0.1:3000/");
  await page.waitForTimeout(2500);
});
