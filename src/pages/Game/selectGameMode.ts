export type SelectGameMode = "solo" | "create-online" | "join-online";

export interface PuzzleSelection {
  collectionId: string;
  puzzleNumber: number;
}

const ROOM_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/;

export function normalizeRoomCode(value: string): string | null {
  const normalized = value.trim().toUpperCase();
  return ROOM_CODE_PATTERN.test(normalized) ? normalized : null;
}
