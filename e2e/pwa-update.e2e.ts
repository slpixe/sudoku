import {expect, test} from "@playwright/test";

test("keeps an old version working until the user accepts the update prompt", async ({baseURL, page, request}) => {
  if (!baseURL) {
    throw new Error("Playwright baseURL must be configured for the PWA update test");
  }

  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/#/select-game");
  await expect(page.getByRole("heading", {name: "Select Game"})).toBeVisible();
  await page.evaluate(async () => navigator.serviceWorker.ready);
  if (!(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)))) {
    await page.reload({waitUntil: "domcontentloaded"});
  }
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await expect(page.locator('script[type="module"]')).toHaveAttribute("src", /-old\.js$/);

  const switchResponse = await request.post(new URL("/__pwa-test/switch-to-new", baseURL).toString());
  expect(switchResponse.ok()).toBe(true);

  await page.evaluate(async () => {
    const originalNow = performance.now.bind(performance);
    Object.defineProperty(performance, "now", {
      configurable: true,
      value: () => originalNow() + 61_000,
    });
    const registration = await navigator.serviceWorker.getRegistration();
    await registration?.update();
  });

  await expect(page.getByTestId("pwa-update-toast")).toBeVisible();
  await expect(page.getByText("Something went wrong")).toHaveCount(0);

  await page.getByTestId("select-game-card-1").click();
  await expect(page.getByTestId("sudoku-board")).toBeVisible();
  await expect(page.getByTestId("current-game-label")).toHaveText("E-1");
  await expect(page.getByTestId("pwa-update-toast")).toBeVisible();
  expect(pageErrors).toEqual([]);

  await page.getByTestId("pwa-update-action").click();

  await expect(page.locator('script[type="module"]')).toHaveAttribute("src", /-new\.js$/);
  await expect(page.getByTestId("sudoku-board")).toBeVisible();
  await expect(page.getByTestId("current-game-label")).toHaveText("E-1");
  await expect(page.getByTestId("pwa-update-toast")).toHaveCount(0);
  await expect(page.getByText("Something went wrong")).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});
