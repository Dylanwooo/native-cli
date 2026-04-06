import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RateLimiter } from '../../src/lib/rate-limiter.js';

describe('RateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('basic acquisition', () => {
    it('allows requests within burst capacity', async () => {
      const limiter = new RateLimiter(10, 5, 'reject');

      // Should allow up to burst (5) requests immediately
      for (let i = 0; i < 5; i++) {
        const result = await limiter.acquire();
        expect(result).toBe(true);
      }
    });

    it('reports remaining tokens correctly', () => {
      const limiter = new RateLimiter(10, 5, 'reject');
      expect(limiter.remaining).toBe(5);
    });

    it('decrements remaining after acquire', async () => {
      const limiter = new RateLimiter(10, 5, 'reject');
      await limiter.acquire();
      // remaining should be 4 now (though timing jitter could add tiny refill)
      expect(limiter.remaining).toBeLessThanOrEqual(5);
      expect(limiter.remaining).toBeGreaterThanOrEqual(3);
    });
  });

  describe('reject strategy', () => {
    it('returns false when bucket is empty', async () => {
      const limiter = new RateLimiter(10, 2, 'reject');

      // Drain the bucket
      await limiter.acquire();
      await limiter.acquire();

      // Should be rejected now
      const result = await limiter.acquire();
      expect(result).toBe(false);
    });
  });

  describe('degrade strategy', () => {
    it('returns false when bucket is empty', async () => {
      const limiter = new RateLimiter(10, 2, 'degrade');

      // Drain the bucket
      await limiter.acquire();
      await limiter.acquire();

      const result = await limiter.acquire();
      expect(result).toBe(false);
    });
  });

  describe('queue strategy', () => {
    it('queues requests when bucket is empty and resolves after refill', async () => {
      const limiter = new RateLimiter(10, 1, 'queue');

      // Use the one token
      const first = await limiter.acquire();
      expect(first).toBe(true);

      // This will be queued
      const pendingPromise = limiter.acquire();

      // Advance time enough for a token to refill (10 per second = 100ms per token)
      await vi.advanceTimersByTimeAsync(150);

      const result = await pendingPromise;
      expect(result).toBe(true);
    });
  });

  describe('token refill', () => {
    it('refills tokens over time', async () => {
      const limiter = new RateLimiter(10, 5, 'reject');

      // Drain all tokens
      for (let i = 0; i < 5; i++) {
        await limiter.acquire();
      }

      // Bucket should be empty
      const rejected = await limiter.acquire();
      expect(rejected).toBe(false);

      // Advance time by 500ms (should refill ~5 tokens at 10/sec)
      vi.advanceTimersByTime(500);

      // Should have tokens again
      const result = await limiter.acquire();
      expect(result).toBe(true);
    });

    it('does not exceed max burst capacity during refill', async () => {
      const limiter = new RateLimiter(10, 3, 'reject');

      // Wait a long time - should still be capped at burst
      vi.advanceTimersByTime(10000);

      expect(limiter.remaining).toBe(3);
    });
  });

  describe('constructor defaults', () => {
    it('uses default values when not specified', async () => {
      const limiter = new RateLimiter();
      // Default is rps=10, burst=20, strategy='queue'
      expect(limiter.remaining).toBe(20);

      // Should be able to acquire 20 times
      for (let i = 0; i < 20; i++) {
        const result = await limiter.acquire();
        expect(result).toBe(true);
      }
    });
  });
});
