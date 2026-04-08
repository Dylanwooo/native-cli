import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { apiRequest } from '../../lib/api-client.js';
import { resolveConfig } from '../../lib/config.js';
import { resolveToken } from '../../lib/token-resolver.js';
import { formatResult, formatMcpError, resolveChain } from '../helpers.js';
import type { FirmQuoteResponse } from '../../types.js';
import { FIRM_QUOTE_VERSION } from '../../types.js';

export function registerSwapTool(server: McpServer): void {
  server.tool(
    'native_get_swap_quote',
    'Get a firm (executable) swap quote with transaction calldata. Returns tx target, calldata, and value ready to submit to your wallet.',
    {
      from: z.string().describe('Source token symbol (e.g. ETH) or contract address (0x...)'),
      to: z.string().describe('Destination token symbol (e.g. USDC) or contract address (0x...)'),
      amount: z.string().describe('Amount of source token (e.g. "1" for 1 ETH)'),
      address: z.string().describe('Sender/signer wallet address (0x... format)'),
      chain: z.string().optional().describe('Chain name: ethereum, bsc, arbitrum, base'),
      slippage: z.number().optional().describe('Slippage tolerance in percent (e.g. 0.5)'),
    },
    async ({ from, to, amount, address, chain, slippage }) => {
      try {
        const resolvedChain = resolveChain(chain);
        const config = resolveConfig({ chain: resolvedChain, slippage });

        const tokenIn = await resolveToken(from, config.chain);
        const tokenOut = await resolveToken(to, config.chain);

        const params: Record<string, string> = {
          from_address: address,
          src_chain: config.chain,
          dst_chain: config.chain,
          token_in: tokenIn,
          token_out: tokenOut,
          amount,
          slippage: String(config.slippage),
          version: String(FIRM_QUOTE_VERSION),
        };

        const response = await apiRequest<FirmQuoteResponse>(
          'firm-quote',
          params,
          { noCache: true, cacheType: 'firm_quote' },
        );

        return formatResult(response.data, response._meta);
      } catch (err) {
        return formatMcpError(err);
      }
    },
  );
}
