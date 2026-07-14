import * as React from "react";
import {formatDuration} from "src/utils/format";

const GameTimer: React.FC<{elapsedSeconds: number}> = ({elapsedSeconds}) => {
  return <div data-testid="game-timer">{formatDuration(elapsedSeconds)}</div>;
};

export default GameTimer;
