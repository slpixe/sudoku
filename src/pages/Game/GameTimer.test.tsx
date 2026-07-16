// @vitest-environment jsdom

import * as React from "react";
import {cleanup, render, screen} from "@testing-library/react";
import {afterEach, describe, expect, it} from "vitest";

import GameTimer from "./GameTimer";

afterEach(cleanup);

describe("GameTimer", () => {
  it("formats controller-provided elapsed seconds", () => {
    render(<GameTimer elapsedSeconds={125.9} />);

    expect(screen.getByTestId("game-timer").textContent).toBe("02:05 min");
  });
});
