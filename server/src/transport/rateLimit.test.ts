import {describe, expect, it} from "vitest";

import type {Clock} from "../rooms/Clock.js";
import {TokenBucketRateLimiter} from "./rateLimit.js";

class FakeClock implements Clock {
  #now = new Date("2026-07-13T10:00:00.000Z");

  now(): Date {
    return new Date(this.#now);
  }

  advance(milliseconds: number): void {
    this.#now = new Date(this.#now.getTime() + milliseconds);
  }
}

describe("TokenBucketRateLimiter", () => {
  it.each([
    ["room creations", 5, 60_000],
    ["failed joins", 20, 60_000],
    ["socket commands", 30, 1_000],
  ])("allows the configured %s burst, then refills", (_name, capacity, intervalMs) => {
    const clock = new FakeClock();
    const limiter = new TokenBucketRateLimiter(capacity, intervalMs, clock);

    for (let attempt = 0; attempt < capacity; attempt++) {
      expect(limiter.consume("source-a")).toBe(true);
    }
    expect(limiter.consume("source-a")).toBe(false);

    clock.advance(intervalMs);
    expect(limiter.consume("source-a")).toBe(true);
  });

  it("isolates limits by network source or socket key", () => {
    const limiter = new TokenBucketRateLimiter(1, 60_000, new FakeClock());

    expect(limiter.consume("source-a")).toBe(true);
    expect(limiter.consume("source-a")).toBe(false);
    expect(limiter.consume("source-b")).toBe(true);
  });

  it("atomically reserves a token and can refund a successful attempt", () => {
    const limiter = new TokenBucketRateLimiter(1, 60_000, new FakeClock());

    expect(limiter.consume("source-a")).toBe(true);
    expect(limiter.consume("source-a")).toBe(false);
    limiter.refund("source-a");
    expect(limiter.consume("source-a")).toBe(true);

    limiter.refund("source-a");
    limiter.refund("source-a");
    expect(limiter.consume("source-a")).toBe(true);
    expect(limiter.consume("source-a")).toBe(false);
  });

  it("evicts source buckets after the configured idle lifetime", () => {
    const clock = new FakeClock();
    const limiter = new TokenBucketRateLimiter(5, 60_000, clock, 120_000);

    limiter.consume("source-a");
    limiter.consume("source-b");
    expect(limiter.size).toBe(2);

    clock.advance(120_000);
    limiter.consume("source-c");
    expect(limiter.size).toBe(1);
  });
});
