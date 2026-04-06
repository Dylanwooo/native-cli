import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// We need to mock the cache directory before importing cache functions.
// The cache module uses process.env and homedir() internally.
let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'native-cache-test-'));
  // Set XDG_CACHE_HOME so getCacheDir() points to our temp directory.
  // The cache module creates a "native" subdirectory under the cache home.
  vi.stubEnv('XDG_CACHE_HOME', tempDir);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
  try {
    rmSync(tempDir, { recursive: true, force: true });
  } catch {
    // cleanup best-effort
  }
});

async function importCache() {
  // Dynamic import to pick up fresh env each time after vi.resetModules()
  return await import('../../src/lib/cache.js');
}

describe('cache', () => {
  describe('getTTL', () => {
    it('returns correct TTL for tokens endpoint', async () => {
      const { getTTL } = await importCache();
      expect(getTTL('tokens')).toBe(60 * 60 * 1000); // 1 hour
    });

    it('returns correct TTL for orderbook endpoint', async () => {
      const { getTTL } = await importCache();
      expect(getTTL('orderbook')).toBe(3 * 1000); // 3 seconds
    });

    it('returns correct TTL for indicative_quote endpoint', async () => {
      const { getTTL } = await importCache();
      expect(getTTL('indicative_quote')).toBe(5 * 1000); // 5 seconds
    });

    it('returns correct TTL for blacklist endpoint', async () => {
      const { getTTL } = await importCache();
      expect(getTTL('blacklist')).toBe(5 * 60 * 1000); // 5 minutes
    });

    it('returns 0 for firm_quote (never cached)', async () => {
      const { getTTL } = await importCache();
      expect(getTTL('firm_quote')).toBe(0);
    });

    it('returns 0 for bridge_firm_quote (never cached)', async () => {
      const { getTTL } = await importCache();
      expect(getTTL('bridge_firm_quote')).toBe(0);
    });
  });

  describe('shouldCache', () => {
    it('returns true for cacheable endpoints', async () => {
      const { shouldCache } = await importCache();
      expect(shouldCache('tokens')).toBe(true);
      expect(shouldCache('orderbook')).toBe(true);
      expect(shouldCache('indicative_quote')).toBe(true);
      expect(shouldCache('blacklist')).toBe(true);
    });

    it('returns false for non-cacheable endpoints', async () => {
      const { shouldCache } = await importCache();
      expect(shouldCache('firm_quote')).toBe(false);
      expect(shouldCache('bridge_firm_quote')).toBe(false);
    });
  });

  describe('writeCache and readCache', () => {
    it('writes and reads cache data within TTL', async () => {
      const { writeCache, readCache } = await importCache();
      const endpoint = 'test-endpoint';
      const params = { foo: 'bar', baz: 123 };
      const data = { result: 'success', value: 42 };

      writeCache(endpoint, params, data, 'tokens');
      const cached = readCache(endpoint, params);

      expect(cached).not.toBeNull();
      expect(cached!.data).toEqual(data);
      expect(cached!.fresh).toBe(true);
      expect(cached!.age_ms).toBeGreaterThanOrEqual(0);
      expect(cached!.age_ms).toBeLessThan(1000);
    });

    it('returns null for cache miss (no data written)', async () => {
      const { readCache } = await importCache();
      const result = readCache('nonexistent', { key: 'value' });
      expect(result).toBeNull();
    });

    it('returns null for expired cache entries', async () => {
      const { writeCache, readCache } = await importCache();
      const endpoint = 'test-endpoint';
      const params = { a: 1 };
      const data = { hello: 'world' };

      writeCache(endpoint, params, data, 'tokens');

      // Manually modify the cache file to make it expired
      const cacheDir = join(tempDir, 'native');
      const files = require('node:fs').readdirSync(cacheDir);
      expect(files.length).toBeGreaterThan(0);

      const filePath = join(cacheDir, files[0]);
      const entry = JSON.parse(readFileSync(filePath, 'utf-8'));
      // Set timestamp to 2 hours ago (tokens TTL is 1 hour)
      entry.timestamp = Date.now() - 2 * 60 * 60 * 1000;
      writeFileSync(filePath, JSON.stringify(entry), 'utf-8');

      const cached = readCache(endpoint, params);
      expect(cached).toBeNull();
    });

    it('returns stale data when staleOk is true', async () => {
      const { writeCache, readCache } = await importCache();
      const endpoint = 'test-endpoint';
      const params = { a: 1 };
      const data = { hello: 'world' };

      writeCache(endpoint, params, data, 'tokens');

      // Make it expired
      const cacheDir = join(tempDir, 'native');
      const files = require('node:fs').readdirSync(cacheDir);
      const filePath = join(cacheDir, files[0]);
      const entry = JSON.parse(readFileSync(filePath, 'utf-8'));
      entry.timestamp = Date.now() - 2 * 60 * 60 * 1000;
      writeFileSync(filePath, JSON.stringify(entry), 'utf-8');

      const cached = readCache(endpoint, params, { staleOk: true });
      expect(cached).not.toBeNull();
      expect(cached!.data).toEqual(data);
      expect(cached!.fresh).toBe(false);
    });

    it('respects custom maxAge option', async () => {
      const { writeCache, readCache } = await importCache();
      const endpoint = 'test-endpoint';
      const params = { a: 1 };
      const data = { hello: 'world' };

      writeCache(endpoint, params, data, 'tokens');

      // Make the entry 10ms old
      const cacheDir = join(tempDir, 'native');
      const files = require('node:fs').readdirSync(cacheDir);
      const filePath = join(cacheDir, files[0]);
      const entry = JSON.parse(readFileSync(filePath, 'utf-8'));
      entry.timestamp = Date.now() - 100; // 100ms ago
      writeFileSync(filePath, JSON.stringify(entry), 'utf-8');

      // With maxAge of 50ms, it should be expired
      const expired = readCache(endpoint, params, { maxAge: 50 });
      expect(expired).toBeNull();

      // With maxAge of 5000ms, it should be fresh
      const fresh = readCache(endpoint, params, { maxAge: 5000 });
      expect(fresh).not.toBeNull();
      expect(fresh!.fresh).toBe(true);
    });

    it('does not write cache for endpoints with TTL 0', async () => {
      const { writeCache, readCache } = await importCache();
      const endpoint = 'firm-quote';
      const params = { from: 'ETH' };
      const data = { quote: 'some-data' };

      writeCache(endpoint, params, data, 'firm_quote');

      const cached = readCache(endpoint, params);
      expect(cached).toBeNull();
    });
  });

  describe('cache key generation', () => {
    it('generates deterministic keys for same params', async () => {
      const { writeCache, readCache } = await importCache();
      const endpoint = 'test';
      const params = { b: 'second', a: 'first' };
      const data = { result: true };

      writeCache(endpoint, params, data, 'tokens');

      // Same params, different insertion order - should still hit cache
      const cached = readCache(endpoint, { a: 'first', b: 'second' });
      expect(cached).not.toBeNull();
      expect(cached!.data).toEqual(data);
    });

    it('generates different keys for different params', async () => {
      const { writeCache, readCache } = await importCache();
      const endpoint = 'test';
      const data = { result: true };

      writeCache(endpoint, { a: '1' }, data, 'tokens');

      const cached = readCache(endpoint, { a: '2' });
      expect(cached).toBeNull();
    });

    it('generates different keys for different endpoints', async () => {
      const { writeCache, readCache } = await importCache();
      const params = { a: '1' };
      const data = { result: true };

      writeCache('endpoint-1', params, data, 'tokens');

      const cached = readCache('endpoint-2', params);
      expect(cached).toBeNull();
    });
  });

  describe('graceful error handling', () => {
    it('handles corrupted cache files gracefully', async () => {
      const { writeCache, readCache } = await importCache();
      const endpoint = 'test';
      const params = { key: 'val' };
      const data = { result: true };

      writeCache(endpoint, params, data, 'tokens');

      // Corrupt the cache file
      const cacheDir = join(tempDir, 'native');
      const files = require('node:fs').readdirSync(cacheDir);
      const filePath = join(cacheDir, files[0]);
      writeFileSync(filePath, 'NOT VALID JSON!!!', 'utf-8');

      // Should return null, not throw
      const cached = readCache(endpoint, params);
      expect(cached).toBeNull();
    });

    it('creates cache directory if it does not exist', async () => {
      const { writeCache } = await importCache();
      const endpoint = 'test';
      const params = { key: 'val' };
      const data = { result: true };

      // Remove the cache directory
      const cacheDir = join(tempDir, 'native');
      try {
        rmSync(cacheDir, { recursive: true, force: true });
      } catch {
        // may not exist yet
      }

      // writeCache should create it
      expect(() => {
        writeCache(endpoint, params, data, 'tokens');
      }).not.toThrow();
    });
  });
});
