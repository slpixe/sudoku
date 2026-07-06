import * as React from "react";
import Button from "../Button";
import clsx from "clsx";
import {CellCoordinates} from "src/lib/engine/types";
import {useTranslation} from "react-i18next";

const controlButtonClass =
  "flex min-h-11 min-w-0 items-center justify-center px-1 text-[0.65rem] sm:min-h-12 sm:px-2 sm:text-xs md:px-3 md:text-sm";
const toggleStatusClass = "rounded-full px-2 text-[0.625rem] font-bold leading-3 sm:text-xs sm:leading-4";
const toggleStatusOnClass = "bg-teal-700 text-white dark:bg-teal-600";
const toggleStatusOffClass = "bg-gray-700 text-white dark:bg-gray-600";

function isHoldPointer(event: React.PointerEvent<HTMLButtonElement>) {
  return event.pointerType === "touch" || event.pointerType === "pen";
}

export const UndoButton: React.FC<{
  canUndo: boolean;
  className?: string;
  disabled?: boolean;
  testId?: string;
  undo: () => void;
}> = ({canUndo, className, disabled = false, testId = "sudoku-control-undo", undo}) => {
  const {t} = useTranslation();
  return (
    <Button
      className={clsx(controlButtonClass, className)}
      data-testid={testId}
      disabled={disabled || !canUndo}
      onClick={undo}
    >
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
      data-testid="sudoku-control-erase"
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
  persistentNotesMode?: boolean;
  disabled?: boolean;
  activateNotesMode: () => void;
  deactivateNotesMode: () => void;
  onNoteHoldStart?: () => void;
  onNoteHoldEnd?: () => void;
  shouldSuppressToggleClick?: () => boolean;
}> = ({
  notesMode,
  persistentNotesMode = notesMode,
  disabled = false,
  activateNotesMode,
  deactivateNotesMode,
  onNoteHoldStart,
  onNoteHoldEnd,
  shouldSuppressToggleClick,
}) => {
  const {t} = useTranslation();
  return (
    <Button
      data-testid="sudoku-control-notes"
      disabled={disabled}
      onClick={() => {
        if (shouldSuppressToggleClick?.()) {
          return;
        }
        if (persistentNotesMode) {
          deactivateNotesMode();
        } else {
          activateNotesMode();
        }
      }}
      onPointerCancel={(event) => {
        if (isHoldPointer(event)) {
          onNoteHoldEnd?.();
        }
      }}
      onPointerDown={(event) => {
        if (isHoldPointer(event)) {
          onNoteHoldStart?.();
        }
      }}
      onPointerLeave={(event) => {
        if (isHoldPointer(event)) {
          onNoteHoldEnd?.();
        }
      }}
      onPointerUp={(event) => {
        if (isHoldPointer(event)) {
          onNoteHoldEnd?.();
        }
      }}
      className={`${controlButtonClass} flex-col gap-0.5 py-1 md:py-1`}
    >
      <div className="flex items-center justify-center gap-1 leading-4">
        <span>{t("note_btn")}</span>
        <span
          aria-hidden="true"
          className="sudoku-notes-key-hints hidden items-center gap-0.5 text-[0.55rem] font-bold leading-none opacity-80 sm:inline-flex"
          data-testid="sudoku-control-notes-key-hints"
        >
          <span className="rounded-sm bg-gray-200 px-1 py-0.5 text-gray-800 dark:bg-gray-700 dark:text-gray-100">
            N
          </span>
          <span className="rounded-sm bg-gray-200 px-1 py-0.5 text-gray-800 dark:bg-gray-700 dark:text-gray-100">
            ^
          </span>
        </span>
      </div>
      <div
        className={clsx(toggleStatusClass, {
          [toggleStatusOffClass]: !notesMode,
          [toggleStatusOnClass]: notesMode,
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
      data-testid="sudoku-control-hint"
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
      className={`${controlButtonClass} flex-col gap-0.5 py-1 md:py-1`}
      data-testid={testId}
      disabled={disabled}
      onClick={toggle}
    >
      <div className="leading-4">{label}</div>
      <div
        className={clsx(toggleStatusClass, {
          [toggleStatusOnClass]: pressed,
          [toggleStatusOffClass]: !pressed,
        })}
      >{`${pressed ? "ON" : "OFF"}`}</div>
    </Button>
  );
};

const SudokuMenuControls: React.FC<{
  notesMode: boolean;
  persistentNotesMode?: boolean;
  activeCellCoordinates: CellCoordinates | undefined;
  disabled?: boolean;
  showConflicts: boolean;
  showOccurrences: boolean;
  showMatchingNumbers: boolean;
  clearCell: (cellCoordinates: CellCoordinates) => void;
  activateNotesMode: () => void;
  deactivateNotesMode: () => void;
  onNoteHoldStart?: () => void;
  onNoteHoldEnd?: () => void;
  shouldSuppressToggleClick?: () => boolean;
  toggleShowConflicts: () => void;
  toggleShowOccurrences: () => void;
  toggleShowMatchingNumbers: () => void;
  getHint: (cellCoordinates: CellCoordinates) => void;
  canUndo: boolean;
  undo: () => void;
}> = ({
  notesMode,
  persistentNotesMode,
  activeCellCoordinates,
  disabled = false,
  showConflicts,
  showOccurrences,
  showMatchingNumbers,
  clearCell,
  activateNotesMode,
  deactivateNotesMode,
  onNoteHoldStart,
  onNoteHoldEnd,
  shouldSuppressToggleClick,
  toggleShowConflicts,
  toggleShowOccurrences,
  toggleShowMatchingNumbers,
  getHint,
  canUndo,
  undo,
}) => {
  const {t} = useTranslation();

  return (
    <div className="grid w-full grid-cols-7 gap-1 sm:gap-2">
      <UndoButton canUndo={canUndo} className="sudoku-bottom-undo" disabled={disabled} undo={undo} />
      <EraseButton
        activeCellCoordinates={activeCellCoordinates}
        disabled={disabled || !activeCellCoordinates}
        clearCell={clearCell}
      />
      <NotesButton
        notesMode={notesMode}
        persistentNotesMode={persistentNotesMode}
        disabled={disabled}
        activateNotesMode={activateNotesMode}
        deactivateNotesMode={deactivateNotesMode}
        onNoteHoldStart={onNoteHoldStart}
        onNoteHoldEnd={onNoteHoldEnd}
        shouldSuppressToggleClick={shouldSuppressToggleClick}
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
      <PreferenceToggleButton
        label={t("matching_btn")}
        pressed={showMatchingNumbers}
        disabled={disabled}
        testId="sudoku-toggle-matching-numbers"
        toggle={toggleShowMatchingNumbers}
      />
    </div>
  );
};

export default SudokuMenuControls;
