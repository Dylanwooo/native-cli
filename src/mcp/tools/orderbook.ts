import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { apiRequest } from '../../lib/api-client.js';
import { formatResult, formatMcpError, resolveChain } from '../helpers.js';
import type { OrderbookEntry } from '../../types.js';

export function registerOrderbookTool(server: McpServer): void {
  server.tool(
    'native_get_orderbook',
    'Show real-time orderbook depth for trading pairs on the Native liquidity platform',
    {
      chain: z.string().optional().describe('Chain to query: ethereum, bsc, arbitrum, base'),
      pair: z.string().optional().describe('Filter by trading pair (e.g. ETH/USDC)'),
    },
    async ({ chain, pair }) => {
      try {
        const resolvedChain = resolveChain(chain);
        const params: Record<string, string> = { chain: resolvedChain };

        const response = await apiRequest<OrderbookEntry[]>(
          'orderbook',
          params,
          { cacheType: 'orderbook', requiresAuth: false },
        );

        let entries = Array.isArray(response.data) ? response.data : [];

        if (pair) {
          const [base, quote] = pair.toUpperCase().split('/');
          entries = entries.filter(
            (e) =>
              e.base_symbol?.toUpperCase() === base &&
              (!quote || e.quote_symbol?.toUpperCase() === quote),
          );
        }

        return formatResult(entries, response._meta);
      } catch (err) {
        return formatMcpError(err);
      }
    },
  );
}
