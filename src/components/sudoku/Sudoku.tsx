import * as React from "react";
import {useTranslation} from "react-i18next";

import SudokuMenuCircle, {MenuWrapper, MenuContainer} from "./SudokuMenuCircle";
import {
  GridLineX,
  GridCell,
  GridLineY,
  GridCellNumber,
  CellNote,
  CellNoteContainer,
} from "src/components/sudoku/SudokuGrid";
import SudokuGame from "src/lib/game/SudokuGame";
import {Bounds} from "src/components/sudoku/types";
import {Cell, CellCoordinates} from "src/lib/engine/types";
import {useElementWidth} from "src/utils/hooks";
import {DerivedBoardData, getCellIndex} from "src/lib/game/deriveBoardData";

const SudokuGrid = React.memo(
  ({width, height, hideLeftRight = false}: {width: number; height: number; hideLeftRight?: boolean}) => {
    return (
      <div>
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => {
          const hide = [0, 9].includes(i);
          if (hideLeftRight && hide) {
            return null;
          }
          const makeBold = [3, 6].includes(i);
          return <GridLineX makeBold={makeBold} key={i} width={width} top={(i * height) / 9} />;
        })}
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => {
          const hide = [0, 9].includes(i);
          if (hideLeftRight && hide) {
            return null;
          }
          const makeBold = [3, 6].includes(i);
          return <GridLineY makeBold={makeBold} key={i} height={height} left={(i * height) / 9} />;
        })}
      </div>
    );
  },
);

const SudokuCell = React.memo(
  ({
    number,
    active,
    partnerActive,
    partnerSelectedLabel,
    highlight,
    bounds,
    onClick,
    onRightClick,
    left,
    top,
    initial,
    notes,
    notesMode,
    conflict,
    highlightNumber,
    x,
    y,
  }: {
    number: number;
    active: boolean;
    partnerActive: boolean;
    partnerSelectedLabel: string;
    highlightNumber: boolean;
    highlight: boolean;
    conflict: boolean;
    bounds: Bounds;
    onClick: () => void;
    onRightClick: () => void;
    top: number;
    left: number;
    initial: boolean;
    notes: number[];
    notesMode: boolean;
    x: number;
    y: number;
  }) => {
    const row = y + 1;
    const column = x + 1;

    return (
      <div>
        <GridCell
          ariaLabel={`${initial ? "Given" : "Editable"} cell row ${row} column ${column}${
            number === 0 ? " empty" : ` value ${number}`
          }${partnerActive ? `, ${partnerSelectedLabel}` : ""}`}
          notesMode={notesMode}
          active={active}
          partnerActive={partnerActive}
          conflict={conflict}
          highlight={highlight}
          highlightNumber={highlightNumber}
          bounds={bounds}
          initial={initial}
          number={number}
          onClick={onClick}
          onRightClick={onRightClick}
          testId={`sudoku-cell-${x}-${y}`}
        />
        <GridCellNumber
          left={left}
          top={top}
          initial={initial}
          highlight={highlightNumber}
          conflict={conflict}
          testId={`sudoku-cell-value-${x}-${y}`}
        >
          {number !== 0 ? number : ""}
        </GridCellNumber>
        <CellNoteContainer initial={initial} bounds={bounds} testId={`sudoku-cell-notes-${x}-${y}`}>
          {initial || number
            ? null
            : notes.map((n) => {
                const notePosition = SudokuGame.getNotePosition(n);
                return (
                  <CellNote key={n} left={notePosition.x} top={notePosition.y}>
                    {n !== 0 ? n : ""}
                  </CellNote>
                );
              })}
        </CellNoteContainer>
      </div>
    );
  },
);

interface SudokuProps {
  boardData: DerivedBoardData;
  partnerCellCoordinates?: CellCoordinates;
  sudoku: Cell[];
  showHints: boolean;
  showWrongEntries: boolean;
  showConflicts: boolean;
  showMatchingNumbers: boolean;
  shouldShowMenu: boolean;
  notesMode: boolean;
  showMenu: (showNotes?: boolean) => void;
  hideMenu: () => void;
  selectCell: (cellCoordinates: CellCoordinates) => void;
  setNumber: (cell: Cell, number: number) => void;
  setNotes: (cell: Cell, notes: number[]) => void;
  clearNumber: (cell: Cell) => void;
  children: React.ReactNode;
}

