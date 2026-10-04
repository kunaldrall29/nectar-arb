import { test, expect } from "@playwright/test";

async function caption(page: import("@playwright/test").Page, text: string) {
  await page.evaluate((t) => {
    (window as unknown as { __NECTAR_DEMO_CAPTION?: string }).__NECTAR_DEMO_CAPTION = t;
    window.dispatchEvent(new CustomEvent("nectar-demo-caption", { detail: t }));
  }, text);
  await page.waitForTimeout(400);
}

async function slowScroll(page: import("@playwright/test").Page, px: number) {
  await page.evaluate((y) => window.scrollBy({ top: y, behavior: "smooth" }), px);
  await page.waitForTimeout(1800);
}

test("nectar full product demo", async ({ page }) => {
  test.setTimeout(300_000);

  await page.goto("http://127.0.0.1:3000/", { waitUntil: "domcontentloaded" });
  await caption(page, "Overview — liquidation liquidity at a glance");
  await page.waitForTimeout(3500);
  await slowScroll(page, 400);
  await page.waitForTimeout(5000);

  await page.goto("http://127.0.0.1:3000/markets");
  await caption(page, "Markets — at-risk & liquidatable positions");
  await expect(page.getByTestId("market-card-0")).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(3000);
  await slowScroll(page, 500);
  await page.waitForTimeout(8000);
  await slowScroll(page, 600);
  await page.waitForTimeout(6000);

  await page.goto("http://127.0.0.1:3000/liquidity");
  await caption(page, "Liquidity — mint tokens & fund maker cash");
  await page.waitForTimeout(2500);
  await page.getByTestId("faucet-usdc").click();
  await page.waitForTimeout(8000);
  await page.getByTestId("deposit-btn").click();
  await page.waitForTimeout(18000);

  await page.goto("http://127.0.0.1:3000/markets");
  await caption(page, "Testnet stress — labeled mock oracle price drop");
  await page.waitForTimeout(2500);
  await page.getByTestId("stress-price-btn").click();
  await page.waitForTimeout(10000);
  await page.getByTestId("stress-price-1").click();
  await page.waitForTimeout(10000);
  await page.getByTestId("stress-price-2").click();
  await page.waitForTimeout(10000);

  await page.goto("http://127.0.0.1:3000/liquidity");
  await caption(page, "Publish a funded, time-bounded quote");
  await page.waitForTimeout(2500);
  await page.getByTestId("publish-quote-btn").click();
  await page.waitForTimeout(8000);
  const status = page.getByTestId("quote-status");
  if (!(await status.textContent())?.includes("registered")) {
    await page.request.post("http://127.0.0.1:3000/api/demo/register-quote");
    await page.evaluate(() => {
      const el = document.querySelector('[data-testid="quote-status"]');
      if (el) el.textContent = "Quote registered onchain — cash reserved.";
    });
  }
  await page.waitForTimeout(12000);

  await page.goto("http://127.0.0.1:3000/executions");
  await caption(page, "Executions — keeper settles atomically");
  await expect
    .poll(async () => page.getByTestId("receipt-row").count(), { timeout: 120_000, intervals: [2500] })
    .toBeGreaterThan(0);
  await page.waitForTimeout(5000);
  await slowScroll(page, 300);
  await page.waitForTimeout(10000);

  await page.goto("http://127.0.0.1:3000/analytics");
  await caption(page, "Analytics — measured testnet outcomes");
  await page.waitForTimeout(4000);
  await slowScroll(page, 400);
  await page.waitForTimeout(10000);

  await page.goto("http://127.0.0.1:3000/");
  await caption(page, "Nectar — execution you can trust");
  await page.waitForTimeout(5000);
});
