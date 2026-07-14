import {describe, expect, it} from "vitest";

import {MultiplayerMetrics} from "./metrics.js";

describe("MultiplayerMetrics", () => {
  it("counts reconnect recoveries independently from current gauges", () => {
    const metrics = new MultiplayerMetrics();

    expect(metrics.snapshot(3, 2).reconnects).toBe(0);
    metrics.recordReconnect();
    expect(metrics.snapshot(1, 1).reconnects).toBe(1);
  });
});
