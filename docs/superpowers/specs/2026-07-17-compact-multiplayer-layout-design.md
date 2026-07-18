# Compact Multiplayer Layout Design

## Goal

Reduce the vertical space above the Sudoku board so the number and action controls are more likely to remain visible, especially in multiplayer games on shorter touch-device viewports.

## Design

The multiplayer status card will match the compact layout validated in the supplied edited HTML:

- remove its outer top margin;
- reduce its internal padding from `p-2` to `p-1`;
- reduce the Copy button's minimum height while retaining its existing label, focus treatment, and touch behavior;
- preserve the current wrapping, connection-state messaging, retry action, live-region announcements, colours, and maximum width.

The shared game grid will also match the validated markup by removing its outer top margin and reducing its grid gap from `gap-3` to `gap-1`. This spacing change will apply to both single-player and multiplayer because it improves vertical fit without changing component structure or behavior.

The shared `GameHeader` top padding will reduce from `pt-4` to `pt-2`, saving a further 0.5rem above the header in both single-player and multiplayer. The existing short-landscape CSS override will continue to set header top padding to zero, and no header controls or other dimensions will change.

`GameView` will render optional multiplayer status content as the first child of the shared `<main>` grid instead of above it. In the normal stacked layout, the existing `gap-1` then provides one consistent vertical rhythm between status, header, board, number pad, and control pad. The status card will stretch to the main grid width while retaining its existing maximum width.

## Scope

Changes are limited to styling and layout structure in `MultiplayerStatus`, `GameView`, `GameHeader`, and `main.css`, plus focused regression assertions. Multiplayer state, protocol behavior, puzzle layout calculations, and control behavior are unchanged.

## Responsive and Accessibility Behavior

The existing flex wrapping remains available when translated labels or status content need more width. The Copy button remains an ordinary touch-manipulation button with its accessible name, visible focus ring, and copy-result announcement. Error and reconnect rows retain their existing room and retry behavior.

Short-landscape mode will continue to require landscape orientation and a viewport height of 520px or less, but it will no longer stop at 900px wide. This removes the abrupt switch from a fitting two-column layout at 900×500 to an overflowing stacked layout at 901×500 while leaving taller 1024×600 and normal desktop viewports stacked.

Within short-landscape mode:

- At widths of 700px and above, the board occupies the left column across all rows. The right column contains status, header, numbers, and controls in that order.
- Below 700px wide, the status spans both columns above the existing board-and-controls layout so the narrower right column retains enough height for the number pad.
- Vertical gaps use 0.25rem, matching `gap-1`; the existing 0.75rem horizontal separation between the board and controls remains.
- Completed-game layouts use the same status placement, substituting the completion panel for the number and control rows.

If connection recovery content makes the status card taller, the flexible right-column content may yield height at 700px and above. Below 700px the spanning status prevents that recovery content from compressing the controls column.

## Verification

- Update focused component tests to assert the compact multiplayer card, its placement inside the main grid, the shared game-grid classes, and reduced header top padding.
- Add responsive Playwright assertions around 699/700px and 900/901px, plus a wide-short viewport, verifying grid placement and control visibility.
- Run the affected unit tests.
- Run typecheck, lint, and the production build.
- Run single-player and multiplayer Playwright suites because the shared game-grid spacing is user-visible in both modes.
