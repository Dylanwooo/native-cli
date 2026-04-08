import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { apiRequest } from '../../lib/api-client.js';
import { resolveToken } from '../../lib/token-resolver.js';
import { formatResult, formatMcpError, resolveChain } from '../helpers.js';
import type { IndicativeQuoteResponse } from '../../types.js';

export function registerQuoteTool(server: McpServer): void {
  server.tool(
    'native_get_quote',
    'Get an indicative (non-binding) price quote for a token swap on the Native liquidity platform',
    {
      from: z.string().describe('Source token symbol (e.g. ETH) or contract address (0x...)'),
      to: z.string().describe('Destination token symbol (e.g. USDC) or contract address (0x...)'),
      amount: z.string().describe('Amount of source token (e.g. "1" for 1 ETH)'),
      address: z.string().describe('Wallet address (from_address, required by API)'),
      chain: z.string().optional().describe('Chain name: ethereum, bsc, arbitrum, base. Defaults to config.'),
      src_chain: z.string().optional().describe('Source chain (for cross-chain quotes)'),
      dst_chain: z.string().optional().describe('Destination chain (for cross-chain quotes)'),
      multihop: z.boolean().optional().describe('Allow multihop routing for better rates'),
    },
    async ({ from, to, amount, address, chain, src_chain, dst_chain, multihop }) => {
      try {
        const defaultChain = resolveChain(chain);
        const srcChain = src_chain ?? defaultChain;
        const dstChain = dst_chain ?? defaultChain;

        const tokenIn = await resolveToken(from, srcChain);
        const tokenOut = await resolveToken(to, dstChain);

        const params: Record<string, string> = {
          from_address: address,
          src_chain: srcChain,
          dst_chain: dstChain,
          token_in: tokenIn,
          token_out: tokenOut,
          amount,
        };

        if (multihop) {
          params['allow_multihop'] = 'true';
        }

        const response = await apiRequest<IndicativeQuoteResponse>(
          'indicative-quote',
          params,
          { cacheType: 'indicative_quote' },
        );

        return formatResult(response.data, response._meta);
      } catch (err) {
        return formatMcpError(err);
      }
    },
  );
}
