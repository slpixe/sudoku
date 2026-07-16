import * as React from "react";

import {useTimer} from "src/context/TimerContext";
import {formatDuration} from "src/utils/format";

export const GameTimer: React.FC<{elapsedSeconds: number}> = ({elapsedSeconds}) => {
  return <div data-testid="game-timer">{formatDuration(elapsedSeconds)}</div>;
};

export function SoloGameTimer() {
  const {displayTime} = useTimer();

  return <GameTimer elapsedSeconds={displayTime} />;
}

export default GameTimer;
