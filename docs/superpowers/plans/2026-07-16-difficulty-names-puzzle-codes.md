# Difficulty Names and Puzzle Codes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Expert/Evil with the canonical Fiendish/Diabolical difficulties and give every built-in puzzle a stable, language-independent `E/M/H/F/D-N` display code.

**Architecture:** Perform the ID change across the shared core, frontend, multiplayer protocol, server, database, runtime catalogs, and generator as one coordinated domain migration. Keep presentation concerns behind a small base-collection metadata module: localized names come from translation keys, while puzzle codes come from canonical fixed prefixes and never from translated text. Isolate the two legacy IDs at browser and database read boundaries during the rollout window.

**Tech Stack:** React 18, TypeScript 5.8, Vite 7, Tailwind CSS 3, i18next, Vitest, Playwright, Socket.IO, Zod, Postgres/PGlite, pnpm 11.9.0.

## Global Constraints

- Canonical IDs must be exactly `easy`, `medium`, `hard`, `fiendish`, and `diabolical` in that order.
- English display names must be exactly Easy, Medium, Hard, Fiendish, and Diabolical.
- Built-in puzzle codes must be exactly `E/M/H/F/D-N` and remain unchanged in every locale.
- Custom collections keep numeric card labels and `Collection #N` game/completion labels.
- Rename `sudokus/expert.txt` and `sudokus/evil.txt` without changing a byte, line, or line position.
- Do not edit applied migrations `001_multiplayer_rooms.sql` or `002_timer_started.sql`; add an expand-only numbered migration.
- Keep legacy database values accepted during the release/rollback window and defer their removal to a linked contract issue.
- Old Expert/Evil URLs and cached clients need not remain compatible; stale persisted browser state must normalize safely.
- Retain old terms only for external-provider vocabulary, historical research, immutable migrations, or isolated compatibility code.
- Do not rewrite historical specs or plans.
- Use pnpm for every install, build, test, and script command.

---

### Task 1: Migrate canonical IDs, catalogs, protocol, and database

**Files:**
- Rename: `sudokus/expert.txt` to `sudokus/fiendish.txt`
- Rename: `sudokus/evil.txt` to `sudokus/diabolical.txt`
- Modify: `packages/sudoku-core/src/grid.ts`
- Modify: `packages/sudoku-core/src/grid.test.ts`
- Modify: `packages/multiplayer-protocol/src/schemas.test.ts`
- Modify: `src/lib/database/collections.ts`
- Modify: `src/lib/engine/types.ts`
- Modify: `src/lib/engine/generate.ts`
- Modify: `src/lib/engine/generate.test.ts`
- Modify: `src/lib/game/sudokus.ts`
- Modify: `src/pages/SelectGame.test.tsx`
- Modify: `scripts/generate_sudokus.ts`
- Modify: `package.json`
- Modify: `server/Dockerfile`
- Create: `server/migrations/003_difficulty_ids.sql`
- Modify: `server/src/db/migrate.test.ts`
- Modify: `server/src/db/roomRows.ts`
- Create: `server/src/db/roomRows.test.ts`

**Interfaces:**
- Produces: `BaseCollectionId = "easy" | "medium" | "hard" | "fiendish" | "diabolical"`.
- Produces: frontend `BaseCollection.Fiendish` and `BaseCollection.Diabolical` enum members with the new serialized values.
- Produces: engine `DIFFICULTY.FIENDISH` and `DIFFICULTY.DIABOLICAL` enum members.
- Produces: runtime files `sudokus/fiendish.txt` and `sudokus/diabolical.txt` with unchanged contents.
- Produces: migration `003_difficulty_ids.sql`, which accepts all seven rollout values and rewrites existing legacy rows.
- Produces: `mapRoomRow()` canonicalization of legacy database values to new snapshot values.

- [ ] **Step 1: Add failing shared-ID and protocol tests**

Update `packages/sudoku-core/src/grid.test.ts` to import `BASE_COLLECTION_IDS` and add:

```ts
it("defines the canonical built-in difficulty IDs in display order", () => {
  expect(BASE_COLLECTION_IDS).toEqual(["easy", "medium", "hard", "fiendish", "diabolical"]);
});
```

Add these cases to the `socket request schemas` block in `packages/multiplayer-protocol/src/schemas.test.ts`:

```ts
it.each(["fiendish", "diabolical"])("accepts the canonical %s collection ID", (collectionId) => {
  expect(
    createRoomRequestSchema.parse({
      guestId,
      connectionId,
      collectionId,
      puzzleNumber: 1,
      puzzleFingerprint: "0".repeat(81),
    }).collectionId,
  ).toBe(collectionId);
});

it.each(["expert", "evil"])("rejects the retired %s client collection ID", (collectionId) => {
  expect(() =>
    createRoomRequestSchema.parse({
      guestId,
      connectionId,
      collectionId,
      puzzleNumber: 1,
      puzzleFingerprint: "0".repeat(81),
    }),
  ).toThrow();
});
```

- [ ] **Step 2: Run the shared tests and verify the new cases fail**

Run:

```bash
pnpm --filter @sudoku/core test
pnpm --filter @sudoku/multiplayer-protocol test
```

Expected: the core order assertion fails because the last IDs are still `expert` and `evil`; the protocol rejects `fiendish` and `diabolical`.

- [ ] **Step 3: Add failing database migration and legacy-row tests**

Create `server/src/db/roomRows.test.ts` with a complete valid row fixture:

```ts
import {afterEach, describe, expect, it, vi} from "vitest";

import {mapRoomRow, type RoomRow} from "./roomRows.js";

const now = new Date("2026-07-16T12:00:00.000Z");

function roomRow(collectionId: string): RoomRow {
  return {
    id: "123e4567-e89b-42d3-a456-426614174000",
    code: "ABC234",
    collection_id: collectionId,
    puzzle_number: 1,
    givens: Array<number>(81).fill(0),
    solution: Array<number>(81).fill(1),
    values: Array<number>(81).fill(0),
    notes: Array<number>(81).fill(0),
    revision: 0,
    status: "running",
    timer_started: false,
    elapsed_ms: 0,
    running_since: null,
    created_at: now,
    last_activity_at: now,
    expires_at: new Date(now.getTime() + 86_400_000),
    can_undo: false,
  };
}

describe("mapRoomRow collection IDs", () => {
  it.each([
    ["expert", "fiendish"],
    ["evil", "diabolical"],
  ])("normalizes legacy %s rows to %s", (storedId, expectedId) => {
    expect(mapRoomRow(roomRow(storedId), now).snapshot.collectionId).toBe(expectedId);
  });

  it.each(["fiendish", "diabolical"])("accepts canonical %s rows", (collectionId) => {
    expect(mapRoomRow(roomRow(collectionId), now).snapshot.collectionId).toBe(collectionId);
  });
});
```

