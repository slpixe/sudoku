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
