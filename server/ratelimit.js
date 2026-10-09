// Token buckets for rate limiting. Pure and clock-injectable for tests.

/**
 * A bucket holds up to `capacity` tokens and refills `refillPerSec` tokens per second.
 * `take()` spends one token and returns false when the bucket is empty.
 * @param {{capacity: number, refillPerSec: number, now?: () => number}} o
 */
export function createBucket({ capacity, refillPerSec, now = Date.now }) {
  let tokens = capacity;
  let last = now();
  const refill = () => {
    const t = now();
    if (t > last) {
      tokens = Math.min(capacity, tokens + ((t - last) / 1000) * refillPerSec);
      last = t;
    }
  };
  return {
    take(cost = 1) {
      refill();
      if (tokens < cost) return false;
      tokens -= cost;
      return true;
    },
    /** Seconds until one token is available (0 when ready). */
    wait(cost = 1) {
      refill();
      return tokens >= cost ? 0 : (cost - tokens) / refillPerSec;
    },
    get tokens() { refill(); return tokens; },
  };
}

/**
 * Chat limit from the contract: `burst` messages per `windowMs` (default 5 / 10 s).
 * @param {{burst?: number, windowMs?: number, now?: () => number}} [o]
 */
export function createChatLimiter({ burst = 5, windowMs = 10_000, now = Date.now } = {}) {
  return createBucket({ capacity: burst, refillPerSec: burst / (windowMs / 1000), now });
}

/**
 * Fixed-window counter keyed by a string (e.g. connections per IP per minute).
 * @param {{limit: number, windowMs: number, now?: () => number}} o
 */
export function createKeyedCounter({ limit, windowMs, now = Date.now }) {
  const map = new Map();
  return {
    /** Count one hit for `key`; false when over the limit. */
    hit(key) {
      const t = now();
      let e = map.get(key);
      if (!e || t - e.start >= windowMs) {
        e = { start: t, n: 0 };
        map.set(key, e);
      }
      e.n++;
      return e.n <= limit;
    },
    /** Drop expired windows (call now and then). */
    sweep() {
      const t = now();
      for (const [k, e] of map) if (t - e.start >= windowMs) map.delete(k);
    },
    get size() { return map.size; },
  };
}