In `server/src/db/migrate.test.ts`, allow `insertLegacyRoom()` to take `collectionId?: string`, use `input.collectionId ?? "easy"` in its insert parameters, and add:

```ts
it("expands and canonicalizes the top difficulty IDs", async () => {
  const database = new PgliteDatabase();
  databases.push(database);
  const migration001Directory = await mkdtemp(path.join(tmpdir(), "sudoku-migration-difficulty-"));
  temporaryDirectories.push(migration001Directory);
  await copyFile(
    path.join(migrationsDirectory, "001_multiplayer_rooms.sql"),
    path.join(migration001Directory, "001_multiplayer_rooms.sql"),
  );
  await runMigrations(database, migration001Directory);

  await insertLegacyRoom(database, {
    id: roomId,
    code: "ABC234",
    collectionId: "expert",
    revision: 0,
    status: "running",
    runningSince: null,
  });
  await insertLegacyRoom(database, {
    id: resumedRoomId,
    code: "DEF567",
    collectionId: "evil",
    revision: 0,
    status: "running",
    runningSince: null,
  });

  await runMigrations(database, migrationsDirectory);

  const migrated = await database.query<{collection_id: string}>(
    "SELECT collection_id FROM rooms ORDER BY code",
  );
  expect(migrated.rows).toEqual([{collection_id: "fiendish"}, {collection_id: "diabolical"}]);

  await expect(
    insertLegacyRoom(database, {
      id: postMigrationRoomId,
      code: "GHJ678",
      collectionId: "expert",
      revision: 0,
      status: "running",
      runningSince: null,
    }),
  ).resolves.toBeUndefined();
});
```

- [ ] **Step 4: Run the server tests and verify they fail**

Run:

```bash
pnpm --filter @sudoku/multiplayer-server test -- src/db/roomRows.test.ts src/db/migrate.test.ts
```

Expected: legacy row normalization fails, canonical rows are rejected, and no migration rewrites the old database values.

- [ ] **Step 5: Change the canonical shared, frontend, and engine IDs**

Set the shared definitions in `packages/sudoku-core/src/grid.ts` to:

```ts
export type BaseCollectionId = "easy" | "medium" | "hard" | "fiendish" | "diabolical";

export const BASE_COLLECTION_IDS: readonly BaseCollectionId[] = [
  "easy",
  "medium",
  "hard",
  "fiendish",
  "diabolical",
];
```

Set the frontend enum in `src/lib/database/collections.ts` to:

```ts
export enum BaseCollection {
  Easy = "easy",
  Medium = "medium",
  Hard = "hard",
  Fiendish = "fiendish",
  Diabolical = "diabolical",
}
```

For this task, point `BaseCollection.Fiendish` and `BaseCollection.Diabolical` at the existing `difficulty_expert` and `difficulty_evil` keys; Task 2 replaces those presentation keys.

Set the engine enum in `src/lib/engine/types.ts` to:

```ts
export enum DIFFICULTY {
  EASY = "easy",
  MEDIUM = "medium",
  HARD = "hard",
  FIENDISH = "fiendish",
  DIABOLICAL = "diabolical",
}
```

Replace the two computed keys in `src/lib/engine/generate.ts` and the ordered array/call in `src/lib/engine/generate.test.ts` with `DIFFICULTY.FIENDISH` and `DIFFICULTY.DIABOLICAL`. Preserve comments that explicitly describe the terminology used by the cited external puzzle sources.

- [ ] **Step 6: Rename the catalog files and connect every runtime consumer**

Rename the files without editing them:

```bash
git mv sudokus/expert.txt sudokus/fiendish.txt
git mv sudokus/evil.txt sudokus/diabolical.txt
```

In `src/lib/game/sudokus.ts`, import the renamed files and map them using the new enum members:

```ts
import fiendishSudokus from "../../../sudokus/fiendish.txt?raw";
import diabolicalSudokus from "../../../sudokus/diabolical.txt?raw";

const BASE_SUDOKU_COLLECTIONS: Record<BaseCollection, string> = {
  [BaseCollection.Easy]: easySudokus,
  [BaseCollection.Medium]: mediumSudokus,
  [BaseCollection.Hard]: hardSudokus,
  [BaseCollection.Fiendish]: fiendishSudokus,
  [BaseCollection.Diabolical]: diabolicalSudokus,
};
```

Update `server/Dockerfile` to copy `fiendish.txt` and `diabolical.txt`. Update `scripts/generate_sudokus.ts` so its help, regex, mapping, and filename use only the five canonical terms:

```ts
"Difficulty [easy], [medium], [hard], [fiendish], [diabolical]",
/^(easy|medium|hard|fiendish|diabolical)$/i,

const mapping: Record<string, DIFFICULTY> = {
  easy: DIFFICULTY.EASY,
  medium: DIFFICULTY.MEDIUM,
  hard: DIFFICULTY.HARD,
  fiendish: DIFFICULTY.FIENDISH,
  diabolical: DIFFICULTY.DIABOLICAL,
};
```

Rename the two package scripts to `generate-fiendish-sudokus` and `generate-diabolical-sudokus`, passing `-d fiendish` and `-d diabolical`. Do not retain application-owned aliases under the retired names.

- [ ] **Step 7: Add the forward-only database expansion and row canonicalizer**

Create `server/migrations/003_difficulty_ids.sql`:

