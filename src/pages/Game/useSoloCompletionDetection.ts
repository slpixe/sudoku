import * as React from "react";

import type {Cell} from "src/lib/engine/types";
import SudokuGame from "src/lib/game/SudokuGame";

export function useSoloCompletionDetection({
  cells,
  routeReady,
  onWon,
}: {
  cells: Cell[];
  routeReady: boolean;
  onWon: () => void;
}) {
  React.useEffect(() => {
    if (routeReady && SudokuGame.isSolved(cells)) {
      onWon();
    }
  }, [cells, onWon, routeReady]);
}
