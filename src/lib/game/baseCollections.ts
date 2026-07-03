import {BaseCollection} from "src/lib/database/collections";

export const BASE_COLLECTION_IDS = Object.values(BaseCollection);
export const START_SUDOKU_INDEX = 0;
export const START_SUDOKU_COLLECTION = {id: BaseCollection.Easy, name: BaseCollection.Easy};

export function isBaseCollectionId(collectionId: string): collectionId is BaseCollection {
  return BASE_COLLECTION_IDS.includes(collectionId as BaseCollection);
}