```sql
ALTER TABLE rooms DROP CONSTRAINT rooms_collection_id_check;

ALTER TABLE rooms
  ADD CONSTRAINT rooms_collection_id_check
  CHECK (collection_id IN ('easy', 'medium', 'hard', 'expert', 'evil', 'fiendish', 'diabolical'));

UPDATE rooms
SET collection_id = CASE collection_id
  WHEN 'expert' THEN 'fiendish'
  WHEN 'evil' THEN 'diabolical'
  ELSE collection_id
END
WHERE collection_id IN ('expert', 'evil');
```

In `server/src/db/roomRows.ts`, import `BASE_COLLECTION_IDS` as a value and isolate the legacy mapping:

```ts
import {BASE_COLLECTION_IDS, type BaseCollectionId} from "@sudoku/core";

const collectionIds = new Set<string>(BASE_COLLECTION_IDS);
const legacyCollectionIds: Readonly<Record<string, BaseCollectionId>> = {
  expert: "fiendish",
  evil: "diabolical",
};

function collectionIdField(value: unknown): BaseCollectionId {
  const stored = stringField(value, "collection_id");
  const canonical = legacyCollectionIds[stored] ?? stored;
  return collectionIds.has(canonical) ? (canonical as BaseCollectionId) : fail("collection_id");
}
```

Use `collectionIdField(row.collection_id)` in `mapRoomRow()`.

- [ ] **Step 8: Update direct ID expectations and run focused checks**

Update the base collection loop in `src/pages/SelectGame.test.tsx` to:

```ts
for (const id of ["easy", "medium", "hard", "fiendish", "diabolical"]) {
  expect(screen.getByTestId(`select-game-collection-${id}`)).toBeTruthy();
}
```

Update any other application-owned type/test references found by:

```bash
rg -n "BaseCollection\.Expert|BaseCollection\.Evil|DIFFICULTY\.EXPERT|DIFFICULTY\.EVIL" src packages server scripts
```

Run:

```bash
pnpm --filter @sudoku/core test
pnpm --filter @sudoku/multiplayer-protocol test
pnpm --filter @sudoku/multiplayer-server test -- src/db/roomRows.test.ts src/db/migrate.test.ts src/catalog/FilePuzzleCatalog.test.ts
pnpm exec vitest run src/lib/engine/generate.test.ts src/pages/SelectGame.test.tsx
pnpm run typecheck
```

Expected: all commands pass. The final `rg` output contains no application-owned enum references to the retired members.

- [ ] **Step 9: Prove the catalog move preserved every byte**

Run:

```bash
git diff --no-ext-diff --find-renames=100% --summary HEAD -- sudokus
git diff --no-ext-diff --find-renames=100% --numstat HEAD -- sudokus
```

Expected: two 100% renames and numstat entries of `0  0`; there are no content additions or deletions.

- [ ] **Step 10: Commit the canonical migration**

```bash
git add package.json packages/sudoku-core packages/multiplayer-protocol scripts/generate_sudokus.ts server/Dockerfile server/migrations/003_difficulty_ids.sql server/src/db src/lib/database/collections.ts src/lib/engine src/lib/game/sudokus.ts src/pages/SelectGame.test.tsx sudokus
git commit -m "feat: migrate top difficulty IDs"
```

---

### Task 2: Centralize puzzle-code metadata and localized difficulty names

**Files:**
- Create: `src/lib/game/baseCollectionMetadata.ts`
- Create: `src/lib/game/baseCollectionMetadata.test.ts`
- Modify: `src/lib/database/collections.ts`
- Modify: `src/lib/game/collectionNames.ts`
- Modify: `src/locales/en.json`
- Modify: `src/locales/fr.json`
- Modify: `src/locales/es.json`
- Modify: `src/locales/de.json`
- Modify: `src/locales/it.json`
- Modify: `src/locales/pt.json`
- Modify: `src/locales/zh.json`

**Interfaces:**
- Produces: `getBaseCollectionMetadata(collectionId: string): BaseCollectionMetadata | undefined`.
- Produces: `getBaseCollectionPuzzleCode(collectionId: string, puzzleNumber: number): string | undefined`.
- Produces: `getSudokuPuzzleDisplayLabel(collectionId: string, puzzleNumber: number): string`.
- Produces: translation keys `difficulty_fiendish` and `difficulty_diabolical` in all seven locales.

- [ ] **Step 1: Write failing metadata and localization tests**

Create `src/lib/game/baseCollectionMetadata.test.ts`:

```ts
import {describe, expect, it} from "vitest";

import de from "src/locales/de.json";
import en from "src/locales/en.json";
import es from "src/locales/es.json";
import fr from "src/locales/fr.json";
import itLocale from "src/locales/it.json";
import pt from "src/locales/pt.json";
import zh from "src/locales/zh.json";
import {appPersistence} from "src/lib/persistence/appPersistence";
import {
  BASE_COLLECTION_METADATA,
  getBaseCollectionPuzzleCode,
} from "./baseCollectionMetadata";
import {getSudokuPuzzleDisplayLabel} from "./collectionNames";

describe("base collection metadata", () => {
  afterEach(() => vi.restoreAllMocks());

  it("defines unique invariant codes in difficulty order", () => {
    expect(Object.values(BASE_COLLECTION_METADATA).map(({code}) => code)).toEqual(["E", "M", "H", "F", "D"]);
    expect(new Set(Object.values(BASE_COLLECTION_METADATA).map(({code}) => code)).size).toBe(5);
  });

  it("formats only positive built-in puzzle numbers", () => {
    expect(getBaseCollectionPuzzleCode("easy", 1)).toBe("E-1");
    expect(getBaseCollectionPuzzleCode("fiendish", 27)).toBe("F-27");
    expect(getBaseCollectionPuzzleCode("diabolical", 500)).toBe("D-500");
    expect(getBaseCollectionPuzzleCode("custom", 1)).toBeUndefined();
    expect(getBaseCollectionPuzzleCode("easy", 0)).toBeUndefined();
  });

  it("keeps custom collection display labels unchanged", () => {
    vi.spyOn(appPersistence.collections, "loadIndex").mockReturnValue([{id: "custom", name: "My puzzles"}]);
    expect(getSudokuPuzzleDisplayLabel("custom", 2)).toBe("My puzzles #2");
  });

  it("defines the approved localized top difficulty names", () => {
    expect([en.difficulty_fiendish, en.difficulty_diabolical]).toEqual(["Fiendish", "Diabolical"]);
    expect([fr.difficulty_fiendish, fr.difficulty_diabolical]).toEqual(["Infernal", "Diabolique"]);
    expect([es.difficulty_fiendish, es.difficulty_diabolical]).toEqual(["Dificilísimo", "Diabólico"]);
    expect([de.difficulty_fiendish, de.difficulty_diabolical]).toEqual(["Tückisch", "Diabolisch"]);
    expect([itLocale.difficulty_fiendish, itLocale.difficulty_diabolical]).toEqual(["Infernale", "Diabolico"]);
    expect([pt.difficulty_fiendish, pt.difficulty_diabolical]).toEqual(["Infernal", "Diabólico"]);
    expect([zh.difficulty_fiendish, zh.difficulty_diabolical]).toEqual(["刁钻", "魔鬼"]);
  });
});
```