export const Sudoku: React.FC<SudokuProps> = ({
  sudoku,
  showHints,
  boardData,
  partnerCellCoordinates,
  hideMenu,
  showMenu,
  selectCell,
  setNumber,
  setNotes,
  clearNumber,
  children,
  showConflicts,
  showMatchingNumbers,
  showWrongEntries,
  notesMode,
  shouldShowMenu,
}) => {
  const {t} = useTranslation();
  const height = 100;
  const width = 100;
  const partnerSelectedLabel = t("sudoku_other_player_selected");

  const xSection = height / 9;
  const ySection = width / 9;

  const activeCell = boardData.activeCell;
  const selectionPosition = {
    x: (activeCell && activeCell.x) || 0,
    y: (activeCell && activeCell.y) || 0,
  };

  const positionedCells = SudokuGame.positionedCells(sudoku, width, height);

  const sudokuContainerRef = React.useRef(null);
  const containerWidth = useElementWidth(sudokuContainerRef);

  React.useEffect(() => {
    const handleClick = () => {
      if (activeCell !== null) {
        hideMenu();
      }
    };

    window.addEventListener("click", handleClick);
    return () => window.removeEventListener("click", handleClick);
  }, [activeCell, hideMenu]);

  return (
    <div
      className="sudoku-board-surface relative"
      data-testid="sudoku-board"
      ref={sudokuContainerRef}
      style={{height: containerWidth}}
    >
      {children}
      <div className="absolute h-full w-full rounded-sm">
        <SudokuGrid width={width} height={height} hideLeftRight />
        {sudoku.map((c, i) => {
          const onClick = () => {
            selectCell(c);
            if (!c.initial) {
              showMenu();
            }
          };
          const onRightClick = () => {
            selectCell(c);
            if (!c.initial) {
              showMenu(true);
            }
          };
          const position = positionedCells[i];
          const cellIndex = getCellIndex(c);

          const notes = showHints && c.notes.length === 0 ? boardData.notePossibilities[i] : c.notes;

          const inConflictPath = showConflicts && boardData.pathCellIndexes.has(cellIndex);

          const bounds: Bounds = {
            width: xSection,
            height: ySection,
            left: xSection * c.x,
            top: ySection * c.y,
          };

          const isActive = activeCell ? c.x === activeCell.x && c.y === activeCell.y : false;
          const isPartnerActive = partnerCellCoordinates?.x === c.x && partnerCellCoordinates?.y === c.y;
          const highlight = boardData.friendCellIndexes.has(cellIndex);
          const isWrong = showWrongEntries && (c.number === 0 ? false : c.solution !== c.number);
          const highlightNumber =
            showMatchingNumbers && activeCell && c.number !== 0 ? activeCell.number === c.number : false;

          return (
            <SudokuCell
              key={i}
              active={isActive}
              partnerActive={isPartnerActive}
              partnerSelectedLabel={partnerSelectedLabel}
              highlight={highlight}
              highlightNumber={highlightNumber && !isActive}
              conflict={inConflictPath || isWrong}
              bounds={bounds}
              onClick={onClick}
              onRightClick={onRightClick}
              left={position.x}
              top={position.y}
              notes={notes}
              number={c.number}
              initial={c.initial}
              notesMode={notesMode}
              x={c.x}
              y={c.y}
            />
          );
        })}
        {activeCell && shouldShowMenu ? (
          <MenuContainer
            bounds={{
              top: ySection * selectionPosition.y,
              left: xSection * selectionPosition.x,
              height: ySection,
              width: xSection,
            }}
          >
            <MenuWrapper>
              <SudokuMenuCircle
                cell={activeCell}
                notesMode={notesMode}
                showHints={showHints}
                setNumber={setNumber}
                setNotes={setNotes}
                clearNumber={clearNumber}
                notePossibilities={boardData.notePossibilities[getCellIndex(activeCell)] ?? []}
                showMenu={showMenu}
              />
            </MenuWrapper>
          </MenuContainer>
        ) : null}
      </div>
    </div>
  );
};
