import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { apiRequest } from '../../lib/api-client.js';
import { formatResult, formatMcpError, resolveChain } from '../helpers.js';
import type { TokenInfo, WidgetTokensResponse } from '../../types.js';

export function registerTokensTool(server: McpServer): void {
  server.tool(
    'native_list_tokens',
    'List all supported tokens on the Native liquidity platform, optionally filtered by chain',
    {
      chain: z.string().optional().describe('Filter by chain: ethereum, bsc, arbitrum, base'),
    },
    async ({ chain }) => {
      try {
        const resolvedChain = chain ?? '';
        const params: Record<string, string> = {};
        if (resolvedChain) {
          params['chain'] = resolvedChain;
        }

        const response = await apiRequest<WidgetTokensResponse | TokenInfo[]>(
          'widget-tokens',
          params,
          { cacheType: 'tokens', requiresAuth: false },
        );

        const data = response.data;
        let tokens: TokenInfo[] = [];

        if (Array.isArray(data)) {
          tokens = data;
        } else if (typeof data === 'object' && data !== null) {
          if (resolvedChain) {
            tokens = (data as Record<string, TokenInfo[]>)[resolvedChain] ?? [];
          } else {
            // Flatten all chains
            for (const chainTokens of Object.values(data as Record<string, TokenInfo[]>)) {
              tokens.push(...chainTokens);
            }
          }
        }

        return formatResult(tokens, response._meta);
      } catch (err) {
        return formatMcpError(err);
      }
    },
  );
}
