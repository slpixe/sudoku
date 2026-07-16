# Difficulty Names and Puzzle Codes Design

**Issue:** [#41](https://github.com/slpixe/sudoku/issues/41)

## Summary

Rename the two highest built-in Sudoku difficulties from Expert and Evil to
Fiendish and Diabolical. This is a full canonical ID migration:

| Order | Canonical ID | English name | Puzzle-code prefix |
| --- | --- | --- | --- |
| 1 | `easy` | Easy | `E` |
| 2 | `medium` | Medium | `M` |
| 3 | `hard` | Hard | `H` |
| 4 | `fiendish` | Fiendish | `F` |
| 5 | `diabolical` | Diabolical | `D` |

Built-in puzzles receive stable labels such as `E-1`, `F-27`, and `D-500`.
These codes are identifiers, not localized abbreviations. They remain the same
in every language while difficulty names and surrounding accessible text are
localized normally.

The application has not yet had player activity in Expert or Evil, so losing
progress, links, or live rooms for those two old IDs is acceptable. The change
must nevertheless leave the application in a valid state when stale browser
data or a legacy database row is encountered.

## Goals

- Use Easy, Medium, Hard, Fiendish, and Diabolical as the English difficulty
  ladder.
- Replace `expert` and `evil` with `fiendish` and `diabolical` as canonical IDs
  in frontend routes, shared types, multiplayer messages, Postgres rows,
  generator inputs, and runtime catalog filenames.
- Give every built-in puzzle a stable, language-independent `E/M/H/F/D-N`
  code.
- Show the same puzzle code on selection cards, in the game header, and in the
  next-puzzle completion action for solo and multiplayer play.
- Keep difficulty names idiomatically localized without changing puzzle codes.
- Preserve every runtime puzzle line and its order during the catalog-file
  rename.
- Make stale local or server data fail safely or normalize to the new IDs
  instead of leaving the UI in a broken mixed-ID state.

## Non-goals

- Changing how puzzle difficulty is calculated.
- Reclassifying or regenerating any puzzle.
- Encoding a difficulty or puzzle code in room codes.
- Giving custom collections single-letter codes.
- Guaranteeing that old Expert/Evil bookmarks or cached clients continue to
  work. There is no affected production player activity, and this migration is
  allowed to invalidate those old entry points.
- Rewriting historical design and implementation documents that accurately
  describe the system at the time they were written.

## Canonical IDs and Catalogs

The canonical base collection union becomes:

```text
easy | medium | hard | fiendish | diabolical
```

Frontend collection enums, engine difficulty enums, shared core types, shared
multiplayer schemas, server validation, and current tests use those terms. The
runtime puzzle files are renamed without changing their contents:

```text
sudokus/expert.txt -> sudokus/fiendish.txt
sudokus/evil.txt -> sudokus/diabolical.txt
```

Imports, server catalog lookup, Docker copies, generator scripts, and package
commands follow the new filenames. The old words may remain only where they
refer to an external provider's vocabulary, historical research data, an
applied migration, or an explicitly documented legacy compatibility boundary.

The rename must preserve the exact bytes, line order, and line count of both
catalogs. No puzzle can be inserted, removed, reordered, or regenerated as part
of this work.

## Difficulty Metadata and Puzzle Labels

One frontend metadata definition maps each canonical base collection ID to its
translation key and puzzle-code prefix. All UI code obtains base difficulty
names and puzzle codes through shared helpers rather than taking the first
letter of translated text.

The puzzle-label formatter accepts a collection ID and a one-based puzzle
number. For a base collection it returns the stable code, such as `F-1`. Custom
collections retain their existing behavior: their cards continue showing the
numeric index, and their game/completion labels continue using the custom
collection name and `#N` format.

Visible base-puzzle labels change as follows:

- A selection card shows `F-1` instead of `1`.
- The game header shows `F-1` instead of `Fiendish #1`.
- The completion action says `Next F-2` instead of `Next Fiendish #2`.
- Collection-complete text continues to use the localized difficulty name.

The numeric/card test IDs remain unchanged so display copy is not coupled to
DOM selectors. Preview typography must accommodate the longest expected label,
including `D-500`, at supported phone, tablet, and desktop card sizes.

## Localization and Accessibility

English translations use Fiendish and Diabolical. The proposed localized
labels for the two renamed levels are:

| Locale | Fiendish | Diabolical |
| --- | --- | --- |
| English | Fiendish | Diabolical |
| French | Infernal | Diabolique |
| Spanish | Dificilísimo | Diabólico |
| German | Tückisch | Diabolisch |
| Italian | Infernale | Diabolico |
| Portuguese | Infernal | Diabólico |
| Chinese | 刁钻 | 魔鬼 |

These are idiomatic difficulty labels rather than forced initial-preserving
translations. Translation keys and interpolation names are updated to describe
the new product terminology.

Puzzle codes remain `E/M/H/F/D-N` in English, French, Spanish, German, Italian,
Portuguese, and Chinese. A localized accessible label combines the translated
difficulty name with the invariant code. For example, a Spanish card can be
announced as the localized equivalent of "Select Easy puzzle E-1" even though
the Spanish word for Easy does not begin with E.

The longer Diabolical label must wrap or size correctly in the existing
responsive difficulty tabs without causing horizontal overflow.

## Browser State and Routes

New navigation writes only `fiendish` and `diabolical` route values. Old compact
URLs containing `collection=expert` or `collection=evil` may be treated as
invalid and use the existing invalid-route recovery. They do not need permanent
aliases.

Saved games are keyed by puzzle givens, so stale unfinished state can still be
found after the catalog rename. When persisted game state contains an old top
difficulty ID, the persistence boundary normalizes it to the corresponding new
ID before the state enters the application. This small defensive conversion
prevents a stale local entry from restoring `expert` or `evil` into otherwise
canonical runtime state. No broader saved-data migration or preservation
guarantee is required.

## Multiplayer Database and Rollout Safety

Applied migrations remain immutable. A new numbered forward migration expands
the `rooms.collection_id` constraint to accept both old and new top-difficulty
IDs, then rewrites existing `expert` rows to `fiendish` and `evil` rows to
`diabolical`. Easy, Medium, and Hard rows are unchanged.

The expanded constraint intentionally retains the old values for the release
and rollback window. The previous server image can therefore finish an old-ID
write while the release command is running. The new server's database-row
boundary accepts a legacy row and normalizes it to a canonical snapshot; all
new application and protocol writes use only the new IDs.

Because old cached clients understand only the old protocol values, an old
client may not be able to use a newly created Fiendish or Diabolical room. This
is accepted because there is no player activity in those difficulties. Easy,
Medium, and Hard remain wire-compatible.

A later linked contract issue will add a separate numbered migration that
removes `expert` and `evil` from the database constraint after the old server
image can no longer write. It must not be bundled into the same release as the
expand migration.

Frontend and backend catalogs must be deployed from compatible revisions. The
backend should be deployed before the frontend so the new canonical create-room
IDs are accepted when the updated PWA becomes available. A Neon snapshot is
taken before the schema release according to the operations runbook.

## Developer Tooling and Documentation

Generator commands, CLI help, enum member names, and application-owned comments
use Fiendish and Diabolical. The generator writes the renamed runtime files.
External-provider mappings can retain `expert` or `evil` when those are literal
upstream API levels; comments should make that distinction explicit.

Current public metadata should avoid the obsolete "easy to evil" phrase and use
the stable description "across five difficulty levels." The glossary, project
instructions, multiplayer operations runbook, and current code comments are
updated where they define the live product or catalog contract. Historical
specs and plans remain untouched.

## Verification

Focused automated coverage must establish:

- the five canonical IDs are ordered correctly;
- every base difficulty has a unique invariant code prefix;
- English names are Easy, Medium, Hard, Fiendish, and Diabolical;
- another locale displays localized names while retaining `E/M/H/F/D` codes;
- selection cards, solo headers, multiplayer headers, and completion actions
  show the shared puzzle label;
- custom collection labels remain unchanged;
- old persisted `expert` and `evil` state is normalized on read;
- new routes use `fiendish` and `diabolical`, while the invalid-route behavior
  for unsupported IDs remains safe;
- multiplayer schemas accept new canonical IDs and reject old client writes;
- the server maps any legacy database row to the new canonical ID;
- the database migration rewrites old rows and permits both old and new writes
  during the compatibility window;
- renamed puzzle files are byte-for-byte identical to their predecessors;
- a real multiplayer room can be created from at least one renamed catalog.

Run the project baseline checks:

```text
pnpm run typecheck
pnpm run lint
pnpm test
pnpm build
pnpm run test:e2e
pnpm run test:e2e:multiplayer
```

If a local container engine is available, also build the multiplayer image with
the command in `AGENTS.md`; otherwise record that limitation. After automated
verification, offer a host-mode review server so the responsive tabs and
puzzle-code sizing can be checked manually before merge or deployment.
