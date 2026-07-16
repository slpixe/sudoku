import {expect, type Page, test} from "@playwright/test";

type ServiceWorkerStatus = {
  controlled: boolean;
  registrations: number;
  scope: string;
};

const SERVICE_WORKER_TIMEOUT_MS = 10_000;

async function waitForServiceWorkerControl(page: Page): Promise<ServiceWorkerStatus> {
  return page.evaluate(async (timeoutMs) => {
    if (!("serviceWorker" in navigator)) {
      throw new Error("Service workers are not supported in this browser context");
    }

    const registration = await navigator.serviceWorker.ready;

    if (!navigator.serviceWorker.controller) {
      await new Promise<void>((resolve, reject) => {
        const timeoutId = window.setTimeout(() => {
          reject(new Error("Timed out waiting for the service worker to control the page"));
        }, timeoutMs);

        navigator.serviceWorker.addEventListener(
          "controllerchange",
          () => {
            window.clearTimeout(timeoutId);
            resolve();
          },
          {once: true},
        );
      });
    }

    const registrations = await navigator.serviceWorker.getRegistrations();

    return {
      controlled: Boolean(navigator.serviceWorker.controller),
      registrations: registrations.length,
      scope: registration.scope,
    };
  }, SERVICE_WORKER_TIMEOUT_MS);
}

async function getCachedPathnames(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const cacheNames = await caches.keys();
    const pathnames = await Promise.all(
      cacheNames.map(async (cacheName) => {
        const cache = await caches.open(cacheName);
        const requests = await cache.keys();
        return requests.map((request) => new URL(request.url).pathname);
      }),
    );

    return [...new Set(pathnames.flat())].sort();
  });
}

function expectCached(pathnames: string[], predicate: (pathname: string) => boolean, description: string) {
  expect(pathnames.some(predicate), `cached ${description}`).toBe(true);
}

test("keeps built-in game flows usable after a warmed-cache offline reload", async ({context, page}) => {
  const multiplayerRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).hostname === "multi.sudoku.slpixe.com") {
      multiplayerRequests.push(request.url());
    }
  });

  await page.goto("/#/select-game");
  await expect(page.getByRole("button", {name: "Solo / offline"})).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("select-game-card-1").click();
  await expect(page.getByTestId("current-game-label")).toHaveText("E-1");
  await expect(page.getByTestId("sudoku-board")).toBeVisible();

  const serviceWorker = await waitForServiceWorkerControl(page);
  expect(serviceWorker.controlled).toBe(true);
  expect(serviceWorker.registrations).toBeGreaterThan(0);
  expect(serviceWorker.scope).toMatch(/\/$/);

  const cachedPathnames = await getCachedPathnames(page);
  expectCached(cachedPathnames, (pathname) => pathname === "/index.html", "HTML app shell");
  expectCached(cachedPathnames, (pathname) => /^\/assets\/index-[\w-]+\.js$/.test(pathname), "main JS bundle");
  expectCached(cachedPathnames, (pathname) => /^\/assets\/Game-[\w-]+\.js$/.test(pathname), "Game route chunk");
  expectCached(
    cachedPathnames,
    (pathname) => /^\/assets\/SelectGame-[\w-]+\.js$/.test(pathname),
    "Select Game route chunk",
  );

  await context.setOffline(true);

  try {
    await page.reload({waitUntil: "networkidle"});
    await expect(page.getByTestId("current-game-label")).toHaveText("E-1");
    await expect(page.getByTestId("sudoku-board")).toBeVisible();

    await page.getByTestId("sudoku-action-new-game").click();
    await expect(page.getByRole("heading", {name: "Select Game"})).toBeVisible();
    await expect(page.getByTestId("select-game-grid")).toBeVisible();
    await expect(page.getByRole("button", {name: "Solo / offline"})).toBeEnabled();
    await expect(page.getByRole("button", {name: "Create online room"})).toBeDisabled();
    await expect(page.getByRole("button", {name: "Join existing room"})).toBeDisabled();
    await expect(page.getByText(/internet connection is required/i)).toBeVisible();

    await page.getByTestId("select-game-card-2").click();
    await expect(page.getByTestId("current-game-label")).toHaveText("E-2");
    await expect(page.getByTestId("sudoku-board")).toBeVisible();
    await page.getByTestId("sudoku-cell-0-0").click();
    await page.getByTestId("sudoku-number-1").click();
    await expect(page.getByTestId("sudoku-cell-value-0-0")).toHaveText("1");
    expect(multiplayerRequests).toEqual([]);
  } finally {
    await context.setOffline(false);
  }
});

test("shows the online-required state for a warmed-cache offline room deep link without opening a socket", async ({
  context,
  page,
}) => {
  const multiplayerRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).hostname === "multi.sudoku.slpixe.com") {
      multiplayerRequests.push(request.url());
    }
  });

  await page.goto("/#/select-game");
  await waitForServiceWorkerControl(page);
  const cachedPathnames = await getCachedPathnames(page);
  expectCached(
    cachedPathnames,
    (pathname) => /^\/assets\/MultiplayerGame-[\w-]+\.js$/.test(pathname),
    "Multiplayer room route chunk",
  );

  await context.setOffline(true);
  try {
    await page.goto("/#/room/ABC234", {waitUntil: "domcontentloaded"});
    await expect(page.getByText(/internet connection is required/i)).toBeVisible();
    await expect(page.getByTestId("multiplayer-room-code")).toHaveText("ABC234");
    expect(multiplayerRequests).toEqual([]);
  } finally {
    await context.setOffline(false);
  }
});

test("does not support a first-ever cold offline load before caches exist", async ({baseURL, browser}) => {
  if (!baseURL) {
    throw new Error("Playwright baseURL must be configured for PWA offline tests");
  }

  const coldContext = await browser.newContext({baseURL});
  await coldContext.setOffline(true);

  try {
    const coldPage = await coldContext.newPage();
    await expect(coldPage.goto("/", {waitUntil: "domcontentloaded", timeout: 5_000})).rejects.toThrow(
      /ERR_INTERNET_DISCONNECTED|NS_ERROR_OFFLINE|ERR_FAILED/,
    );
  } finally {
    await coldContext.close();
  }
});
