import type { RateLimitStrategy } from '../types.js';

export class RateLimiter {
  private tokens: number;
  private readonly maxTokens: number;
  private readonly refillRate: number; // tokens per ms
  private lastRefill: number;
  private readonly strategy: RateLimitStrategy;
  private readonly queue: Array<{
    resolve: () => void;
    reject: (err: Error) => void;
  }> = [];
  private draining = false;

  constructor(rps: number = 10, burst: number = 20, strategy: RateLimitStrategy = 'queue') {
    this.maxTokens = burst;
    this.tokens = burst;
    this.refillRate = rps / 1000; // tokens per ms
    this.lastRefill = Date.now();
    this.strategy = strategy;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;
  }

  async acquire(): Promise<boolean> {
    this.refill();

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }

    switch (this.strategy) {
      case 'reject':
        return false;

      case 'degrade':
        return false;

      case 'queue':
      default:
        return this.waitForToken();
    }
  }

  private waitForToken(): Promise<boolean> {
    return new Promise((resolve, reject) => {
      this.queue.push({
        resolve: () => resolve(true),
        reject,
      });
      this.drainQueue();
    });
  }

  private drainQueue(): void {
    if (this.draining) return;
    this.draining = true;

    const drain = (): void => {
      this.refill();

      while (this.queue.length > 0 && this.tokens >= 1) {
        this.tokens -= 1;
        const item = this.queue.shift()!;
        item.resolve();
      }

      if (this.queue.length > 0) {
        // Wait until we'd have at least one token
        const waitMs = Math.ceil((1 - this.tokens) / this.refillRate);
        setTimeout(drain, Math.max(1, waitMs));
      } else {
        this.draining = false;
      }
    };

    drain();
  }

  get remaining(): number {
    this.refill();
    return Math.floor(this.tokens);
  }
}
