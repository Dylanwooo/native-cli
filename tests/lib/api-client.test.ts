import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'native-api-client-test-'));
  vi.stubEnv('XDG_CONFIG_HOME', tempDir);
  vi.stubEnv('XDG_CACHE_HOME', tempDir);
  vi.stubEnv('NATIVE_API_KEY', 'test-api-key');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
});

function mockFetchResponse(body: unknown, status = 200, statusText = 'OK') {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: async () => body,
  });
}

describe('api-client', () => {
  describe('missing API key', () => {
    it('throws NativeCliError when API key is missing and auth required', async () => {
      vi.unstubAllEnvs();
      // Re-stub only what we need (no NATIVE_API_KEY)
      vi.stubEnv('XDG_CONFIG_HOME', tempDir);
      vi.stubEnv('XDG_CACHE_HOME', tempDir);

      const { apiRequest } = await import('../../src/lib/api-client.js');
      const { NativeCliError } = await import('../../src/lib/errors.js');

      await expect(
        apiRequest('firm-quote', { token_in: 'ETH', token_out: 'USDC' })
      ).rejects.toThrow(NativeCliError);

      try {
        await apiRequest('firm-quote', { token_in: 'ETH', token_out: 'USDC' });
      } catch (err) {
        expect((err as Error).message).toContain('No API key configured');
        expect((err as Error).message).toContain('native config set api-key');
        expect((err as Error).message).toContain('NATIVE_API_KEY');
        expect((err as Error).message).toContain('native config set-api-key');
      }
    });

    it('does not throw for auth-not-required endpoints', async () => {
      vi.unstubAllEnvs();
      vi.stubEnv('XDG_CONFIG_HOME', tempDir);
      vi.stubEnv('XDG_CACHE_HOME', tempDir);

      const mockFetch = mockFetchResponse([{ base_symbol: 'ETH', quote_symbol: 'USDC' }]);
      vi.stubGlobal('fetch', mockFetch);

      const { apiRequest } = await import('../../src/lib/api-client.js');

      const result = await apiRequest('orderbook', {}, { requiresAuth: false });
      expect(result.data).toBeDefined();
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('successful requests', () => {
    it('returns data and meta from API', async () => {
      const responseBody = { buyAmount: '1000', sellAmount: '1', price: '1000' };
      const mockFetch = mockFetchResponse(responseBody);
      vi.stubGlobal('fetch', mockFetch);

      const { apiRequest } = await import('../../src/lib/api-client.js');

      const result = await apiRequest('indicative-quote', {
        token_in: 'ETH',
        token_out: 'USDC',
        amount: '1',
      });

      expect(result.data).toEqual(responseBody);
      expect(result._meta.source).toBe('api');
      expect(result._meta.fresh).toBe(true);
      expect(result._meta.retries).toBe(0);
    });

    it('includes Authorization header when API key is set', async () => {
      const mockFetch = mockFetchResponse({ data: 'ok' });
      vi.stubGlobal('fetch', mockFetch);

      const { apiRequest } = await import('../../src/lib/api-client.js');
      await apiRequest('test', {});

      const callArgs = mockFetch.mock.calls[0];
      const headers = callArgs[1].headers;
      expect(headers['apiKey']).toBe('test-api-key');
    });
  });

  describe('timeout', () => {
    it('passes AbortSignal.timeout to fetch', async () => {
      const mockFetch = mockFetchResponse({ data: 'ok' });
      vi.stubGlobal('fetch', mockFetch);

      const { apiRequest } = await import('../../src/lib/api-client.js');
      await apiRequest('test', {});

      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[1].signal).toBeDefined();
    });
  });

  describe('retry logic', () => {
    it('retries on 500 error and succeeds', async () => {
      let callCount = 0;
      const mockFetch = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return {
            ok: false,
            status: 500,
            statusText: 'Internal Server Error',
            json: async () => ({ message: 'Server error' }),
          };
        }
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({ result: 'success' }),
        };
      });
      vi.stubGlobal('fetch', mockFetch);

      const { apiRequest } = await import('../../src/lib/api-client.js');
      const result = await apiRequest('test', {});

      expect(result.data).toEqual({ result: 'success' });
      expect(result._meta.retries).toBe(1);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('does not retry non-retryable error codes', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: async () => ({ code: 101010, message: 'Insufficient liquidity' }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const { apiRequest } = await import('../../src/lib/api-client.js');
      const { NativeApiError } = await import('../../src/lib/errors.js');

      await expect(apiRequest('test', {})).rejects.toThrow(NativeApiError);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('retries on retryable error code (rate limit 201005)', async () => {
      let callCount = 0;
      const mockFetch = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount <= 2) {
          return {
            ok: false,
            status: 429,
            statusText: 'Too Many Requests',
            json: async () => ({ code: 201005, message: 'Rate limited' }),
          };
        }
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({ result: 'ok' }),
        };
      });
      vi.stubGlobal('fetch', mockFetch);

      const { apiRequest } = await import('../../src/lib/api-client.js');
      const result = await apiRequest('test', {});

      expect(result.data).toEqual({ result: 'ok' });
      expect(mockFetch.mock.calls.length).toBeGreaterThanOrEqual(3);
    });

    it('throws after max retries on persistent 500', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => ({ message: 'Server error' }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const { apiRequest } = await import('../../src/lib/api-client.js');
      const { NativeApiError } = await import('../../src/lib/errors.js');

      await expect(apiRequest('test', {})).rejects.toThrow(NativeApiError);
      // MAX_RETRIES is 3, so 4 total attempts
      expect(mockFetch).toHaveBeenCalledTimes(4);
    });
  });

  describe('cache integration', () => {
    it('writes to cache on successful response for cacheable endpoints', async () => {
      const responseBody = { tokens: ['ETH', 'USDC'] };
      const mockFetch = mockFetchResponse(responseBody);
      vi.stubGlobal('fetch', mockFetch);

      const { apiRequest } = await import('../../src/lib/api-client.js');

      // First request goes to API
      const result1 = await apiRequest('widget-tokens', {}, {
        cacheType: 'tokens',
        requiresAuth: false,
      });
      expect(result1._meta.source).toBe('api');

      // Second request should come from cache
      const result2 = await apiRequest('widget-tokens', {}, {
        cacheType: 'tokens',
        requiresAuth: false,
      });
      expect(result2._meta.source).toBe('cache');
      expect(result2.data).toEqual(responseBody);
    });

    it('skips cache when noCache is true', async () => {
      const mockFetch = mockFetchResponse({ data: 'fresh' });
      vi.stubGlobal('fetch', mockFetch);

      const { apiRequest } = await import('../../src/lib/api-client.js');

      // First request populates cache
      await apiRequest('test', {}, { cacheType: 'tokens', requiresAuth: false });

      // Second request with noCache bypasses cache
      const result = await apiRequest('test', {}, {
        cacheType: 'tokens',
        noCache: true,
        requiresAuth: false,
      });
      expect(result._meta.source).toBe('api');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('does not cache firm_quote endpoints', async () => {
      const mockFetch = mockFetchResponse({ quote: 'data' });
      vi.stubGlobal('fetch', mockFetch);

      const { apiRequest } = await import('../../src/lib/api-client.js');

      await apiRequest('firm-quote', {}, { cacheType: 'firm_quote' });
      await apiRequest('firm-quote', {}, { cacheType: 'firm_quote' });

      // Both requests should go to API (no caching for firm_quote)
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('rate limiting', () => {
    it('rejects requests when rate limiter denies (reject strategy)', async () => {
      vi.stubEnv('XDG_CONFIG_HOME', tempDir);

      // Set up config with reject strategy and minimal burst
      const { setConfigValue } = await import('../../src/lib/config.js');
      setConfigValue('rate-limit-strategy', 'reject');
      setConfigValue('rate-limit-burst', '1');
      setConfigValue('rate-limit-rps', '1');

      vi.resetModules();
      vi.stubEnv('NATIVE_API_KEY', 'test-api-key');
      vi.stubEnv('XDG_CONFIG_HOME', tempDir);
      vi.stubEnv('XDG_CACHE_HOME', tempDir);

      const mockFetch = mockFetchResponse({ data: 'ok' });
      vi.stubGlobal('fetch', mockFetch);

      const { apiRequest } = await import('../../src/lib/api-client.js');
      const { NativeCliError } = await import('../../src/lib/errors.js');

      // First request should succeed
      await apiRequest('test', {});

      // Second request should be rate limited since burst=1
      await expect(apiRequest('test2', {})).rejects.toThrow(NativeCliError);
    });
  });

  describe('network errors', () => {
    it('throws after all retries on network failure', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
      vi.stubGlobal('fetch', mockFetch);

      const { apiRequest } = await import('../../src/lib/api-client.js');
      const { NativeCliError } = await import('../../src/lib/errors.js');

      await expect(apiRequest('test', {})).rejects.toThrow(NativeCliError);
      // 1 initial + MAX_RETRIES retries
      expect(mockFetch.mock.calls.length).toBeGreaterThanOrEqual(4);
    });
  });
});
