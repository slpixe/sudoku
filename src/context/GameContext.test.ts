import React from "react";
import {renderToString} from "react-dom/server";
import {describe, expect, it} from "vitest";

import {DEFAULT_USER_PREFERENCES} from "src/lib/database/userPreferences";
import {GameProvider, gameReducer, GameState, GameStateMachine, INITIAL_GAME_STATE, useGame} from "./GameContext";

function NotesModeProbe() {
  const {state} = useGame();

  return React.createElement("span", null, state.notesMode ? "notes-on" : "notes-off");
}

describe("gameReducer", () => {
  it("starts a new running game with puzzle progress", () => {
    const next = gameReducer(
      {
        ...INITIAL_GAME_STATE,
        notesMode: true,
        secondsPlayed: 55,
        won: true,
      },
      {
        type: "game/NEW_GAME",
        sudokuIndex: 12,
        sudokuCollectionName: "hard",
        timesSolved: 2,
        previousTimes: [90, 110],
        preferences: DEFAULT_USER_PREFERENCES,
      },
    );

    expect(next).toMatchObject({
      sudokuIndex: 12,
      sudokuCollectionName: "hard",
      timesSolved: 2,
      previousTimes: [90, 110],
      secondsPlayed: 0,
      won: false,
      notesMode: false,
      state: GameStateMachine.running,
    });
  });

  it("opens restored game state with notes mode disabled", () => {
    const restoredState: GameState = {
      ...INITIAL_GAME_STATE,
      notesMode: true,
      secondsPlayed: 60,
      timesSolved: 1,
      previousTimes: [45],
    };

    const next = gameReducer(INITIAL_GAME_STATE, {type: "game/SET_GAME_STATE", state: restoredState});

    expect(next).toMatchObject({
      notesMode: false,
      secondsPlayed: 60,
      timesSolved: 1,
      previousTimes: [45],
    });
  });

  it("initializes restored provider state with notes mode disabled", () => {
    const html = renderToString(
      React.createElement(GameProvider, {
        initialState: {
          ...INITIAL_GAME_STATE,
          notesMode: true,
        },
        children: React.createElement(NotesModeProbe),
      }),
    );

    expect(html).toContain("notes-off");
  });

  it("records a win once and keeps won games paused", () => {
    const runningState: GameState = {
      ...INITIAL_GAME_STATE,
      state: GameStateMachine.running,
      secondsPlayed: 42,
      timesSolved: 1,
      previousTimes: [30],
    };

    const won = gameReducer(runningState, {type: "game/WON_GAME"});

    expect(won).toMatchObject({
      won: true,
      state: GameStateMachine.paused,
      timesSolved: 2,
      previousTimes: [30, 42],
    });

    const wonAgain = gameReducer(won, {type: "game/WON_GAME"});
    expect(wonAgain.timesSolved).toBe(2);
    expect(wonAgain.previousTimes).toEqual([30, 42]);
    expect(gameReducer(wonAgain, {type: "game/CONTINUE_GAME"})).toBe(wonAgain);
  });

  it("resets cleared game state without losing puzzle progress metadata", () => {
    const state: GameState = {
      ...INITIAL_GAME_STATE,
      state: GameStateMachine.paused,
      secondsPlayed: 120,
      won: true,
      timesSolved: 3,
      previousTimes: [40, 50, 60],
    };

    const reset = gameReducer(state, {type: "game/RESET_GAME"});

    expect(reset).toMatchObject({
      secondsPlayed: 0,
      won: false,
      state: GameStateMachine.running,
      timesSolved: 3,
      previousTimes: [40, 50, 60],
      notesMode: false,
    });
  });

  it("restarts puzzles with notes mode disabled", () => {
    const state: GameState = {
      ...INITIAL_GAME_STATE,
      notesMode: true,
      secondsPlayed: 120,
      won: true,
      timesSolved: 3,
      previousTimes: [40, 50, 60],
    };

    const restarted = gameReducer(state, {
      type: "game/RESTART_GAME",
      sudokuIndex: 2,
      sudokuCollectionName: "medium",
      timesSolved: 3,
      previousTimes: [40, 50, 60],
    });

    expect(restarted).toMatchObject({
      sudokuIndex: 2,
      sudokuCollectionName: "medium",
      secondsPlayed: 0,
      won: false,
      state: GameStateMachine.running,
      timesSolved: 3,
      previousTimes: [40, 50, 60],
      notesMode: false,
    });
  });
});
