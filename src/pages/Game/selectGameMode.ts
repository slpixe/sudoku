export type SelectGameMode = "solo" | "create-online" | "join-online";

export interface PuzzleSelection {
  collectionId: string;
  puzzleNumber: number;
}

export interface SelectGameJoinState {
  roomCode: string;
  roomError: string | null;
}

const ROOM_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/;

export function normalizeRoomCode(value: string): string | null {
  const normalized = value.trim().toUpperCase();
  return ROOM_CODE_PATTERN.test(normalized) ? normalized : null;
}

function stripWrappingQuotes(value: string): string {
  return value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value;
}

export function readSelectGameJoinState(hash: string): SelectGameJoinState | null {
  const query = hash.split("?", 2)[1];
  if (!query) {
    return null;
  }
  const search = new URLSearchParams(query);
  const rawRoomCode = search.get("roomCode");
  const rawRoomError = search.get("roomError");
  if (rawRoomCode === null && rawRoomError === null) {
    return null;
  }
  return {
    roomCode: rawRoomCode === null ? "" : stripWrappingQuotes(rawRoomCode),
    roomError: rawRoomError === null ? null : stripWrappingQuotes(rawRoomError),
  };
}
