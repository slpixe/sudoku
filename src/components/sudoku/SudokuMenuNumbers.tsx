import * as React from "react";
import {SUDOKU_NUMBERS} from "src/lib/engine/utility";
import {CellCoordinates} from "src/lib/engine/types";
import Button from "src/components/Button";
import clsx from "clsx";
import {DerivedBoardData, getCellIndex} from "src/lib/game/deriveBoardData";

export interface SudokuMenuNumbersProps {
  notesMode: boolean;
  activeCell?: CellCoordinates;
  boardData: DerivedBoardData;
  disabled?: boolean;
  showOccurrences: boolean;
  showHints: boolean;
  layout?: "side" | "row";
  onNoteInput?: () => void;
  setNumber: (cellCoordinates: CellCoordinates, number: number) => void;
  setNotes: (cellCoordinates: CellCoordinates, notes: number[]) => void;
}

function isTouchLikePointer(event: React.PointerEvent<HTMLButtonElement>) {
  return event.pointerType === "touch" || event.pointerType === "pen";
}

const SudokuMenuNumbers: React.FC<SudokuMenuNumbersProps> = ({
  notesMode,
  activeCell,
  boardData,
  disabled = false,
  showOccurrences,
  showHints,
  layout = "side",
  onNoteInput,
  setNumber,
  setNotes,
}) => {
  const activeCellIndex = activeCell ? getCellIndex(activeCell) : undefined;
  const activeCellData = boardData.activeCell;
  const userNotes = activeCellData?.notes ?? [];
  const autoNotes = activeCellIndex !== undefined && showHints ? boardData.notePossibilities[activeCellIndex] ?? [] : [];
  const touchPointerHandledRef = React.useRef<{number: number; handledAt: number} | undefined>(undefined);

  return (
    <div
      className={clsx("grid w-full grid-cols-9 justify-center overflow-hidden", {
        "gap-1 sm:gap-2": layout === "row",
        "gap-2 md:grid-cols-3": layout === "side",
      })}
    >
      {SUDOKU_NUMBERS.map((n) => {
        const occurrences = boardData.occurrences[n];
        const completed = occurrences === 9;

        const setNumberOrNote = () => {
          if (!activeCell) {
            return false;
          }

          if (notesMode) {
            const startingNotes = userNotes.length === 0 && autoNotes.length > 0 ? autoNotes : userNotes;

            const newNotes = startingNotes.includes(n) ? startingNotes.filter((note) => note !== n) : [...userNotes, n];
            setNotes(activeCell, newNotes);
            onNoteInput?.();
          } else {
            setNumber(activeCell, n);
          }
          return true;
        };

        const shouldSuppressClick = () => {
          const handled = touchPointerHandledRef.current;
          if (!handled || handled.number !== n) {
            return false;
          }

          if (Date.now() - handled.handledAt > 750) {
            touchPointerHandledRef.current = undefined;
            return false;
          }

          touchPointerHandledRef.current = undefined;
          return true;
        };

        return (
          <Button
            aria-label={`Set ${n}`}
            className={clsx("relative flex touch-none select-none items-center justify-center font-bold", {
              "aspect-square p-0 text-base sm:text-lg md:text-xl": layout === "row",
              "bg-red-400 dark:bg-red-400": showOccurrences && occurrences > 9,
              "bg-emerald-600 text-white dark:bg-emerald-500":
                notesMode && userNotes.includes(n) && activeCellData?.number === 0,
              "bg-sky-300 dark:bg-sky-300":
                notesMode &&
                userNotes.length === 0 &&
                autoNotes.includes(n) &&
                !userNotes.includes(n) &&
                activeCellData?.number === 0,
              "bg-gray-300 text-gray-600 opacity-70 grayscale dark:bg-gray-700 dark:text-gray-300": completed,
            })}
            data-testid={`sudoku-number-${n}`}
            disabled={disabled}
            onClick={() => {
              if (shouldSuppressClick()) {
                return;
              }
              setNumberOrNote();
            }}
            onPointerUp={(event) => {
              if (!isTouchLikePointer(event) || event.isPrimary || !notesMode) {
                return;
              }

              event.preventDefault();
              if (setNumberOrNote()) {
                touchPointerHandledRef.current = {number: n, handledAt: Date.now()};
              }
            }}
            key={n}
          >
            <span
              className="sudoku-number-label pointer-events-none relative z-10 inline-flex items-center justify-center leading-none"
              data-testid={`sudoku-number-label-${n}`}
            >
              {n}
            </span>
            {showOccurrences && (
              <div
                className="absolute right-0 bottom-0 flex h-4 w-4 items-center justify-center rounded-tl-md rounded-br-sm bg-teal-700 text-[0.625rem] leading-none text-white opacity-85 sm:right-1 sm:bottom-1 sm:h-4 sm:w-4 sm:rounded-full sm:text-xs"
                data-testid={`sudoku-number-occurrences-${n}`}
              >
                {occurrences}
              </div>
            )}
          </Button>
        );
      })}
    </div>
  );
};

export default SudokuMenuNumbers;
