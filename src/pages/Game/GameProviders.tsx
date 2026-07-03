import * as React from "react";

import {GameProvider, GameState, INITIAL_GAME_STATE} from "src/context/GameContext";
import {INITIAL_SUDOKU_STATE, SudokuProvider, SudokuState} from "src/context/SudokuContext";
import {TimerProvider} from "src/context/TimerContext";
import {UserPreferencesProvider} from "src/context/UserPrefencesContext";
import {localStoragePlayedSudokuRepository} from "src/lib/database/playedSudokus";

type InitialGameData = {
  initialGameState: GameState;
  initialSudokuState: SudokuState;
};

function loadInitialGameData(): InitialGameData {
  const currentSudokuKey = localStoragePlayedSudokuRepository.getCurrentSudokuKey();
  const currentSudoku = currentSudokuKey
    ? localStoragePlayedSudokuRepository.getSudokuState(currentSudokuKey)
    : undefined;

  if (!currentSudoku) {
    return {
      initialGameState: INITIAL_GAME_STATE,
      initialSudokuState: INITIAL_SUDOKU_STATE,
    };
  }

  return {
    initialGameState: currentSudoku.game,
    initialSudokuState: {
      history: [currentSudoku.sudoku],
      historyIndex: 0,
      current: currentSudoku.sudoku,
    },
  };
}

export function GameProviders({children}: {children: React.ReactNode}) {
  const [{initialGameState, initialSudokuState}] = React.useState(loadInitialGameData);

  return (
    <GameProvider initialState={initialGameState}>
      <UserPreferencesProvider>
        <TimerProvider>
          <SudokuProvider initialState={initialSudokuState}>{children}</SudokuProvider>
        </TimerProvider>
      </UserPreferencesProvider>
    </GameProvider>
  );
}
