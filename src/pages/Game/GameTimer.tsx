import * as React from "react";
import {useTimer} from "src/context/TimerContext";
import {formatDuration} from "src/utils/format";

const GameTimer: React.FC = () => {
  const {displayTime} = useTimer();

  return <div data-testid="game-timer">{formatDuration(displayTime)}</div>;
};

export default GameTimer;
