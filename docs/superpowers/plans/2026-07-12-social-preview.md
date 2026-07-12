# Social Preview Image Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render, validate, commit, and install the approved 1280×640 GitHub social-preview image for `slpixe/sudoku`.

**Architecture:** Build the exact composition in an ignored temporary HTML file using the real desktop screenshot, then rasterize it with the project's installed Playwright Chromium. Commit only the final PNG, upload it through the user's signed-in Chrome GitHub session, and verify GitHub's Social preview setting displays it.

**Tech Stack:** HTML/CSS, `@playwright/test` 1.60.0, Chromium, macOS `sips`, Git, GitHub repository settings, Chrome extension control.

## Global Constraints

- Final file is `docs/social-preview.png`.
- Final dimensions are exactly 1280 × 640 pixels.
- Final format is PNG and file size is below 1,000,000 bytes.
- Use the real `public/screenshots/sudoku-desktop.png` without redrawing or distorting the interface.
- Keep the header, grid, number row, and bottom buttons visible.
- Preserve all approved copy verbatim.
- Do not change application code, `public/share.png`, PWA icons, or runtime dependencies.
- Upload only after local visual and technical validation succeeds.

---

### Task 1: Build and render the deterministic composition

**Files:**
- Create temporary: `.superpowers/social-preview-render/index.html`
- Create temporary: `.superpowers/social-preview-render/render.mjs`
- Create: `docs/social-preview.png`

**Interfaces:**
- Consumes: `public/screenshots/sudoku-desktop.png` and installed `@playwright/test` Chromium.
- Produces: Exact 1280×640 opaque PNG suitable for GitHub's Social preview upload.

- [ ] **Step 1: Confirm clean inputs and rendering tools**

Run:

```bash
git status --short --branch
file public/screenshots/sudoku-desktop.png
pnpm exec playwright --version
rg -n '^\.superpowers/' .gitignore
```

Expected: clean `master` ahead of `origin/master` only by the approved design/plan commits; screenshot is a PNG; Playwright is 1.60.0; `.superpowers/` is ignored.

- [ ] **Step 2: Create the temporary HTML composition**

