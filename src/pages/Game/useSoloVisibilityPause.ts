import * as React from "react";

import {GameStateMachine} from "src/context/GameContext";

type SoloVisibilityPauseOptions = {
  locked: boolean;
  status: GameStateMachine;
  onPause: () => void;
  onResume: () => void;
};

export function useSoloVisibilityPause({locked, status, onPause, onResume}: SoloVisibilityPauseOptions) {
  const lockedRef = React.useRef(locked);
  const autoPausedByVisibilityRef = React.useRef(false);
  const autoResumeTimeoutRef = React.useRef<number | undefined>(undefined);

  React.useEffect(() => {
    lockedRef.current = locked;
  }, [locked]);

  const onVisibilityChange = React.useCallback(() => {
    if (document.visibilityState === "hidden") {
      if (status === GameStateMachine.running && !lockedRef.current) {
        autoPausedByVisibilityRef.current = true;
        onPause();
      }
      return;
    }

    if (!autoPausedByVisibilityRef.current) {
      return;
    }

    autoPausedByVisibilityRef.current = false;
    if (lockedRef.current) {
      return;
    }

    autoResumeTimeoutRef.current = window.setTimeout(() => {
      if (!lockedRef.current) {
        onResume();
      }
    }, 200);
  }, [status, onPause, onResume]);

  React.useEffect(() => {
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibilityChange, false);
    }

    return () => {
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibilityChange, false);
      }
      if (autoResumeTimeoutRef.current !== undefined) {
        window.clearTimeout(autoResumeTimeoutRef.current);
      }
    };
  }, [onVisibilityChange]);
}
