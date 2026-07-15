import * as React from "react";
import {useTranslation} from "react-i18next";

import Button from "src/components/Button";

import {normalizeRoomCode, type SelectGameMode} from "./selectGameMode";

interface OnlineRoomControlsProps {
  creating: boolean;
  error?: string | null;
  mode: SelectGameMode;
  online: boolean;
  initialRoomCode?: string;
  onJoin: (roomCode: string) => void;
  onModeChange: (mode: SelectGameMode) => void;
}

interface ModeActionProps {
  disabled?: boolean;
  label: string;
  mode: SelectGameMode;
  selectedMode: SelectGameMode;
  onSelect: (mode: SelectGameMode) => void;
}

function ModeAction({disabled, label, mode, selectedMode, onSelect}: ModeActionProps) {
  const selected = mode === selectedMode;

  return (
    <button
      aria-pressed={selected}
      className={`min-h-20 rounded-lg border p-4 text-left shadow-sm transition-colors touch-manipulation focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-300 ${
        selected ? "border-teal-400 bg-teal-600 text-white" : "border-gray-500 bg-gray-700 text-white hover:bg-gray-600"
      } disabled:cursor-not-allowed disabled:opacity-50`}
      disabled={disabled}
      onClick={() => onSelect(mode)}
      type="button"
    >
      <span className="block text-base font-semibold">{label}</span>
    </button>
  );
}

export function OnlineRoomControls({
  creating,
  error,
  initialRoomCode = "",
  mode,
  online,
  onJoin,
  onModeChange,
}: OnlineRoomControlsProps) {
  const {t} = useTranslation();
  const [roomCode, setRoomCode] = React.useState(() => initialRoomCode.toUpperCase());
  const [invalidCode, setInvalidCode] = React.useState(false);
  const roomCodeInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    const finePointer = typeof window.matchMedia !== "function" || window.matchMedia("(pointer: fine)").matches;
    if (mode === "join-online" && finePointer) {
      roomCodeInputRef.current?.focus();
    }
  }, [mode]);

  const submitRoomCode = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = normalizeRoomCode(roomCode);
    if (!normalized) {
      setInvalidCode(true);
      return;
    }
    setInvalidCode(false);
    onJoin(normalized);
  };

  return (
    <section aria-label={t("select_game_mode")}>
      <div className="grid gap-3 sm:grid-cols-3">
        <ModeAction label={t("select_mode_solo")} mode="solo" selectedMode={mode} onSelect={onModeChange} />
        <ModeAction
          disabled={!online || creating}
          label={creating ? t("multiplayer_creating") : t("select_mode_create_online")}
          mode="create-online"
          selectedMode={mode}
          onSelect={onModeChange}
        />
        <ModeAction
          disabled={!online}
          label={t("select_mode_join_online")}
          mode="join-online"
          selectedMode={mode}
          onSelect={onModeChange}
        />
      </div>

      {!online ? <p className="mt-3 text-amber-200">{t("multiplayer_online_required")}</p> : null}

      {mode === "join-online" ? (
        <form
          className="mx-auto mt-6 flex max-w-sm flex-col items-center text-center"
          data-testid="join-room-form"
          onSubmit={submitRoomCode}
        >
          <h2 className="text-lg font-semibold text-white">{t("select_mode_join_online")}</h2>
          <p className="mt-1 text-sm text-gray-300">{t("multiplayer_join_description")}</p>
          <label className="mt-4 block text-sm font-medium text-white" htmlFor="multiplayer-room-code">
            {t("multiplayer_room_code")}
          </label>
          <input
            ref={roomCodeInputRef}
            aria-invalid={invalidCode}
            autoCapitalize="characters"
            autoComplete="off"
            className="mt-2 w-full max-w-xs rounded-sm border border-gray-400 bg-white px-3 py-2 text-center font-mono uppercase text-gray-900 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-300"
            disabled={!online || creating}
            id="multiplayer-room-code"
            maxLength={6}
            onChange={(event) => {
              setRoomCode(event.target.value.toUpperCase());
              setInvalidCode(false);
            }}
            placeholder="ABC234"
            value={roomCode}
          />
          <Button className="mt-3 bg-teal-600 text-white dark:bg-teal-600" disabled={!online || creating} type="submit">
            {t("multiplayer_join_room")}
          </Button>
          {invalidCode ? (
            <p className="mt-2 text-sm text-red-300" role="alert">
              {t("multiplayer_invalid_room_code")}
            </p>
          ) : null}
          {error ? (
            <p className="mt-3 text-sm text-red-300" role="alert">
              {error}
            </p>
          ) : null}
        </form>
      ) : null}

      {error && mode !== "join-online" ? (
        <p className="mt-3 text-sm text-red-300" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
