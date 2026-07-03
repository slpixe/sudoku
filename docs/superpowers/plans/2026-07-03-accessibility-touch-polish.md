# Accessibility Touch Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve zoom, keyboard, screen-reader, and touch behavior for issue #9.

**Architecture:** Add one app-level dialog provider/hook and replace native blocking dialogs with async app dialogs. Keep preview-card and viewport changes local and preserve the current visual language.

**Tech Stack:** React 18, TypeScript, Vite, Tailwind, TanStack Router, i18next, Playwright.

## Global Constraints

- Preserve current Sudoku behavior, persistence, and route semantics.
- Keep changes small and scoped to issue #9.
- Use pnpm for all verification commands.
- Do not commit unless the user explicitly requests it.

---

## Files

- Create: `src/components/AppDialog.tsx` for `AppDialogProvider` and `useAppDialog()`.
- Modify: `src/Root.tsx` to wrap the app in `AppDialogProvider`.
- Modify: `index.html` to allow user zoom.
- Modify: `src/components/Button.tsx` to add visible focus and touch affordance styling.
- Modify: `src/components/DarkModeButton.tsx` to add visible focus and touch affordance styling.
- Modify: `src/components/sudoku/SudokuPreview.tsx` to use a native button.
- Modify: `src/pages/Game/GameHeader.tsx` to use app confirmation for clear.
- Modify: `src/pages/Game/GameSelect.tsx` to use app confirmation for finished puzzle restart.
- Modify: `src/pages/Game/useGameRouteSync.ts` to use app confirm/alert for URL flows.
- Modify: `src/locales/*.json` to add dialog, invalid URL, restart, and preview labels.
- Modify: `e2e/sudoku.e2e.ts` to cover app dialogs and keyboard preview selection.

---

### Task 1: App Dialog Provider

**Files:**
- Create: `src/components/AppDialog.tsx`
- Modify: `src/Root.tsx`

**Interfaces:**
- Produces: `AppDialogProvider({children}: {children: React.ReactNode})`
- Produces: `useAppDialog(): {confirm(options: ConfirmDialogOptions): Promise<boolean>; alert(options: AlertDialogOptions): Promise<void>}`
- Produces: `ConfirmDialogOptions = {message: string; confirmLabel?: string; cancelLabel?: string}`
- Produces: `AlertDialogOptions = {message: string; confirmLabel?: string}`

- [ ] Add `src/components/AppDialog.tsx` with a context provider, queued current dialog state, Escape handling, and resolver cleanup.

```tsx
import * as React from "react";

import Button from "./Button";

export type ConfirmDialogOptions = {message: string; confirmLabel?: string; cancelLabel?: string};
export type AlertDialogOptions = {message: string; confirmLabel?: string};

type DialogState =
  | {type: "confirm"; options: ConfirmDialogOptions; resolve: (value: boolean) => void}
  | {type: "alert"; options: AlertDialogOptions; resolve: () => void};

type AppDialogApi = {
  confirm: (options: ConfirmDialogOptions) => Promise<boolean>;
  alert: (options: AlertDialogOptions) => Promise<void>;
};
```

- [ ] Wrap the router in `Root.tsx`.

```tsx
import {AppDialogProvider} from "./components/AppDialog";

const App = () => {
  return (
    <ErrorBoundary>
      <AppDialogProvider>
        <OfflineIndicator />
        <React.Suspense fallback={routeFallback}>
          <RouterProvider router={router} />
        </React.Suspense>
      </AppDialogProvider>
    </ErrorBoundary>
  );
};
```

- [ ] Run `pnpm run typecheck` and expect it to pass after consumers are added in later tasks.

### Task 2: Viewport And Preview Button

**Files:**
- Modify: `index.html`
- Modify: `src/components/Button.tsx`
- Modify: `src/components/DarkModeButton.tsx`
- Modify: `src/components/sudoku/SudokuPreview.tsx`
- Modify: `src/pages/Game/GameSelect.tsx`
- Modify: `src/locales/*.json`

**Interfaces:**
- Consumes: existing `SudokuPreview` props.
- Produces: a native button with unchanged `data-testid` and localized accessible name `Select sudoku ${id}` in English.

- [ ] Change the viewport content to `width=device-width, initial-scale=1`.

