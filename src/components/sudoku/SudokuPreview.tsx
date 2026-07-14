import React from "react";
import {SimpleSudoku} from "src/lib/engine/types";

const GridLineX = ({top, width, makeBold}: {top: number; width: number; makeBold: boolean}) => (
  <div
    className={`absolute left-0 h-px transform -translate-y-1/2 ${makeBold ? "bg-gray-400 dark:bg-gray-400" : "bg-gray-200 dark:bg-gray-600"}`}
    style={{
      width: `${width}%`,
      top: `${top}%`,
    }}
  />
);

const GridLineY = ({left, height, makeBold}: {left: number; height: number; makeBold: boolean}) => (
  <div
    className={`absolute top-0 w-px transform -translate-x-1/2 ${makeBold ? "bg-gray-400 dark:bg-gray-400" : "bg-gray-200 dark:bg-gray-600"}`}
    style={{
      height: `${height}%`,
      left: `${left}%`,
    }}
  />
);

const SudokuPreviewGrid = React.memo(
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

export default class SudokuPreview extends React.PureComponent<{
  sudoku: SimpleSudoku;
  id: number;
  darken?: boolean;
  size?: number;
  ariaLabel?: string;
  disabled?: boolean;
  onClick: () => void;
}> {
  render() {
    const {sudoku, id, onClick, size = 150, ariaLabel, disabled = false} = this.props;
    const containerHeight = size;
    const containerWidth = size;
    const height = 100;
    const width = 100;
    const fontSize = size / 16;

    const xSection = height / 9;
    const ySection = width / 9;

    return (
      <button
        aria-label={ariaLabel ?? `Select sudoku ${id}`}
        className="user-select-none group block border-0 bg-transparent p-0 text-left touch-manipulation hover:cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-300 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-800 disabled:cursor-wait disabled:opacity-60"
        data-testid={`sudoku-preview-${id}`}
        disabled={disabled}
        onClick={onClick}
        type="button"
      >
        <div
          className="relative bg-gray-100 dark:bg-gray-700 rounded-sm"
          style={{
            height: containerHeight,
            width: containerWidth,
            fontSize,
            lineHeight: 1,
          }}
        >
          <div className="pointer-events-none absolute left-1/2 top-[19%] z-30 -translate-x-1/2 -translate-y-1/2">
            <div
              className="font-bold text-teal-600 dark:text-teal-600"
              data-testid={`sudoku-preview-number-${id}`}
              style={{fontSize: size / 3}}
            >
              {id}
            </div>
          </div>
          <SudokuPreviewGrid width={width} height={height} hideLeftRight />
          {sudoku.map((row, y) => {
            return (
              <div key={y}>
                {row.map((n, x) => {
                  return n !== 0 ? (
                    <div
                      key={x}
                      className="text-black dark:text-white"
                      style={{
                        position: "absolute",
                        left: xSection * (x + 0.5) + "%",
                        top: ySection * (y + 0.5) + "%",
                        transform: "translate(-50%, -50%)",
                      }}
                    >
                      {n}
                    </div>
                  ) : null;
                })}
              </div>
            );
          })}
          {this.props.darken ? (
            <div className="absolute z-20 top-0 left-0 w-full h-full bg-black opacity-20 group-hover:opacity-0 transition-opacity duration-300" />
          ) : null}
        </div>
      </button>
    );
  }
}
