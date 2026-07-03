import * as React from "react";
import Button from "../Button";
import clsx from "clsx";
import {CellCoordinates} from "src/lib/engine/types";
import {useTranslation} from "react-i18next";

const controlButtonClass =
  "flex min-h-11 min-w-0 items-center justify-center px-1 text-[0.65rem] sm:min-h-12 sm:px-2 sm:text-xs md:px-3 md:text-sm";
const toggleStatusClass = "rounded-full px-2 text-[0.625rem] font-bold leading-3 sm:text-xs sm:leading-4";

export const UndoButton: React.FC<{
  canUndo: boolean;
  disabled?: boolean;
  undo: () => void;
}> = ({canUndo, disabled = false, undo}) => {
  const {t} = useTranslation();
  return (
    <Button disabled={disabled || !canUndo} onClick={undo} className={controlButtonClass}>
      {t("undo_btn")}
    </Button>
  );
};

export const EraseButton: React.FC<{
  activeCellCoordinates: CellCoordinates | undefined;
  disabled?: boolean;
  clearCell: (cellCoordinates: CellCoordinates) => void;
}> = ({activeCellCoordinates, disabled = false, clearCell}) => {
  const {t} = useTranslation();
  return (
    <Button
      disabled={disabled}
      className={controlButtonClass}
      onClick={() => activeCellCoordinates && clearCell(activeCellCoordinates)}
    >
      {t("erase_btn")}
    </Button>
  );
};

const NotesButton: React.FC<{
  notesMode: boolean;
  disabled?: boolean;
  activateNotesMode: () => void;
  deactivateNotesMode: () => void;
}> = ({notesMode, disabled = false, activateNotesMode, deactivateNotesMode}) => {
  const {t} = useTranslation();
  return (
    <Button
      disabled={disabled}
      onClick={() => (notesMode ? deactivateNotesMode() : activateNotesMode())}
      className={`${controlButtonClass} flex-col gap-0.5 py-1 md:py-1`}
    >
      <div className="leading-4">{t("note_btn")}</div>
      <div
        className={clsx("rounded-full px-2 text-[0.625rem] font-bold leading-3 sm:text-xs sm:leading-4", {
          "bg-teal-700 text-white": !notesMode,
          "bg-sky-700 text-white": notesMode,
        })}
      >{`${notesMode ? "ON" : "OFF"}`}</div>
    </Button>
  );
};

const HintButton: React.FC<{
  activeCellCoordinates: CellCoordinates | undefined;
  disabled?: boolean;
  getHint: (cellCoordinates: CellCoordinates) => void;
}> = ({activeCellCoordinates, disabled = false, getHint}) => {
  const {t} = useTranslation();
  return (
    <Button
      disabled={disabled || !activeCellCoordinates}
      className={`${controlButtonClass} flex-col gap-0.5 py-1 md:py-1`}
      onClick={() => activeCellCoordinates && getHint(activeCellCoordinates)}
    >
      <div className="leading-4">{t("hint_btn")}</div>
      <div className="text-[0.625rem] font-bold leading-3 opacity-75 sm:text-xs sm:leading-4">
        {t("hint_btn_target")}
      </div>
    </Button>
  );
};

const PreferenceToggleButton: React.FC<{
  label: string;
  pressed: boolean;
  disabled?: boolean;
  testId: string;
  toggle: () => void;
}> = ({label, pressed, disabled = false, testId, toggle}) => {
  return (
    <Button
      aria-pressed={pressed}
      className={clsx(`${controlButtonClass} flex-col gap-0.5 py-1 md:py-1`, {
        "bg-sky-700 text-white dark:bg-sky-700": pressed,
      })}
      data-testid={testId}
      disabled={disabled}
      onClick={toggle}
    >
      <div className="leading-4">{label}</div>
      <div
        className={clsx(toggleStatusClass, {
          "bg-white/20 text-white": pressed,
          "bg-teal-700 text-white": !pressed,
        })}
      >{`${pressed ? "ON" : "OFF"}`}</div>
    </Button>
  );
};

const SudokuMenuControls: React.FC<{
  notesMode: boolean;
  activeCellCoordinates: CellCoordinates | undefined;
  disabled?: boolean;
  showConflicts: boolean;
  showOccurrences: boolean;
  clearCell: (cellCoordinates: CellCoordinates) => void;
  activateNotesMode: () => void;
  deactivateNotesMode: () => void;
  toggleShowConflicts: () => void;
  toggleShowOccurrences: () => void;
  getHint: (cellCoordinates: CellCoordinates) => void;
  canUndo: boolean;
  undo: () => void;
}> = ({
  notesMode,
  activeCellCoordinates,
  disabled = false,
  showConflicts,
  showOccurrences,
  clearCell,
  activateNotesMode,
  deactivateNotesMode,
  toggleShowConflicts,
  toggleShowOccurrences,
  getHint,
  canUndo,
  undo,
}) => {
  const {t} = useTranslation();

  return (
    <div className="grid w-full grid-cols-6 gap-1 sm:gap-2">
      <UndoButton canUndo={canUndo} disabled={disabled} undo={undo} />
      <EraseButton
        activeCellCoordinates={activeCellCoordinates}
        disabled={disabled || !activeCellCoordinates}
        clearCell={clearCell}
      />
      <NotesButton
        notesMode={notesMode}
        disabled={disabled}
        activateNotesMode={activateNotesMode}
        deactivateNotesMode={deactivateNotesMode}
      />
      <HintButton activeCellCoordinates={activeCellCoordinates} disabled={disabled} getHint={getHint} />
      <PreferenceToggleButton
        label={t("conflicts_btn")}
        pressed={showConflicts}
        disabled={disabled}
        testId="sudoku-toggle-conflicts"
        toggle={toggleShowConflicts}
      />
      <PreferenceToggleButton
        label={t("counts_btn")}
        pressed={showOccurrences}
        disabled={disabled}
        testId="sudoku-toggle-occurrences"
        toggle={toggleShowOccurrences}
      />
    </div>
  );
};

export default SudokuMenuControls;
