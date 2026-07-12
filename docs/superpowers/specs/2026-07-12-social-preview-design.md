# Social Preview Image Design

## Objective

Create and install a polished GitHub social-preview image for `slpixe/sudoku` that reads clearly when the repository is shared on LinkedIn, Slack, Messages, and similar platforms. The image should lead with the product while signalling the modern engineering work behind it.

## Output contract

- File: `docs/social-preview.png`
- Canvas: exactly 1280 × 640 pixels
- Format: PNG
- Size: below GitHub's 1 MB upload limit
- Background: solid, opaque color for predictable rendering across light and dark sharing surfaces
- Source UI: the real `public/screenshots/sudoku-desktop.png`, not a generated or reconstructed Sudoku interface

## Approved composition

Use a 43/57 split layout on a deep navy `#0f1726` background.

### Left panel

Arrange the following exact text vertically with generous spacing and strong thumbnail readability:

1. Small teal eyebrow: `React · TypeScript · PWA`
2. Large white title: `Sudoku`
3. Teal uppercase keywords: `Fast · Focused · Offline-ready`
4. Supporting line: `A polished puzzle experience built for keyboard, touch, and offline play.`
5. Rounded teal URL pill with white text: `sudoku.slpixe.com`

Use a clean system sans-serif stack, bold weights for the title, keywords, and URL, and high contrast throughout. The URL pill uses approximately `#0f9f92`; accent text uses approximately `#20d7a0` or `#45e6b0`; supporting copy uses `#cbd5e1`.

### Right panel

Show the complete desktop game screenshot scaled proportionally with `contain` behavior. Keep the header, Sudoku grid, number row, and bottom control buttons visible. Do not crop away the bottom buttons. Add a subtle left-edge navy gradient only to blend the screenshot into the text panel; do not recolor, redraw, blur, or distort the actual interface.

## Rendering approach

Compose the asset deterministically with HTML/CSS using the existing screenshot, then rasterize the exact 1280 × 640 viewport. AI image generation is intentionally not used for the final render because exact product UI, exact copy, and pixel dimensions matter more than generative styling. Temporary composition files may remain under ignored `.superpowers/` workspace state; only the final PNG belongs in the committed project.

## Validation

- Confirm dimensions are exactly 1280 × 640.
- Confirm the PNG is below 1 MB.
- Inspect the image at full size and at a reduced card size.
- Confirm all text is verbatim, legible, and safely inset from the edges.
- Confirm the entire control row is visible in the screenshot.
- Confirm there is no transparency, watermark, invented UI, or stale domain.
- Upload through the signed-in GitHub repository Settings → Social preview interface.
- Verify GitHub displays the uploaded thumbnail for `slpixe/sudoku`.

## Out of scope

- Changing the application's interface or screenshots.
- Replacing the app's PWA icons or `public/share.png`.
- Adding new fonts or runtime dependencies.
- Creating alternate social cards for the deployed website.
