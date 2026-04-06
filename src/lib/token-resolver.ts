import { apiRequest } from './api-client.js';
import type { TokenInfo, WidgetTokensResponse } from '../types.js';

/**
 * Resolve a token symbol (e.g. "ETH", "USDC") to its contract address on a given chain.
 * If the input already looks like an address (0x...), return it as-is.
 */
export async function resolveToken(
  symbolOrAddress: string,
  chain: string,
  configOverrides?: { apiKeyFile?: string; apiUrl?: string },
): Promise<string> {
  // Already an address
  if (symbolOrAddress.startsWith('0x') || symbolOrAddress.startsWith('0X')) {
    return symbolOrAddress;
  }

  const symbol = symbolOrAddress.toUpperCase();

  // Native tokens
  if (symbol === 'ETH' || symbol === 'BNB') {
    return '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
  }

  // Fetch token list for this chain
  const response = await apiRequest<WidgetTokensResponse | TokenInfo[]>(
    'widget-tokens',
    { chain },
    {
      cacheType: 'tokens',
      requiresAuth: false,
      configOverrides: { ...configOverrides, chain },
    },
  );

  const data = response.data;
  let tokens: TokenInfo[] = [];

  if (Array.isArray(data)) {
    tokens = data;
  } else if (typeof data === 'object' && data !== null) {
    const map = data as Record<string, TokenInfo[]>;
    tokens = map[chain] ?? [];
  }

  const match = tokens.find(
    (t) => t.symbol?.toUpperCase() === symbol,
  );

  if (!match) {
    const available = tokens
      .filter((t) => t.isSupported !== false)
      .map((t) => t.symbol)
      .filter(Boolean)
      .slice(0, 20)
      .join(', ');

    throw new Error(
      `Token "${symbolOrAddress}" not found on ${chain}.\n` +
      `Use a contract address (0x...) or one of: ${available}...`,
    );
  }

  return match.address;
}