- [ ] **Step 2: Run the metadata test and verify it fails to compile**

Run:

```bash
pnpm exec vitest run src/lib/game/baseCollectionMetadata.test.ts
```

Expected: FAIL because the metadata module, helpers, and new translation keys do not exist.

- [ ] **Step 3: Implement the pure metadata module**

Create `src/lib/game/baseCollectionMetadata.ts`:

```ts
import type {BaseCollection} from "src/lib/database/collections";

export interface BaseCollectionMetadata {
  code: "E" | "M" | "H" | "F" | "D";
  translationKey:
    | "difficulty_easy"
    | "difficulty_medium"
    | "difficulty_hard"
    | "difficulty_fiendish"
    | "difficulty_diabolical";
}

export const BASE_COLLECTION_METADATA = {
  easy: {code: "E", translationKey: "difficulty_easy"},
  medium: {code: "M", translationKey: "difficulty_medium"},
  hard: {code: "H", translationKey: "difficulty_hard"},
  fiendish: {code: "F", translationKey: "difficulty_fiendish"},
  diabolical: {code: "D", translationKey: "difficulty_diabolical"},
} as const satisfies Record<BaseCollection, BaseCollectionMetadata>;

export function getBaseCollectionMetadata(collectionId: string): BaseCollectionMetadata | undefined {
  if (!Object.prototype.hasOwnProperty.call(BASE_COLLECTION_METADATA, collectionId)) {
    return undefined;
  }
  return BASE_COLLECTION_METADATA[collectionId as BaseCollection];
}

export function getBaseCollectionPuzzleCode(collectionId: string, puzzleNumber: number): string | undefined {
  const metadata = getBaseCollectionMetadata(collectionId);
  if (!metadata || !Number.isSafeInteger(puzzleNumber) || puzzleNumber < 1) {
    return undefined;
  }
  return `${metadata.code}-${puzzleNumber}`;
}
```

In `src/lib/game/collectionNames.ts`, add:

```ts
import {getBaseCollectionPuzzleCode} from "src/lib/game/baseCollectionMetadata";

export function getSudokuPuzzleDisplayLabel(collectionId: string, puzzleNumber: number) {
  return (
    getBaseCollectionPuzzleCode(collectionId, puzzleNumber) ??
    `${getSudokuCollectionDisplayName(collectionId)} #${puzzleNumber}`
  );
}
```

For the test's custom-name case, `getSudokuCollectionDisplayName("My puzzles")` falls back to the passed string when no stored custom index exists.

- [ ] **Step 4: Connect translations to metadata and set the exact localized names**

Replace the hard-coded translation record in `src/lib/database/collections.ts` with:

```ts
import {getBaseCollectionMetadata} from "src/lib/game/baseCollectionMetadata";