```html
<meta name="viewport" content="width=device-width, initial-scale=1" />
```

- [ ] Replace the preview wrapper `div role="button"` with `<button type="button">`, remove positive `tabIndex`, remove custom Enter-only handler, and keep the visual reset classes.

```tsx
<button
  type="button"
  aria-label={`Select sudoku ${id}`}
  className="user-select-none group block border-0 bg-transparent p-0 text-left hover:cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-300 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-800"
  data-testid={`sudoku-preview-${id}`}
  onClick={onClick}
>
```

- [ ] Add focus-visible ring and `touch-manipulation` to shared/custom buttons touched by this issue.

```tsx
"focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-300 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-800 touch-manipulation"
```

- [ ] Add locale keys `dialog_confirmation`, `dialog_message`, `dialog_ok`, `dialog_cancel`, `invalid_sudoku_url`, `confirm_restart_finished`, and `select_sudoku` in every existing locale file.

- [ ] Run `pnpm run typecheck` and expect no JSX/type errors.

### Task 3: Replace Native Dialog Call Sites

**Files:**
- Modify: `src/pages/Game/GameHeader.tsx`
- Modify: `src/pages/Game/GameSelect.tsx`
- Modify: `src/pages/Game/useGameRouteSync.ts`

**Interfaces:**
- Consumes: `const dialog = useAppDialog()`.
- Produces: no remaining `confirm(` or `alert(` calls in `src/pages/Game`.

- [ ] In `GameHeader.tsx`, remove the effect-driven browser confirm and make the clear handler async.

```tsx
const clearGameLocal = async () => {
  pauseGame();
  const areYouSure = await dialog.confirm({message: t("confirm_clear")});
  if (!areYouSure) {
    continueGame();
    return;
  }
  clearGame();
};
```

- [ ] In `GameSelect.tsx`, make `choose` async and confirm before restarting a finished puzzle.

```tsx
const choose = async () => {
  if (finished) {
    const areYouSure = await dialog.confirm({
      message: "Are you sure? This will restart the sudoku and reset the timer. It will continue to say that you solved it.",
    });
    if (!areYouSure) {
      return;
    }
  }
  navigate({to: "/", search: {sudokuIndex: index + 1, sudoku: stringifySudoku(sudoku.sudoku), sudokuCollectionName}});
};
```

- [ ] In `useGameRouteSync.ts`, call `dialog.confirm()` for active-game URL changes and `dialog.alert()` for invalid Sudoku URLs.

```tsx
const dialog = useAppDialog();
const areYouSure = await dialog.confirm({message: translate("confirm_new_game", values)});
await dialog.alert({message: translate("invalid_sudoku_url")});
```

- [ ] Run a content search for `confirm\(|alert\(` and expect only provider API declarations/calls, not native global calls.

### Task 4: E2E Coverage

**Files:**
- Modify: `e2e/sudoku.e2e.ts`

**Interfaces:**
- Consumes: app dialog role/name and existing helper functions.
- Produces: tests for clear cancel/confirm and keyboard preview selection.

- [ ] Replace Playwright browser dialog handlers in `clears the current game only after confirmation` with app-dialog assertions.

```ts
await page.getByRole("button", {name: "Clear"}).click();
await expect(page.getByRole("dialog")).toContainText("Are you sure you want to restart this game? Your progress will be lost.");
await page.getByRole("button", {name: "Cancel"}).click();
```

- [ ] Update selection flow to focus a preview by role and press Enter.

```ts
const mediumPreview = page.getByRole("button", {name: "Select sudoku 1"});
await mediumPreview.focus();
await page.keyboard.press("Enter");
```

- [ ] Add solved-puzzle restart dialog coverage by seeding a finished puzzle in localStorage or by using existing solved-game flow if stable.

- [ ] Run `pnpm run test:e2e` and expect all Playwright tests to pass.

### Task 5: Verification

**Files:**
- Verify all modified files.

- [ ] Run `pnpm run typecheck` and expect pass.
- [ ] Run `pnpm run lint` and expect pass.
- [ ] Run `pnpm test` and expect pass.
- [ ] Run `pnpm build` and expect pass.
- [ ] Run `pnpm run test:e2e` and expect pass.
- [ ] Inspect `git diff` and confirm only issue #9 files changed.