Create `.superpowers/social-preview-render/index.html` with this complete content:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=1280, initial-scale=1">
    <style>
      * { box-sizing: border-box; }
      html, body { margin: 0; width: 1280px; height: 640px; overflow: hidden; }
      body {
        background: #0f1726;
        color: #ffffff;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .canvas {
        width: 1280px;
        height: 640px;
        display: grid;
        grid-template-columns: 43% 57%;
        background: #0f1726;
      }
      .copy {
        padding: 78px 30px 74px 72px;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: flex-start;
        position: relative;
        z-index: 2;
      }
      .eyebrow {
        color: #20d7a0;
        font-size: 22px;
        font-weight: 750;
        letter-spacing: 0.13em;
        text-transform: uppercase;
      }
      h1 {
        margin: 20px 0 0;
        color: #ffffff;
        font-size: 92px;
        line-height: 0.95;
        font-weight: 850;
        letter-spacing: -0.045em;
      }
      .keywords {
        margin-top: 28px;
        color: #45e6b0;
        font-size: 24px;
        line-height: 1.2;
        font-weight: 750;
        letter-spacing: 0.055em;
        text-transform: uppercase;
        white-space: nowrap;
      }
      .description {
        max-width: 420px;
        margin: 24px 0 0;
        color: #cbd5e1;
        font-size: 24px;
        line-height: 1.42;
        font-weight: 450;
      }
      .url {
        margin-top: 34px;
        padding: 15px 25px 16px;
        border-radius: 999px;
        background: #0f9f92;
        color: #ffffff;
        font-size: 22px;
        line-height: 1;
        font-weight: 800;
        box-shadow: 0 10px 28px rgba(15, 159, 146, 0.24);
      }
      .product {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: flex-end;
        padding: 26px 20px 26px 0;
        overflow: hidden;
      }
      .product img {
        display: block;
        width: 96%;
        height: 96%;
        object-fit: contain;
        object-position: right center;
      }
      .blend {
        position: absolute;
        inset: 0;
        background: linear-gradient(90deg, #0f1726 0%, rgba(15, 23, 38, 0.36) 9%, transparent 25%);
        pointer-events: none;
      }
    </style>
  </head>
  <body>
    <main class="canvas">
      <section class="copy">
        <div class="eyebrow">React · TypeScript · PWA</div>
        <h1>Sudoku</h1>
        <div class="keywords">Fast · Focused · Offline-ready</div>
        <p class="description">A polished puzzle experience built for keyboard, touch, and offline play.</p>
        <div class="url">sudoku.slpixe.com</div>
      </section>
      <section class="product">
        <img src="../../public/screenshots/sudoku-desktop.png" alt="Complete Sudoku game including bottom controls">
        <div class="blend"></div>
      </section>
    </main>
  </body>
</html>
```

- [ ] **Step 3: Create the temporary Playwright renderer**

Create `.superpowers/social-preview-render/render.mjs` with:

```javascript
import {chromium} from "@playwright/test";
import path from "node:path";
import {pathToFileURL} from "node:url";

const browser = await chromium.launch({headless: true});
const page = await browser.newPage({
  viewport: {width: 1280, height: 640},
  deviceScaleFactor: 1,
});

const source = path.resolve(".superpowers/social-preview-render/index.html");
await page.goto(pathToFileURL(source).href, {waitUntil: "networkidle"});
await page.screenshot({
  path: "docs/social-preview.png",
  type: "png",
  omitBackground: false,
});

await browser.close();
```

- [ ] **Step 4: Render the final PNG**

Run:

```bash
node .superpowers/social-preview-render/render.mjs
```

Expected: `docs/social-preview.png` is created with no browser or missing-asset errors.

### Task 2: Validate and commit the asset

**Files:**
- Validate: `docs/social-preview.png`
- Create temporary: `.superpowers/social-preview-render/social-preview-small.png`

**Interfaces:**
- Consumes: Rendered final PNG.
- Produces: Technically valid and visually approved committed asset.

- [ ] **Step 1: Verify format, dimensions, and size**

Run:

```bash
file docs/social-preview.png
sips -g pixelWidth -g pixelHeight -g format docs/social-preview.png
stat -f '%z' docs/social-preview.png
```

Expected: PNG; width `1280`; height `640`; file size below `1000000` bytes.

- [ ] **Step 2: Create a reduced-size legibility check**

Run:

```bash
sips -Z 640 docs/social-preview.png --out .superpowers/social-preview-render/social-preview-small.png
```

Expected: a 640×320 preview for evaluating typical social-card readability.

- [ ] **Step 3: Inspect both images visually**

Inspect `docs/social-preview.png` and `.superpowers/social-preview-render/social-preview-small.png`.

Confirm:

- exact approved text with no clipping;
- full screenshot header, grid, number row, and bottom controls;
- legible white text on the green URL pill;
- readable keywords at 640×320;
- no transparent edges, watermark, stale domain, invented UI, or distortion.

If a single layout issue appears, change only the corresponding CSS value in the temporary HTML, rerender, and repeat Tasks 2.1–2.3.

- [ ] **Step 4: Verify the repository diff**

Run:

```bash
git status --short --branch
git diff --check
```

Expected: the only uncommitted project file is `docs/social-preview.png`; temporary renderer files remain ignored.

- [ ] **Step 5: Commit the final asset**

```bash
git add docs/social-preview.png
git commit -m "docs: add repository social preview"
```

Expected: one asset commit following the design and implementation-plan commits.

### Task 3: Push, upload, and verify on GitHub

**Files:**
- External state: `slpixe/sudoku` repository Social preview setting.

**Interfaces:**
- Consumes: Validated `docs/social-preview.png` and signed-in GitHub Chrome session.
- Produces: Public repository link previews backed by the approved image.

- [ ] **Step 1: Push the committed design, plan, and asset**

Run:

```bash
git push origin master
```

Expected: fast-forward push and synchronized local/remote `master`.

- [ ] **Step 2: Open the GitHub repository settings in Chrome**

Navigate the signed-in Chrome session to:

```text
https://github.com/slpixe/sudoku/settings
```

Use the visible Social preview section and its `Edit` → `Upload an image…` control. Do not change any other repository setting.

- [ ] **Step 3: Upload the exact committed file**

Choose:

```text
/Users/slpixe/web/js/sudoku/docs/social-preview.png
```

Complete GitHub's image crop/save flow without changing the 2:1 crop.

Expected: GitHub accepts the file and displays the approved thumbnail in the Social preview section.

- [ ] **Step 4: Verify final state**

Confirm in Chrome that the Social preview section shows the uploaded image, then run:

```bash
git status --short --branch
```

Expected: clean `master` synchronized with `origin/master`. Report the final asset path and GitHub repository URL.