export function translateCollectionName(collectionName: string) {
  const metadata = getBaseCollectionMetadata(collectionName);
  return metadata ? t(metadata.translationKey) : collectionName;
}
```

Rename `difficulty_expert`/`difficulty_evil` to `difficulty_fiendish`/`difficulty_diabolical` and set these exact JSON values:

| File | `difficulty_fiendish` | `difficulty_diabolical` |
| --- | --- | --- |
| `src/locales/en.json` | `Fiendish` | `Diabolical` |
| `src/locales/fr.json` | `Infernal` | `Diabolique` |
| `src/locales/es.json` | `Dificilísimo` | `Diabólico` |
| `src/locales/de.json` | `Tückisch` | `Diabolisch` |
| `src/locales/it.json` | `Infernale` | `Diabolico` |
| `src/locales/pt.json` | `Infernal` | `Diabólico` |
| `src/locales/zh.json` | `刁钻` | `魔鬼` |

- [ ] **Step 5: Run focused tests and typecheck**

Run:

```bash
pnpm exec vitest run src/lib/game/baseCollectionMetadata.test.ts src/pages/SelectGame.test.tsx
pnpm run typecheck:web
```

Expected: all commands pass.

- [ ] **Step 6: Commit the metadata and names**

```bash
git add src/lib/database/collections.ts src/lib/game/baseCollectionMetadata.ts src/lib/game/baseCollectionMetadata.test.ts src/lib/game/collectionNames.ts src/locales
git commit -m "feat: define localized difficulty metadata"
```

---

### Task 3: Show stable puzzle codes on selection cards

**Files:**
- Modify: `src/components/sudoku/SudokuPreview.tsx`
- Modify: `src/pages/Game/GameSelect.tsx`
- Modify: `src/pages/SelectGame.test.tsx`
- Modify: `src/locales/en.json`
- Modify: `src/locales/fr.json`
- Modify: `src/locales/es.json`
- Modify: `src/locales/de.json`
- Modify: `src/locales/it.json`
- Modify: `src/locales/pt.json`
- Modify: `src/locales/zh.json`
- Modify: `e2e/select-game.e2e.ts`

**Interfaces:**
- Consumes: `getBaseCollectionPuzzleCode(collectionId, puzzleNumber)` from Task 2.
- Produces: optional `label?: string` on `SudokuPreview`; its numeric `id` and data-test IDs remain unchanged.
- Produces: localized `select_sudoku` interpolation using `difficulty` and `puzzleLabel`.

- [ ] **Step 1: Add failing component assertions for base and custom card labels**

In the existing Solo/Create Online test in `src/pages/SelectGame.test.tsx`, assert before switching to the custom collection:

```ts
expect(screen.getByTestId("sudoku-preview-number-1").textContent).toBe("E-1");
```

After clicking `select-game-collection-custom-one`, assert:

```ts
expect(screen.getByTestId("sudoku-preview-number-1").textContent).toBe("1");
```

- [ ] **Step 2: Run the component test and verify the label assertion fails**

Run:

```bash
pnpm exec vitest run src/pages/SelectGame.test.tsx
```

Expected: FAIL because the Easy card still shows `1`.

- [ ] **Step 3: Add a separate visual label prop without changing selectors**

Change the `SudokuPreview` props and render logic in `src/components/sudoku/SudokuPreview.tsx`:

```ts
export default class SudokuPreview extends React.PureComponent<{
  sudoku: SimpleSudoku;
  id: number;
  label?: string;
  darken?: boolean;
  size?: number;
  ariaLabel?: string;
  disabled?: boolean;
  onClick: () => void;
}> {
  render() {
    const {sudoku, id, label, onClick, size = 150, ariaLabel, disabled = false} = this.props;
    const visibleLabel = label ?? String(id);
    const labelScale = visibleLabel.length >= 5 ? 5 : visibleLabel.length >= 3 ? 4 : 3;
```

Keep `data-testid={`sudoku-preview-${id}`}` and `data-testid={`sudoku-preview-number-${id}`}` unchanged. Render `{visibleLabel}` and use `style={{fontSize: size / labelScale}}` for the label.

- [ ] **Step 4: Pass base codes and localized accessible names from GameSelect**

In `SudokuToSelect` inside `src/pages/Game/GameSelect.tsx`, calculate:

```ts
const puzzleNumber = index + 1;
const puzzleCode = getBaseCollectionPuzzleCode(sudokuCollectionName, puzzleNumber);
const puzzleLabel = puzzleCode ?? String(puzzleNumber);
const difficulty = translateCollectionName(sudokuCollectionName);
```

Pass:

```tsx
<SudokuPreview
  id={puzzleNumber}
  label={puzzleLabel}
  ariaLabel={t("select_sudoku", {difficulty, puzzleLabel})}
  // retain the existing size, disabled, sudoku, darken, and onClick props
/>
```

Set exact `select_sudoku` strings:

| Locale file | Value |
| --- | --- |
| `en.json` | `Select {{difficulty}} puzzle {{puzzleLabel}}` |
| `fr.json` | `Sélectionner le sudoku {{puzzleLabel}} de difficulté {{difficulty}}` |
| `es.json` | `Seleccionar sudoku {{puzzleLabel}} de dificultad {{difficulty}}` |
| `de.json` | `Sudoku {{puzzleLabel}} ({{difficulty}}) auswählen` |
| `it.json` | `Seleziona il sudoku {{puzzleLabel}} di difficoltà {{difficulty}}` |
| `pt.json` | `Selecionar sudoku {{puzzleLabel}} de dificuldade {{difficulty}}` |
| `zh.json` | `选择{{difficulty}}数独 {{puzzleLabel}}` |

- [ ] **Step 5: Update responsive and multilingual selection e2e coverage**

In `e2e/select-game.e2e.ts`, rename `expectPreviewNumberAboveMetadata` to `expectPreviewLabelAboveMetadata` and its local `previewNumber` variable to `previewLabel`. Retain every bounding-box and colour assertion, and add:

```ts
await expect(previewLabel).toHaveText(`E-${previewId}`);
await expectInsideElement(previewLabel, preview, `${name} label`);
```

Add:

```ts
test("localizes difficulty names while keeping puzzle codes invariant", async ({page}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "language", {value: "es-ES", configurable: true});
    Object.defineProperty(navigator, "languages", {value: ["es-ES", "es"], configurable: true});
  });
  await page.goto("/#/select-game");

  await expect(page.getByTestId("select-game-collection-easy")).toHaveText("Fácil");
  await expect(page.getByTestId("sudoku-preview-number-1")).toHaveText("E-1");
  await expect(page.getByTestId("sudoku-preview-1")).toHaveAccessibleName(
    "Seleccionar sudoku E-1 de dificultad Fácil",
  );
});
```

- [ ] **Step 6: Run focused unit and Playwright checks**

Run:

```bash
pnpm exec vitest run src/pages/SelectGame.test.tsx
pnpm exec playwright test e2e/select-game.e2e.ts --project=chromium-light
```

Expected: all tests pass, including every responsive viewport.

- [ ] **Step 7: Commit selection-card codes**

```bash
git add src/components/sudoku/SudokuPreview.tsx src/pages/Game/GameSelect.tsx src/pages/SelectGame.test.tsx src/locales e2e/select-game.e2e.ts
git commit -m "feat: label built-in puzzle cards"
```

---

### Task 4: Use puzzle codes throughout solo and multiplayer game UI

**Files:**
- Modify: `src/pages/Game.tsx`
- Modify: `src/pages/Game/MultiplayerGameController.tsx`
- Modify: `src/pages/Game/GameView.tsx`
- Modify: `src/pages/Game/GameView.test.tsx`
- Modify: `src/pages/Game/GameHeader.tsx`
- Modify: `src/pages/Game/GameHeader.test.tsx`
- Modify: `src/pages/Game/GameCompletionPanel.tsx`
- Modify: `src/pages/Game/useGameRouteSync.ts`
- Modify: `src/locales/en.json`
- Modify: `src/locales/fr.json`
- Modify: `src/locales/es.json`
- Modify: `src/locales/de.json`
- Modify: `src/locales/it.json`
- Modify: `src/locales/pt.json`
- Modify: `src/locales/zh.json`
- Modify: `e2e/completion-screen.e2e.ts`
- Modify: `e2e/sudoku.e2e.ts`
- Modify: `e2e/pwa-offline.e2e.ts`
- Modify: `e2e/multiplayer.e2e.ts`

**Interfaces:**
- Consumes: `getSudokuPuzzleDisplayLabel(collectionId, oneBasedPuzzleNumber)` from Task 2.
- Produces: `GameViewProps.puzzleLabel: string` and `GameHeader`'s `puzzleLabel: string` prop.
- Removes: `collectionName` and `sudokuIndex` from the presentation-only `GameView`/`GameHeader` boundary.
- Produces: `confirm_new_game` interpolation with `currentPuzzleLabel` and `newPuzzleLabel`.
- Produces: `completion_next_sudoku` interpolation with `puzzleLabel`.

- [ ] **Step 1: Change header tests to require a complete puzzle label**

In `src/pages/Game/GameHeader.test.tsx`, replace `collectionName="Easy"` and `sudokuIndex={0}` with:

```tsx
puzzleLabel="E-1"
```

Add:

```ts
it("shows the supplied stable puzzle label", () => {
  renderHeader();
  expect(screen.getByTestId("current-game-label").textContent).toBe("E-1");
});
```

In `src/pages/Game/GameView.test.tsx`, replace the default `collectionName` and `sudokuIndex` props with `puzzleLabel: "E-1"`.

- [ ] **Step 2: Run the focused component tests and verify they fail to compile**

Run:

```bash
pnpm exec vitest run src/pages/Game/GameHeader.test.tsx src/pages/Game/GameView.test.tsx
```

Expected: FAIL because `puzzleLabel` is not yet a supported prop.

- [ ] **Step 3: Replace reconstructed header labels with the shared formatted label**

In `src/pages/Game/GameHeader.tsx`, replace `collectionName` and `sudokuIndex` props with `puzzleLabel: string`, then render:

```tsx
<DifficultyShow className="truncate text-white" data-testid="current-game-label">
  {puzzleLabel}
