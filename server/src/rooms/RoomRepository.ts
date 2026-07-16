import type {RoomEvent, RoomSnapshot, UndoEntry} from "@sudoku/multiplayer-protocol";

export interface CreateRoomInput {
  id: string;
  snapshot: RoomSnapshot;
  now: Date;
}

export interface RoomMutationHelpers {
  getProcessedCommand(commandId: string): Promise<RoomEvent | null>;
  recordCommand(commandId: string, event: RoomEvent): Promise<void>;
  pushUndo(inverse: UndoEntry): Promise<void>;
  popUndo(): Promise<UndoEntry | null>;
  clearUndo(): Promise<void>;
}

export type RoomMutation = (
  room: RoomSnapshot,
  helpers: RoomMutationHelpers,
) => Promise<RoomSnapshot> | RoomSnapshot;

export interface RoomRepository {
  create(input: CreateRoomInput): Promise<RoomSnapshot>;
  getSnapshot(code: string, now: Date): Promise<RoomSnapshot | null>;
  mutate(code: string, now: Date, work: RoomMutation): Promise<RoomSnapshot | null>;
  recordDisconnectExpiry(code: string, expiresAt: Date): Promise<void>;
  deleteExpired(now: Date, activeRoomCodes: ReadonlySet<string>): Promise<number>;
  ping(): Promise<void>;
}
