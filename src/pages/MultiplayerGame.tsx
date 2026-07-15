import * as React from "react";
import type {RoomErrorCode} from "@sudoku/multiplayer-protocol";
import {useNavigate, useParams} from "@tanstack/react-router";
import {useTranslation} from "react-i18next";

import {Container} from "src/components/Layout";
import {UserPreferencesProvider} from "src/context/UserPrefencesContext";
import {useMultiplayerRoom} from "src/lib/multiplayer/useMultiplayerRoom";

import {MultiplayerGameController} from "./Game/MultiplayerGameController";
import {normalizeRoomCode} from "./Game/selectGameMode";

const RETURN_TO_JOIN_ERRORS = new Set<RoomErrorCode>(["ROOM_NOT_FOUND", "ROOM_EXPIRED", "ROOM_FULL"]);

function MultiplayerRoomSession({
  roomCode,
  onNewGame,
  onRetry,
}: {
  roomCode: string;
  onNewGame: () => void;
  onRetry: () => void;
}) {
  const navigate = useNavigate();
  const room = useMultiplayerRoom(roomCode);
  const errorCode = room.error?.code;

  React.useEffect(() => {
    if (!errorCode || !RETURN_TO_JOIN_ERRORS.has(errorCode)) {
      return;
    }
    void navigate({
      to: "/select-game",
      search: {roomCode, roomError: errorCode},
      replace: true,
    });
  }, [errorCode, navigate, roomCode]);

  return <MultiplayerGameController room={room} roomCode={roomCode} onNewGame={onNewGame} onRetry={onRetry} />;
}

export default function MultiplayerGame() {
  const navigate = useNavigate();
  const params = useParams({strict: false}) as {code?: string};
  const {t} = useTranslation();
  const attemptedCode = typeof params.code === "string" ? params.code : "";
  const roomCode = normalizeRoomCode(attemptedCode);
  const [retryKey, setRetryKey] = React.useState(0);

  React.useEffect(() => {
    if (roomCode) {
      return;
    }
    void navigate({
      to: "/select-game",
      search: {roomCode: attemptedCode.trim().toUpperCase(), roomError: "INVALID_REQUEST"},
      replace: true,
    });
  }, [attemptedCode, navigate, roomCode]);

  const chooseNewGame = React.useCallback(() => {
    void navigate({to: "/select-game"});
  }, [navigate]);

  if (!roomCode) {
    return (
      <Container className="flex min-h-screen items-center justify-center text-white">
        <p>{t("multiplayer_invalid_room_code")}</p>
      </Container>
    );
  }

  return (
    <UserPreferencesProvider>
      <MultiplayerRoomSession
        key={`${roomCode}:${retryKey}`}
        roomCode={roomCode}
        onNewGame={chooseNewGame}
        onRetry={() => setRetryKey((current) => current + 1)}
      />
    </UserPreferencesProvider>
  );
}