</DifficultyShow>
```

In `src/pages/Game/GameView.tsx`, replace the two old props with `puzzleLabel`, and pass only `puzzleLabel={puzzleLabel}` to `GameHeader`.

In `src/pages/Game.tsx`, calculate and pass:

```ts
const puzzleLabel = getSudokuPuzzleDisplayLabel(
  gameState.sudokuCollectionName,
  gameState.sudokuIndex + 1,
);
```

In `src/pages/Game/MultiplayerGameController.tsx`, pass:

```tsx
puzzleLabel={getSudokuPuzzleDisplayLabel(confirmed.collectionId, confirmed.puzzleNumber)}
```

- [ ] **Step 4: Use the shared next-puzzle label in the completion panel**

In `useNextSudoku()` in `src/pages/Game/GameCompletionPanel.tsx`, return `nextPuzzleLabel` alongside `nextSudokuParams`:

```ts
const nextPuzzleNumber = nextIndex + 1;
const nextSudokuParams: NextSudokuParams = {
  collection: sudokuCollectionName,
  puzzle: nextPuzzleNumber,
};

return {
  collectionName,
  nextPuzzleLabel: getSudokuPuzzleDisplayLabel(sudokuCollectionName, nextPuzzleNumber),
  nextSudokuParams,
};
```

Return `nextPuzzleLabel: null` in both no-next-puzzle paths. Render the action with:

```tsx
{t("completion_next_sudoku", {puzzleLabel: nextPuzzleLabel})}
```

Set the exact localized values:

| Locale | `completion_next_sudoku` |
| --- | --- |
| English | `Next {{puzzleLabel}}` |
| French | `Suivant : {{puzzleLabel}}` |
| Spanish | `Siguiente: {{puzzleLabel}}` |
| German | `Weiter: {{puzzleLabel}}` |
| Italian | `Successivo: {{puzzleLabel}}` |
| Portuguese | `Próximo: {{puzzleLabel}}` |
| Chinese | `下一题：{{puzzleLabel}}` |

- [ ] **Step 5: Use stable labels in the route-change confirmation**

In `src/pages/Game/useGameRouteSync.ts`, replace the four name/index interpolation values with:

```ts
message: translate("confirm_new_game", {
  currentPuzzleLabel: getSudokuPuzzleDisplayLabel(
    currentGameState.sudokuCollectionName,
    currentGameState.sudokuIndex + 1,
  ),
  newPuzzleLabel: getSudokuPuzzleDisplayLabel(
    routeSudoku.sudokuCollectionName,
    routeSudoku.sudokuIndex,
  ),
}),
```

Set these exact values:

| Locale | `confirm_new_game` |
| --- | --- |
| English | `You are currently playing sudoku {{currentPuzzleLabel}}, do you want to pause it and start {{newPuzzleLabel}}?` |
| French | `Vous êtes en train de jouer au sudoku {{currentPuzzleLabel}}, voulez-vous le mettre en pause et commencer {{newPuzzleLabel}} ?` |
| Spanish | `Actualmente estás jugando el sudoku {{currentPuzzleLabel}}, ¿quieres pausarlo e iniciar {{newPuzzleLabel}}?` |
| German | `Sie spielen gerade Sudoku {{currentPuzzleLabel}}, möchten Sie es pausieren und {{newPuzzleLabel}} starten?` |
| Italian | `Stai attualmente giocando al sudoku {{currentPuzzleLabel}}, vuoi metterlo in pausa e iniziare {{newPuzzleLabel}}?` |
| Portuguese | `Você está jogando o sudoku {{currentPuzzleLabel}}, deseja pausá-lo e iniciar {{newPuzzleLabel}}?` |
| Chinese | `你当前正在游玩数独 {{currentPuzzleLabel}}，是否暂停并开始 {{newPuzzleLabel}}？` |

- [ ] **Step 6: Update all game-flow expectations**

Make these exact expectation changes while preserving custom labels:

```text
Easy #1   -> E-1
Easy #2   -> E-2
Medium #1 -> M-1
Fácil #1  -> E-1
custom #1 -> custom #1
```

Apply them in `e2e/completion-screen.e2e.ts`, `e2e/sudoku.e2e.ts`, `e2e/pwa-offline.e2e.ts`, and `e2e/multiplayer.e2e.ts`. Change the route-confirmation assertion to contain `start E-2`. Update the two `openGame()` helpers so their expected label is a puzzle code rather than `${label} #${sudokuIndex}`; their default expected code is `E-${sudokuIndex}`.

Also assert the first completion action text before clicking it:

```ts
await expect(page.getByTestId("sudoku-completion-next")).toHaveText("Next E-2");
```

- [ ] **Step 7: Run component and selected e2e checks**

Run:

