import type {Clock} from "../rooms/Clock.js";
import {SystemClock} from "../rooms/Clock.js";

interface Bucket {
  tokens: number;
  updatedAt: number;
  lastSeenAt: number;
}

export class TokenBucketRateLimiter {
  readonly #buckets = new Map<string, Bucket>();

  constructor(
    readonly capacity: number,
    readonly refillIntervalMs: number,
    readonly clock: Clock = new SystemClock(),
    readonly idleTtlMs = refillIntervalMs * 2,
  ) {
    if (!Number.isInteger(capacity) || capacity <= 0 || refillIntervalMs <= 0 || idleTtlMs <= 0) {
      throw new Error("Rate-limit capacity and refill interval must be positive");
    }
  }

  get size(): number {
    return this.#buckets.size;
  }

  consume(key: string): boolean {
    const bucket = this.#refill(key);
    if (bucket.tokens < 1) {
      return false;
    }

    bucket.tokens -= 1;
    return true;
  }

  hasCapacity(key: string): boolean {
    return this.#refill(key).tokens >= 1;
  }

  refund(key: string): void {
    const bucket = this.#refill(key);
    bucket.tokens = Math.min(this.capacity, bucket.tokens + 1);
  }

  delete(key: string): void {
    this.#buckets.delete(key);
  }

  #refill(key: string): Bucket {
    const now = this.clock.now().getTime();
    this.#sweepIdle(now);
    const previous = this.#buckets.get(key) ?? {tokens: this.capacity, updatedAt: now, lastSeenAt: now};
    const elapsed = Math.max(0, now - previous.updatedAt);
    const tokens = Math.min(this.capacity, previous.tokens + (elapsed * this.capacity) / this.refillIntervalMs);
    const bucket = {tokens, updatedAt: now, lastSeenAt: now};
    this.#buckets.set(key, bucket);
    return bucket;
  }

  #sweepIdle(now: number): void {
    for (const [key, bucket] of this.#buckets) {
      if (now - bucket.lastSeenAt >= this.idleTtlMs) {
        this.#buckets.delete(key);
      }
    }
  }
}
