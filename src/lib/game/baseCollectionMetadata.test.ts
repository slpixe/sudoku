import {afterEach, describe, expect, it, vi} from "vitest";

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
