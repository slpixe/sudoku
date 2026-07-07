# PWA Install Discovery Design

## Goal

Make the Sudoku PWA easier to discover and install while preserving the existing lightweight browser-native install flow.

## Scope

The app should continue to rely on browser installability rather than custom installation logic. Chromium browsers may show an address-bar install icon or menu item when the app meets install criteria. The app should add a small floating install affordance only when the browser exposes `beforeinstallprompt`.

iOS and Safari-specific instruction banners are out of scope for this change. They can add clutter and require browser-specific copy. Users on unsupported browsers should keep the current app experience without a disabled or misleading install control.

## Architecture

The existing production build already uses `vite-plugin-pwa`, Workbox, a manifest, and service-worker registration. This change keeps that foundation and makes three targeted improvements:

- use one generated manifest source from `vite-plugin-pwa`
- enrich the manifest with install-surface metadata, screenshots, categories, display fallbacks, and maskable icon purpose
- add a React install prompt controller and compact floating prompt that appears only after `beforeinstallprompt`

The install prompt state should stay local to the app shell. It should not affect game state, routing, persistence, or offline behavior.

## User Experience

When the browser determines that the app can be installed, a branded prompt appears with the app icon, a short explanation, a green `Install` action that matches the app controls, and a close control. On phones it attaches to the bottom edge like a lightweight bottom sheet. On larger viewports it floats above the input controls. Selecting `Install` calls the browser prompt from the captured `beforeinstallprompt` event. The prompt hides after 15 seconds, after the prompt is used, when closed, or after the app is installed.

Closing the toast stores a local dismissal flag so it does not keep reappearing. Invoking the browser install prompt also stores the dismissal flag so users are not repeatedly asked after dismissing the browser-native dialog.

Unsupported browsers never see the install prompt. Already-installed contexts should not show it.

## Testing

Add focused unit coverage for the install prompt hook/button behavior:

- no toast before `beforeinstallprompt`
- toast appears after `beforeinstallprompt`
- clicking `Install` calls `prompt()`
- closing the toast stores local dismissal and keeps it hidden
- `appinstalled` hides the toast

Run the normal checks after implementation: `pnpm run typecheck`, `pnpm run lint`, `pnpm test`, `pnpm run build`, and `pnpm run test:e2e` for the user-visible install/app-shell change.
