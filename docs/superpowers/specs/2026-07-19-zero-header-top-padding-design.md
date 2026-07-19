# Zero Header Top Padding Design

## Goal

Remove the remaining shared top padding from the Sudoku game header so the header sits directly below the preceding multiplayer status row, or at the top of the shared game grid in solo play.

## Design

Remove the `pt-2` Tailwind utility from `GameHeader`. Do not replace it with `pt-0`; zero is the header's natural top padding when no padding utility applies. This affects solo and multiplayer games in portrait and landscape layouts.

Keep the existing short-landscape `.sudoku-game-header { padding-top: 0; }` rule. It becomes redundant for top padding but remains part of the broader short-landscape header override and does not conflict with the shared default.

No multiplayer state, component structure, controls, grid placement, or other spacing changes are in scope.

## Verification

- Update the focused `GameHeader` test to require the absence of both `pt-2` and the retired `pt-4` class.
- Run the focused `GameHeader` unit test.
- Run typecheck and lint.
- Run the single-player and multiplayer Playwright suites because the shared header spacing is user-visible in both modes.
