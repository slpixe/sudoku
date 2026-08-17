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

   Expected: the current page remains controlled by the old worker and an
   **Update available** prompt appears. The new worker must remain waiting; it
   must not silently activate or reload the page.

6. Before accepting the update, navigate to a lazy route that was not opened in
   the current page session, such as Select Game or a puzzle.

   Expected: the old route chunk is still served by the old worker's precache.
   The game remains usable and the generic application error screen does not
   appear.

7. Select **Update now**.

   Expected: the waiting worker activates, the page reloads once, the current
   game is still available, and subsequent lazy navigation uses the new build.

Automated two-build coverage lives in `e2e/pwa-update.e2e.ts`. Its isolated
fixture serves an old build, switches the same origin to a new build, and checks
the complete waiting-worker, old-lazy-chunk, prompted activation, and reload
sequence. Run it with `pnpm run test:e2e:pwa-update`; the full
`pnpm run test:e2e` command includes it after the ordinary application suite.