```bash
pnpm exec vitest run src/pages/Game/GameHeader.test.tsx src/pages/Game/GameView.test.tsx
pnpm exec playwright test e2e/completion-screen.e2e.ts e2e/sudoku.e2e.ts e2e/pwa-offline.e2e.ts --project=chromium-light
pnpm run test:e2e:multiplayer
```

Expected: all commands pass; both solo and multiplayer headers show `E-1`, and the completion action shows `Next E-2`.

- [ ] **Step 8: Commit consistent game labels**

```bash
git add src/pages/Game.tsx src/pages/Game src/locales e2e
git commit -m "feat: use puzzle codes across game flows"
```

---

### Task 5: Normalize stale browser state and verify new routes

**Files:**
- Modify: `src/lib/database/playedSudokus.ts`
- Modify: `src/lib/database/playedSudokus.test.ts`
- Modify: `src/pages/Game/gameRouteContract.test.ts`
- Modify: `e2e/sudoku.e2e.ts`

**Interfaces:**
- Produces: private persistence-boundary conversion `expert -> fiendish` and `evil -> diabolical`.
- Preserves: invalid-route recovery for unsupported old compact URLs; no permanent URL alias is added.

- [ ] **Step 1: Add failing persistence normalization tests**

Replace the old `difficulty: "expert"` expectation in `src/lib/database/playedSudokus.test.ts` with a table covering both old IDs:

```ts
it.each([
  ["expert", "fiendish"],
  ["evil", "diabolical"],
])("normalizes legacy difficulty %s to %s", (legacyId, canonicalId) => {
  const migratedGame: Record<string, unknown> = {...INITIAL_GAME_STATE, difficulty: legacyId};
  delete migratedGame.sudokuCollectionName;
  vi.stubGlobal(
    "localStorage",
    createLocalStorageMock({
      [storageKey]: JSON.stringify({game: migratedGame, sudoku: INITIAL_SUDOKU_STATE.current}),
    }),
  );

  expect(localStoragePlayedSudokuRepository.getSudokuState(sudokuKey)?.game.sudokuCollectionName).toBe(canonicalId);
});
```

Add a second table for modern-shape stale states:

```ts
it.each([
  ["expert", "fiendish"],
  ["evil", "diabolical"],
])("normalizes stale collection name %s to %s", (legacyId, canonicalId) => {
  const game = {...INITIAL_GAME_STATE, sudokuCollectionName: legacyId};
  vi.stubGlobal(
    "localStorage",
    createLocalStorageMock({
      [storageKey]: JSON.stringify({game, sudoku: INITIAL_SUDOKU_STATE.current}),
    }),
  );

  expect(localStoragePlayedSudokuRepository.getSudokuState(sudokuKey)?.game.sudokuCollectionName).toBe(canonicalId);
});
```

- [ ] **Step 2: Run the persistence tests and verify they fail**

Run:

```bash
pnpm exec vitest run src/lib/database/playedSudokus.test.ts
```

Expected: all four cases return the old ID instead of the canonical ID.

- [ ] **Step 3: Normalize only at the persistence boundary**

Add to `src/lib/database/playedSudokus.ts`:

```ts
const LEGACY_BASE_COLLECTION_IDS: Readonly<Record<string, string>> = {
  expert: "fiendish",
  evil: "diabolical",
};

function normalizeStoredCollectionId(collectionId: string): string {
  return LEGACY_BASE_COLLECTION_IDS[collectionId] ?? collectionId;
}
```

After applying the pre-existing `difficulty` fallback in `getSudokuFromStorage()`, normalize the resulting name:

```ts
const collectionName = sudoku.game.sudokuCollectionName;
if (collectionName) {
  sudoku.game.sudokuCollectionName = normalizeStoredCollectionId(collectionName);
}
```

Do not export this helper and do not apply it to route parsing or custom collection lookup.

- [ ] **Step 4: Add canonical and retired route coverage**

In `src/pages/Game/gameRouteContract.test.ts`, add:

```ts
it("builds the renamed top-difficulty compact routes", () => {
  expect(createCompactGameSearch("fiendish", 1)).toEqual({collection: "fiendish", puzzle: 1});
  expect(createCompactGameSearch("diabolical", 500)).toEqual({collection: "diabolical", puzzle: 500});
});
```

In `e2e/sudoku.e2e.ts`, add:

```ts
test("loads a canonical Fiendish catalog route", async ({page}) => {
  await page.goto(gameUrl(1, "fiendish"));
  await expect(page.getByTestId("current-game-label")).toHaveText("F-1");
  await expect(page.getByTestId("sudoku-board")).toBeVisible();
  await expectGameSearch(page, "", 1, "fiendish");
});

test("recovers safely from a retired Expert compact route", async ({page}) => {
  await page.goto(gameUrl(1, "expert"));
  await expect(page.getByTestId("app-dialog-message")).toHaveText("The Sudoku in the URL is invalid.");
  await page.getByTestId("app-dialog-confirm").click();
  await expect(page).not.toHaveURL(/collection=expert/);
});
```

Adjust the `expectGameSearch` call if the helper does not require its unused Sudoku argument after Task 4; do not weaken the expected `collection: "fiendish"` and `puzzle: "1"` assertions.

- [ ] **Step 5: Run focused persistence and route checks**

Run:

```bash
pnpm exec vitest run src/lib/database/playedSudokus.test.ts src/pages/Game/gameRouteContract.test.ts
pnpm exec playwright test e2e/sudoku.e2e.ts --project=chromium-light
```

Expected: all commands pass. The stale-state unit tests return only canonical IDs, the Fiendish route loads `F-1`, and the old Expert route uses invalid-route recovery.

- [ ] **Step 6: Commit compatibility boundaries**

```bash
git add src/lib/database/playedSudokus.ts src/lib/database/playedSudokus.test.ts src/pages/Game/gameRouteContract.test.ts e2e/sudoku.e2e.ts
git commit -m "fix: normalize retired difficulty state"
```

---

### Task 6: Finish multiplayer catalog coverage, documentation, and verification

**Files:**
- Modify: `e2e/multiplayer.e2e.ts`
- Modify: `package.json`
- Modify: `index.html`
- Modify: `public/site.webmanifest`
- Modify: `src/pwa/manifest.ts`
- Modify: `Glossary.md`
- Modify: `AGENTS.md`
- Modify: `docs/multiplayer-operations.md`

