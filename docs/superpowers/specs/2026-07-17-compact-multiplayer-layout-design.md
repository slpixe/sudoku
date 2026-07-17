# Compact Multiplayer Layout Design

## Goal

Reduce the vertical space above the Sudoku board so the number and action controls are more likely to remain visible, especially in multiplayer games on shorter touch-device viewports.

## Design

The multiplayer status card will match the compact layout validated in the supplied edited HTML:

- remove its outer top margin;
- reduce its internal padding from `p-2` to `p-1`;
- reduce the Copy button's minimum height while retaining its existing label, focus treatment, and touch behavior;
- preserve the current wrapping, connection-state messaging, retry action, live-region announcements, colours, and maximum width.

The shared game grid will also match the validated markup by removing its outer top margin and reducing its grid gap from `gap-3` to `gap-1`. This spacing change will apply to both single-player and multiplayer because it improves vertical fit without changing component structure or behavior. No internal `GameHeader` sizing or controls will change.

## Scope

Changes are limited to styling classes in `MultiplayerStatus` and `GameView`, plus focused regression assertions. Multiplayer state, protocol behavior, puzzle layout calculations, and control behavior are unchanged.

## Responsive and Accessibility Behavior

The existing flex wrapping remains available when translated labels or status content need more width. The Copy button remains an ordinary touch-manipulation button with its accessible name, visible focus ring, and copy-result announcement. Error and reconnect rows retain their existing room and retry behavior.

## Verification

- Update focused component tests to assert the compact multiplayer card and shared game-grid classes.
- Run the affected unit tests.
- Run typecheck, lint, and the production build.
- Run single-player and multiplayer Playwright suites because the shared game-grid spacing is user-visible in both modes.

