# PWA Offline Coverage Design

## Goal

Users who load the production app online once should be able to reload the app, continue the current game, open Select Game, and start another built-in puzzle while offline.

## Scope

This change does not try to support a first-ever cold offline load. A browser must first download the app shell and install the service worker while online. That cold offline case should be asserted as unsupported so future work does not accidentally imply otherwise.

The existing `autoUpdate` service-worker registration remains in place. Update-prompt UX and deployment-era lazy chunk handling are separate product decisions and should not block the basic warmed-cache offline contract.

## Architecture

The current production build already uses `vite-plugin-pwa` and Workbox precaching. Built-in puzzle collections are bundled through raw imports, and game progress/preferences are stored locally. The implementation should therefore focus on automated production-build coverage rather than new runtime state.

The Playwright PWA coverage should:

- load the app online and wait for service-worker readiness/control
- inspect the cache for the HTML shell, main assets, Game chunk, and Select Game chunk
- switch the context offline
- reload the current game
- navigate to Select Game in-app
- start another built-in puzzle while still offline
- verify that a brand-new offline context cannot load the app before the first online visit

## Testing

Run the new PWA test against the production preview server through Playwright. Then run the normal project checks: `pnpm run typecheck`, `pnpm run lint`, `pnpm test`, `pnpm build`, and `pnpm run test:e2e`.