**Interfaces:**
- Consumes: all canonical IDs, localized names, puzzle-code helpers, and renamed catalogs from Tasks 1-5.
- Produces: operational documentation for the expand migration and backend-first deployment.
- Produces: a linked follow-up GitHub issue for the later contract migration.

- [ ] **Step 1: Add a real renamed-catalog multiplayer test**

Add to `e2e/multiplayer.e2e.ts`:

```ts
test("creates a room from the renamed Fiendish catalog", async ({page}) => {
  await page.goto("/#/select-game");
  await page.getByRole("button", {name: "Create online room"}).click();
  await page.getByTestId("select-game-collection-fiendish").click();
  await page.getByTestId("select-game-card-1").click();

  await expect(page.getByTestId("current-game-label")).toHaveText("F-1");
  await expect(page.getByTestId("sudoku-board")).toBeVisible();
  await expect(page.getByTestId("multiplayer-room-code")).toHaveText(/^[A-HJ-NP-Z2-9]{6}$/);
});
```

Update all existing Easy-room expectations in this file to `E-1` as required by Task 4.

- [ ] **Step 2: Run the renamed-catalog multiplayer test**

Run:

```bash
pnpm exec playwright test --config playwright.multiplayer.config.ts e2e/multiplayer.e2e.ts --grep "renamed Fiendish catalog"
```

Expected: PASS against the real in-memory Socket.IO backend and renamed static catalog.

- [ ] **Step 3: Update current public and developer documentation**

Replace the obsolete public description in `package.json`, `index.html`, `public/site.webmanifest`, and `src/pwa/manifest.ts` with:

```text
Play over 3,000 Sudoku puzzles across five difficulty levels. Open source and free with no tracking.
```

Update `Glossary.md` to define the difficulty ladder as Easy, Medium, Hard, Fiendish, and Diabolical and define a Puzzle Code as the stable `E/M/H/F/D-N` identifier.

Update `AGENTS.md` and `docs/multiplayer-operations.md` so the live catalog filenames are `easy.txt`, `medium.txt`, `hard.txt`, `fiendish.txt`, and `diabolical.txt`. Add the following operational facts without weakening existing rules:

```text
- Migration 003 expands the room collection constraint for expert/evil compatibility and canonicalizes existing rows.
- New writes use only fiendish/diabolical; the old values remain allowed until a later contract migration.
- Deploy the multiplayer backend before the updated frontend and take a Neon snapshot before the schema release.
- Catalog file contents and line order did not change during the rename.
```

Do not edit historical files under `docs/superpowers/specs/` or `docs/superpowers/plans/` other than this implementation plan's checkbox tracking.

- [ ] **Step 4: Audit every remaining retired term**

Run:

```bash
rg -n -i "expert|evil" --glob '!docs/superpowers/specs/**' --glob '!docs/superpowers/plans/**' --glob '!.git/**' .
```

Expected: every remaining occurrence is one of these explicit exceptions:

```text
server/migrations/001_multiplayer_rooms.sql       immutable applied migration
server/migrations/003_difficulty_ids.sql          rollout compatibility
server/src/db/roomRows.ts and its test             isolated database compatibility
src/lib/database/playedSudokus.ts and its test     isolated browser compatibility
scripts/fetch_sudokus.ts                           external provider vocabulary
src/lib/engine/difficulties.test.ts                external provider/research vocabulary
src/lib/engine/generate.ts and solver comments     cited historical research vocabulary
historical docs excluded by the command            historical record
```

Fix any other application-owned occurrence before continuing.

- [ ] **Step 5: Run formatting and the complete required checks**

Run:

```bash
pnpm run typecheck
pnpm run lint
pnpm test
pnpm build
pnpm run test:e2e
pnpm run test:e2e:multiplayer
git diff --check
```

Expected: every command passes with no warnings attributable to this change.

- [ ] **Step 6: Verify the production backend image when a container engine is available**

First run:

```bash
docker info
```

If it succeeds, run:

```bash
docker build -f server/Dockerfile -t sudoku-multiplayer:verify .
```

Expected: the image builds and contains the renamed catalogs. If no local engine is running, record that exact limitation in the issue completion comment and do not claim a local Docker pass.

- [ ] **Step 7: Create the required linked contract-migration issue**

Run:

```bash
gh issue create --title "Remove legacy Expert/Evil multiplayer database IDs" --body "Follow-up to #41. After the Fiendish/Diabolical release and rollback window have completed and the older server image can no longer write, add a new numbered contract migration that rewrites any release-window expert/evil rows, removes those legacy values from the rooms collection_id constraint, and removes the temporary server row aliases. Do not edit migration 003."
```

Expected: a new issue URL. Add that URL to the completion comment on issue #41.

- [ ] **Step 8: Commit documentation and final test coverage**

```bash
git add e2e/multiplayer.e2e.ts package.json index.html public/site.webmanifest src/pwa/manifest.ts Glossary.md AGENTS.md docs/multiplayer-operations.md
git commit -m "docs: record renamed difficulty catalog"
```

- [ ] **Step 9: Comment on and close issue #41**

Run `git log --format="%h %s" ba1537d..HEAD` and retain its exact output. Post a completion comment with that output, the exact follow-up issue URL printed in Step 7, and one of the two explicit Docker results: `docker build passed locally` or `docker build not run because docker info reported no running local engine`.

The comment must state:

```text
Implemented the full Expert/Evil to Fiendish/Diabolical canonical ID migration, invariant E/M/H/F/D puzzle codes, localized names, catalog renames, rollout-safe database expansion, and legacy state normalization.

Checks passed: pnpm run typecheck; pnpm run lint; pnpm test; pnpm build; pnpm run test:e2e; pnpm run test:e2e:multiplayer.
```

Append the exact implementation commit lines, Docker result, and follow-up URL gathered above, then submit with `gh issue comment 41 --body`. Close issue #41 with `gh issue close 41` because its acceptance criteria are satisfied.

- [ ] **Step 10: Offer the branch for manual browser review**

Report the final branch status and ask whether the user wants this worktree started with `pnpm start` on host port 3000. If they accept, first check for an existing server, reuse it when it is this workspace, and verify it with both `lsof` and `curl` as required by `AGENTS.md`.
