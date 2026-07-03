# Accessibility And Touch Polish Design

## Scope

This work implements GitHub issue #9. It improves accessibility and touch behavior without changing the app's core visual direction.

In scope:

- Allow users to zoom the page by removing restrictive viewport settings.
- Replace `SudokuPreview`'s `div role="button"` pattern with a native button and normal tab order.
- Replace all native `confirm` and `alert` calls with app-controlled accessible dialogs.
- Add localized dialog, invalid URL, and preview-button labels used by the new accessible flows.
- Preserve and improve visible keyboard focus states for custom buttons touched by this work.
- Update e2e coverage for changed dialog and selection flows.

Out of scope:

- Redesigning the game layout.
- Adding a generalized modal stack or broader design system.
- Changing Sudoku rules, persistence, routing semantics, or puzzle data.

## Architecture

Add a small `AppDialogProvider` near the app root. It exposes a `useAppDialog()` hook with two async methods:

- `confirm(options): Promise<boolean>` for confirmation flows.
- `alert(options): Promise<void>` for informational error flows.

`Root` wraps the router in this provider so game screens and route-sync hooks can open dialogs without prop drilling. The provider renders one dialog at a time, which is enough for current flows and avoids unnecessary modal-stack complexity.

## UI Behavior

The dialog renders with `role="dialog"` and `aria-modal="true"`. It includes the message text and either confirm/cancel buttons or a single OK button. Escape cancels confirmation dialogs and closes alert dialogs. The dialog uses existing button styling and the current dark gray visual language.

`SudokuPreview` remains visually the same but becomes a native `<button type="button">`. It keeps the current test id, uses a localized accessible label, removes the positive `tabIndex`, and relies on browser keyboard activation for Enter and Space. Shared and custom buttons touched by this work get a visible `focus-visible` ring and touch manipulation hint.

## Data Flow

Current call sites keep their existing branching behavior:

- Clear game pauses, asks for confirmation, resumes on cancel, and clears on confirm.
- Finished puzzle selection asks before restarting that puzzle.
- Route-synced game changes ask before replacing active progress.
- Invalid route Sudoku values show an alert and restore the previous game route.

The async dialog helpers replace browser-blocking native dialogs, so route and game state updates happen after the user chooses an app-controlled dialog action.

## Testing

Update Playwright coverage to avoid browser `dialog` events. The clear-game test should assert that cancel keeps the entered number and confirm clears it. The selection-screen test should cover keyboard reachability of a Sudoku preview and selecting it through the native button. Add restart-dialog coverage for a solved puzzle if it can be done without making the suite brittle.

Run relevant checks after implementation: `pnpm run typecheck`, `pnpm run lint`, `pnpm test`, `pnpm build`, and `pnpm run test:e2e`.
