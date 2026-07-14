import * as React from "react";
import type {RoomAck, RoomErrorCode} from "@sudoku/multiplayer-protocol";
import {useNavigate} from "@tanstack/react-router";
import {useTranslation} from "react-i18next";

import GameSelect from "./Game/GameSelect";
import {Container} from "src/components/Layout";
import Button from "../components/Button";
import {DarkModeButton} from "src/components/DarkModeButton";
import {stringifySudoku} from "src/lib/engine/utility";
import {getSudokuCollection, getSudokusPaginated} from "src/lib/game/sudokus";
import {isBaseCollectionId} from "src/lib/game/baseCollections";

import {OnlineRoomControls} from "./Game/OnlineRoomControls";
import type {PuzzleSelection, SelectGameMode} from "./Game/selectGameMode";

function roomErrorKey(code: RoomErrorCode): string {
  switch (code) {
    case "ROOM_NOT_FOUND":
      return "multiplayer_room_invalid_or_expired";
    case "ROOM_EXPIRED":
      return "multiplayer_room_invalid_or_expired";
    case "ROOM_FULL":
      return "multiplayer_room_full";
    case "PUZZLE_VERSION_MISMATCH":
      return "multiplayer_puzzle_version_mismatch";
    default:
      return "multiplayer_service_unavailable";
  }
}

const SelectGame = () => {
  const navigate = useNavigate();
  const {t} = useTranslation();
  const [mode, setMode] = React.useState<SelectGameMode>("solo");
  const [online, setOnline] = React.useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  const [creating, setCreating] = React.useState(false);
  const creatingRef = React.useRef(false);
  const [onlineError, setOnlineError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => {
      setOnline(false);
      setMode("solo");
      setOnlineError(null);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const goBack = () => {
    navigate({
      to: "/",
    });
  };

  const selectMode = (nextMode: SelectGameMode) => {
    setMode(nextMode);
    setOnlineError(null);
  };

  const joinRoom = (roomCode: string) => {
    navigate({to: "/room/$code", params: {code: roomCode}});
  };

  const createOnlineRoom = async ({collectionId, puzzleNumber}: PuzzleSelection) => {
    if (creatingRef.current || !online || !isBaseCollectionId(collectionId)) {
      return;
    }

    creatingRef.current = true;
    setCreating(true);
    setOnlineError(null);

    try {
      const collection = getSudokuCollection(collectionId);
      const selectedPuzzle = getSudokusPaginated(collection, puzzleNumber - 1, 1).sudokus[0];
      if (!selectedPuzzle) {
        throw new Error("Selected puzzle is unavailable");
      }

      const [{createMultiplayerSocket}, {getOrCreateBrowserGuestId}] = await Promise.all([
        import("src/lib/multiplayer/createMultiplayerSocket"),
        import("src/lib/multiplayer/guestIdentity"),
      ]);
      const socket = createMultiplayerSocket();

      try {
        await new Promise<void>((resolve, reject) => {
          socket.once("connect", resolve);
          socket.once("connect_error", reject);
          socket.connect();
        });

        const acknowledgement = await new Promise<RoomAck>((resolve) => {
          socket.emit(
            "room:create",
            {
              collectionId,
              connectionId: crypto.randomUUID(),
              guestId: getOrCreateBrowserGuestId(),
              puzzleFingerprint: stringifySudoku(selectedPuzzle.sudoku),
              puzzleNumber,
            },
            resolve,
          );
        });

        if (!acknowledgement.ok) {
          setOnlineError(t(roomErrorKey(acknowledgement.error.code)));
          return;
        }

        navigate({to: "/room/$code", params: {code: acknowledgement.snapshot.roomCode}});
      } finally {
        socket.disconnect();
      }
    } catch {
      setOnlineError(t("multiplayer_service_unavailable"));
    } finally {
      creatingRef.current = false;
      setCreating(false);
    }
  };

  return (
    <Container className="mt-4">
      <div className="mb-8 flex flex-col gap-2">
        <div className="flex gap-4 items-center justify-between">
          <h1 className="text-2xl text-white">{t("select_game_title")}</h1>
          <div className="flex gap-2">
            <DarkModeButton />
            <Button
              className="bg-teal-600 dark:bg-teal-600 text-white flex-shrink-0"
              data-testid="select-game-back"
              onClick={goBack}
            >
              {"◀ " + t("go_back")}
            </Button>
          </div>
        </div>
        <p className="text-gray-300">{t("select_game_subtitle")}</p>
      </div>
      <OnlineRoomControls
        creating={creating}
        error={onlineError}
        mode={mode}
        online={online}
        onJoin={joinRoom}
        onModeChange={selectMode}
      />
      {mode !== "join-online" ? (
        <GameSelect
          baseCollectionsOnly={mode === "create-online"}
          selectionDisabled={creating}
          showProgress={mode === "solo"}
          onSelect={mode === "create-online" ? createOnlineRoom : undefined}
        />
      ) : null}
    </Container>
  );
};

export default SelectGame;
