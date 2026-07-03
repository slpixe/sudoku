import {translateCollectionName} from "src/lib/database/collections";
import {isBaseCollectionId} from "src/lib/game/baseCollections";
import {appPersistence} from "src/lib/persistence/appPersistence";

export function getSudokuCollectionDisplayName(collectionId: string) {
  if (isBaseCollectionId(collectionId)) {
    return translateCollectionName(collectionId);
  }

  try {
    const collection = appPersistence.collections.loadIndex().find((item) => item.id === collectionId);
    return translateCollectionName(collection?.name ?? collectionId);
  } catch (error) {
    console.error("Error loading sudoku collection:", error);
    return translateCollectionName(collectionId);
  }
}
