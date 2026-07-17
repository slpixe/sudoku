import type {RoomError} from "@sudoku/multiplayer-protocol";
import * as React from "react";
import {useTranslation} from "react-i18next";

import Button from "src/components/Button";
import type {MultiplayerRoomStatus} from "src/lib/multiplayer/useMultiplayerRoom";

function multiplayerErrorKey(error: RoomError): string {
  switch (error.code) {
    case "ROOM_NOT_FOUND":
    case "ROOM_EXPIRED":
      return "multiplayer_room_invalid_or_expired";
    case "ROOM_FULL":
      return "multiplayer_room_full";
    case "VERSION_MISMATCH":
      return "multiplayer_version_mismatch";
    default:
      return "multiplayer_service_unavailable";
  }
}

function connectionStatusKey(status: MultiplayerRoomStatus): string | null {
  switch (status) {
    case "connecting":
      return "multiplayer_connecting";
    case "reconnecting":
    case "resyncing":
      return "multiplayer_reconnecting";
    case "disconnected":
      return "multiplayer_disconnected";
    case "connected":
      return null;
  }
}

export interface MultiplayerStatusProps {
  copyState: CopyState;
  error: RoomError | null;
  presence: 0 | 1 | 2;
  online: boolean;
  roomCode: string;
  status: MultiplayerRoomStatus;
  onCopyLink: () => void;
  onRetry: () => void;
}

export type CopyState = "idle" | "copied" | "failed";

export function MultiplayerStatus({
  copyState,
  error,
  presence,
  online,
  roomCode,
  status,
  onCopyLink,
  onRetry,
}: MultiplayerStatusProps) {
  const {t} = useTranslation();
  const statusKey = online ? connectionStatusKey(status) : "multiplayer_online_required";
  const retryable = online && (status !== "connected" || error !== null);

  return (
    <section
      className="multiplayer-status mx-auto grid gap-2 rounded-sm bg-gray-700/70 p-1 text-sm text-white"
      data-testid="multiplayer-status"
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2" data-testid="multiplayer-primary-row">
        <span>{t("multiplayer_room_label")}</span>
        <span className="font-mono font-bold" data-testid="multiplayer-room-code">
          {roomCode}
        </span>
        <span
          aria-hidden="true"
          className={`h-2 w-2 rounded-full ${online && status === "connected" && error === null ? "bg-emerald-400" : "bg-amber-400"}`}
          data-testid="multiplayer-presence-dot"
        />
        <span
          aria-atomic="true"
          aria-label={t("multiplayer_connected_count", {count: presence})}
          aria-live="polite"
          role="status"
        >
          {t("multiplayer_presence_fraction", {count: presence})}
        </span>
        <Button
          aria-label={t("multiplayer_copy_link")}
          className="ml-auto min-h-5 bg-teal-700 text-white dark:bg-teal-600"
          data-testid="multiplayer-copy-button"
          onClick={onCopyLink}
        >
          {copyState === "copied"
            ? `${t("multiplayer_copied")} ✓`
            : copyState === "failed"
              ? t("multiplayer_copy_failed")
              : t("multiplayer_copy")}
        </Button>
      </div>
      {statusKey || error ? (
        <div
          aria-atomic="true"
          aria-live="polite"
          className="flex flex-wrap items-center justify-between gap-2 rounded-sm bg-amber-950/70 px-3 py-2 text-amber-100"
          role="status"
        >
          <span>{!online ? t(statusKey!) : error ? t(multiplayerErrorKey(error)) : t(statusKey!)}</span>
          {retryable ? (
            <Button
              aria-label={t("multiplayer_retry")}
              className="min-h-9 bg-white text-gray-900 dark:bg-gray-200 dark:text-gray-900"
              onClick={onRetry}
            >
              {t("multiplayer_retry")}
            </Button>
          ) : null}
        </div>
      ) : null}
      <span aria-live="polite" className="sr-only" data-testid="multiplayer-copy-announcement">
        {copyState === "copied"
          ? t("multiplayer_link_copied")
          : copyState === "failed"
            ? t("multiplayer_copy_failed")
            : ""}
      </span>
    </section>
  );
}
