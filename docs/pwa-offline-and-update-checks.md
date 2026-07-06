# PWA Offline and Update Checks

## Offline Contract

The supported offline path is a warmed-cache path:

1. The user loads the production app online at least once.
2. The browser installs and activates the service worker.
3. The Workbox precache stores the app shell, main assets, and lazy route chunks.
4. The user can later reload the app, continue a built-in puzzle, open Select Game, and start another built-in puzzle while offline.

A first-ever cold offline load is unsupported. Without a previous online load, the browser has no service worker or cached app shell to serve.

Automated coverage lives in `e2e/pwa-offline.e2e.ts`.

## Repeatable Manual Update Check

Use this check when changing PWA registration, Workbox options, build output, or update UX.

1. Build and serve a production preview on an isolated port:

   ```bash
   pnpm run build
   pnpm exec vite preview --host 127.0.0.1 --port 4180
   ```

2. Open `http://127.0.0.1:4180/` in a browser and wait for service-worker control:

   ```js
   await navigator.serviceWorker.ready;
   Boolean(navigator.serviceWorker.controller);
   ```

   Expected: `true`.

3. Keep that tab open. In the source tree, make a temporary source change that changes a built asset hash. Do not commit the temporary edit unless it is part of the intended change.

4. Stop the preview server, rebuild, and serve the new build on the same port:

   ```bash
   pnpm run build
   pnpm exec vite preview --host 127.0.0.1 --port 4180
   ```

5. In the original tab, ask the registration to check for the new worker:

   ```js
   const registration = await navigator.serviceWorker.getRegistration();
   await registration?.update();
   ```

   Current expected behavior: the generated worker activates without a visible prompt because the app uses `registerType: "autoUpdate"`.

6. Reload the original tab.

   Expected: the app reloads, the current game is still available, and in-app navigation to Select Game works.

The no-reload stale-tab case is a known product decision point: if an old page stays open while a new deployment removes old lazy chunks from the server, an explicit update prompt may be better than silent activation. That prompt is intentionally outside the current offline coverage scope.
