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
  copyMessage: string | null;
  error: RoomError | null;
  presence: 0 | 1 | 2;
  online: boolean;
  roomCode: string;
  status: MultiplayerRoomStatus;
  onCopyLink: () => void;
  onRetry: () => void;
}

export function MultiplayerStatus({
  copyMessage,
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
      aria-atomic="true"
      aria-live="polite"
      className="multiplayer-status mx-auto mt-3 grid gap-2 rounded-sm bg-gray-700/70 p-2 text-sm text-white"
      data-testid="multiplayer-status"
      role="status"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-mono font-bold" data-testid="multiplayer-room-code">
            {roomCode}
          </span>
          <span>{t("multiplayer_connected_count", {count: presence})}</span>
        </div>
        <Button className="min-h-9 bg-teal-700 text-white dark:bg-teal-600" onClick={onCopyLink}>
          {t("multiplayer_copy_link")}
        </Button>
      </div>
      {statusKey || error ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-sm bg-amber-950/70 px-3 py-2 text-amber-100">
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
      {copyMessage ? <p className="break-all text-emerald-200">{copyMessage}</p> : null}
    </section>
  );
}
