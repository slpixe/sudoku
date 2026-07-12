import {applyBoardAction} from "./roomReducer.js";
import type {BoardAction, RoomAction, RoomBoard, RoomCommand, RoomSnapshot} from "./types.js";

function isBoardAction(action: RoomAction): action is BoardAction {
  return action.type === "setNumber" || action.type === "setNotes" || action.type === "clearCell" || action.type === "hint";
}

export function projectPendingCommands(confirmed: RoomSnapshot, pending: readonly RoomCommand[]): RoomBoard {
  let projected = confirmed.board;

  for (const command of pending) {
    if (isBoardAction(command.action)) {
      projected = applyBoardAction(projected, command.action).board;
    }
  }

  return projected;
}
