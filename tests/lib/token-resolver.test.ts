import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/lib/api-client.js', () => ({
  apiRequest: vi.fn(),
}));

const NATIVE_PLACEHOLDER = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

function mockTokensResponse(data: unknown): {
  data: unknown;
  _meta: {
    source: 'api';
    age_ms: number;
    fresh: boolean;
    retries: number;
    latency_ms: number;
  };
} {
  return {
    data,
    _meta: { source: 'api', age_ms: 0, fresh: true, retries: 0, latency_ms: 10 },
  };
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('resolveToken', () => {
  describe('address passthrough', () => {
    it('returns lowercase 0x-prefixed addresses as-is without hitting the API', async () => {
      const { apiRequest } = await import('../../src/lib/api-client.js');
      const mockApiRequest = vi.mocked(apiRequest);
      const { resolveToken } = await import('../../src/lib/token-resolver.js');

      const addr = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
      const result = await resolveToken(addr, 'ethereum');

      expect(result).toBe(addr);
      expect(mockApiRequest).not.toHaveBeenCalled();
    });

    it('returns uppercase 0X-prefixed addresses as-is', async () => {
      const { apiRequest } = await import('../../src/lib/api-client.js');
      const mockApiRequest = vi.mocked(apiRequest);
      const { resolveToken } = await import('../../src/lib/token-resolver.js');

      const addr = '0X1234567890abcdef1234567890abcdef12345678';
      const result = await resolveToken(addr, 'ethereum');

      expect(result).toBe(addr);
      expect(mockApiRequest).not.toHaveBeenCalled();
    });
  });

  describe('native token placeholders', () => {
    it.each(['ETH', 'eth', 'BNB', 'bnb'])(
      'maps %s to the native placeholder without hitting the API',
      async (symbol) => {
        const { apiRequest } = await import('../../src/lib/api-client.js');
        const mockApiRequest = vi.mocked(apiRequest);
        const { resolveToken } = await import('../../src/lib/token-resolver.js');

        const result = await resolveToken(symbol, 'ethereum');

        expect(result).toBe(NATIVE_PLACEHOLDER);
        expect(mockApiRequest).not.toHaveBeenCalled();
      },
    );
  });

  describe('array response shape', () => {
    it('resolves known symbols case-insensitively', async () => {
      const { apiRequest } = await import('../../src/lib/api-client.js');
      const mockApiRequest = vi.mocked(apiRequest);
      mockApiRequest.mockResolvedValueOnce(
        mockTokensResponse([
          { address: '0xUSDC...', symbol: 'USDC', name: 'USD Coin', decimals: 6 },
          { address: '0xWETH...', symbol: 'WETH', name: 'Wrapped Ether', decimals: 18 },
        ]),
      );
      const { resolveToken } = await import('../../src/lib/token-resolver.js');

      expect(await resolveToken('usdc', 'ethereum')).toBe('0xUSDC...');
    });

    it('passes the correct endpoint, params, and auth opts to apiRequest', async () => {
      const { apiRequest } = await import('../../src/lib/api-client.js');
      const mockApiRequest = vi.mocked(apiRequest);
      mockApiRequest.mockResolvedValueOnce(
        mockTokensResponse([{ address: '0xUSDC', symbol: 'USDC', name: 'USD Coin', decimals: 6 }]),
      );
      const { resolveToken } = await import('../../src/lib/token-resolver.js');

      await resolveToken('USDC', 'arbitrum', { apiUrl: 'https://override.example' });

      expect(mockApiRequest).toHaveBeenCalledTimes(1);
      const [endpoint, params, opts] = mockApiRequest.mock.calls[0]!;
      expect(endpoint).toBe('widget-tokens');
      expect(params).toEqual({ chain: 'arbitrum' });
      expect(opts?.cacheType).toBe('tokens');
      expect(opts?.requiresAuth).toBe(false);
      expect(opts?.configOverrides).toMatchObject({
        apiUrl: 'https://override.example',
        chain: 'arbitrum',
      });
    });
  });

  describe('map response shape', () => {
    it('resolves symbols under the requested chain key', async () => {
      const { apiRequest } = await import('../../src/lib/api-client.js');
      const mockApiRequest = vi.mocked(apiRequest);
      mockApiRequest.mockResolvedValueOnce(
        mockTokensResponse({
          ethereum: [{ address: '0xETH-USDC', symbol: 'USDC', name: 'USD Coin', decimals: 6 }],
          arbitrum: [{ address: '0xARB-USDC', symbol: 'USDC', name: 'USD Coin', decimals: 6 }],
        }),
      );
      const { resolveToken } = await import('../../src/lib/token-resolver.js');

      expect(await resolveToken('USDC', 'arbitrum')).toBe('0xARB-USDC');
    });

    it('throws not-found when the chain key is missing from the map', async () => {
      const { apiRequest } = await import('../../src/lib/api-client.js');
      const mockApiRequest = vi.mocked(apiRequest);
      mockApiRequest.mockResolvedValueOnce(
        mockTokensResponse({
          ethereum: [{ address: '0xETH-USDC', symbol: 'USDC', name: 'USD Coin', decimals: 6 }],
        }),
      );
      const { resolveToken } = await import('../../src/lib/token-resolver.js');

      await expect(resolveToken('USDC', 'base')).rejects.toThrow(/Token "USDC" not found on base/);
    });
  });

  describe('not-found error', () => {
    it('includes the chain name and a list of available symbols', async () => {
      const { apiRequest } = await import('../../src/lib/api-client.js');
      const mockApiRequest = vi.mocked(apiRequest);
      mockApiRequest.mockResolvedValueOnce(
        mockTokensResponse([
          { address: '0xA', symbol: 'USDC', name: 'USD Coin', decimals: 6 },
          { address: '0xB', symbol: 'WETH', name: 'Wrapped Ether', decimals: 18 },
        ]),
      );
      const { resolveToken } = await import('../../src/lib/token-resolver.js');

      await expect(resolveToken('FOO', 'ethereum')).rejects.toThrow(
        /Token "FOO" not found on ethereum[\s\S]*USDC, WETH/,
      );
    });

    it('excludes tokens with isSupported === false from the available list', async () => {
      const { apiRequest } = await import('../../src/lib/api-client.js');
      const mockApiRequest = vi.mocked(apiRequest);
      mockApiRequest.mockResolvedValueOnce(
        mockTokensResponse([
          { address: '0xA', symbol: 'USDC', name: 'USD Coin', decimals: 6 },
          { address: '0xB', symbol: 'DEAD', name: 'Defunct', decimals: 18, isSupported: false },
        ]),
      );
      const { resolveToken } = await import('../../src/lib/token-resolver.js');

      try {
        await resolveToken('FOO', 'ethereum');
        throw new Error('expected resolveToken to throw');
      } catch (err) {
        const msg = (err as Error).message;
        expect(msg).toContain('USDC');
        expect(msg).not.toContain('DEAD');
      }
    });

    it('caps the available list at 20 symbols', async () => {
      const { apiRequest } = await import('../../src/lib/api-client.js');
      const mockApiRequest = vi.mocked(apiRequest);
      const many = Array.from({ length: 25 }, (_, i) => ({
        address: `0x${i}`,
        symbol: `TKN${i}`,
        name: `Token ${i}`,
        decimals: 18,
      }));
      mockApiRequest.mockResolvedValueOnce(mockTokensResponse(many));
      const { resolveToken } = await import('../../src/lib/token-resolver.js');

      try {
        await resolveToken('MISSING', 'ethereum');
        throw new Error('expected resolveToken to throw');
      } catch (err) {
        const msg = (err as Error).message;
        expect(msg).toContain('TKN0');
        expect(msg).toContain('TKN19');
        expect(msg).not.toContain('TKN20');
      }
    });
  });
});
