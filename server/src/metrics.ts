import type {RoomErrorCode} from "@sudoku/multiplayer-protocol";

export interface CommandMetricsSnapshot {
  averageLatencyMs: number;
  count: number;
  totalLatencyMs: number;
}

export interface RejectionMetricsSnapshot {
  byCode: Partial<Record<RoomErrorCode, number>>;
  total: number;
}

export interface OperationalMetricsSnapshot {
  activeRooms: number;
  commands: CommandMetricsSnapshot;
  connectedSockets: number;
  databaseErrors: number;
  reconnects: number;
  rejections: RejectionMetricsSnapshot;
}

export interface MetricsRecorder {
  recordCommand(latencyMs: number): void;
  recordDatabaseError(): void;
  recordReconnect(): void;
  recordRejection(code: RoomErrorCode): void;
}

export class MultiplayerMetrics implements MetricsRecorder {
  readonly #rejections = new Map<RoomErrorCode, number>();
  #commandCount = 0;
  #commandLatencyMs = 0;
  #databaseErrors = 0;
  #reconnects = 0;

  recordCommand(latencyMs: number): void {
    this.#commandCount += 1;
    this.#commandLatencyMs += Number.isFinite(latencyMs) ? Math.max(0, latencyMs) : 0;
  }

  recordDatabaseError(): void {
    this.#databaseErrors += 1;
  }

  recordReconnect(): void {
    this.#reconnects += 1;
  }

  recordRejection(code: RoomErrorCode): void {
    this.#rejections.set(code, (this.#rejections.get(code) ?? 0) + 1);
  }

  snapshot(connectedSockets: number, activeRooms: number): OperationalMetricsSnapshot {
    const rejectionCounts = Object.fromEntries(this.#rejections) as Partial<Record<RoomErrorCode, number>>;
    const rejectionTotal = [...this.#rejections.values()].reduce((total, count) => total + count, 0);
    return {
      activeRooms,
      commands: {
        averageLatencyMs: this.#commandCount === 0 ? 0 : this.#commandLatencyMs / this.#commandCount,
        count: this.#commandCount,
        totalLatencyMs: this.#commandLatencyMs,
      },
      connectedSockets,
      databaseErrors: this.#databaseErrors,
      reconnects: this.#reconnects,
      rejections: {byCode: rejectionCounts, total: rejectionTotal},
    };
  }
}
