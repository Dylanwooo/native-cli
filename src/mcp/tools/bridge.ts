import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { apiRequest } from '../../lib/api-client.js';
import { resolveConfig } from '../../lib/config.js';
import { formatResult, formatMcpError } from '../helpers.js';
import type {
  BridgeIndicativeQuoteResponse,
  BridgeFirmQuoteResponse,
  BridgeTxStatusResponse,
  BridgeTxHistoryResponse,
} from '../../types.js';

export function registerBridgeTools(server: McpServer): void {
  // ─── bridge quote ─────────────────────────────────────────────────

  server.tool(
    'native_bridge_quote',
    'Get an indicative cross-chain bridge quote between two chains on the Native platform',
    {
      from: z.string().describe('Source token symbol (e.g. ETH) or contract address'),
      to: z.string().describe('Destination token symbol (e.g. USDC) or contract address'),
      amount: z.string().describe('Amount of source token'),
      src_chain: z.string().describe('Source chain: ethereum, bsc, arbitrum, base'),
      dst_chain: z.string().describe('Destination chain: ethereum, bsc, arbitrum, base'),
    },
    async ({ from, to, amount, src_chain, dst_chain }) => {
      try {
        const params: Record<string, string> = {
          src_chain,
          dst_chain,
          token_in: from,
          token_out: to,
          amount,
        };

        const response = await apiRequest<BridgeIndicativeQuoteResponse>(
          'bridge/indicative-quote',
          params,
          { cacheType: 'bridge_indicative_quote' },
        );

        return formatResult(response.data, response._meta);
      } catch (err) {
        return formatMcpError(err);
      }
    },
  );

  // ─── bridge swap ──────────────────────────────────────────────────

  server.tool(
    'native_bridge_swap',
    'Get a firm cross-chain bridge swap quote with transaction calldata',
    {
      from: z.string().describe('Source token symbol or contract address'),
      to: z.string().describe('Destination token symbol or contract address'),
      amount: z.string().describe('Amount of source token'),
      src_chain: z.string().describe('Source chain'),
      dst_chain: z.string().describe('Destination chain'),
      address: z.string().describe('Sender wallet address (0x... format)'),
      refund_to: z.string().describe('Refund address if bridge fails (0x... format)'),
      slippage: z.number().optional().describe('Slippage tolerance in percent (e.g. 0.5)'),
    },
    async ({ from, to, amount, src_chain, dst_chain, address, refund_to, slippage }) => {
      try {
        const config = resolveConfig({ slippage });

        const params: Record<string, string> = {
          from_address: address,
          refund_to,
          src_chain,
          dst_chain,
          token_in: from,
          token_out: to,
          amount,
          slippage: String(config.slippage),
        };

        const response = await apiRequest<BridgeFirmQuoteResponse>(
          'bridge/firm-quote',
          params,
          { noCache: true, cacheType: 'bridge_firm_quote' },
        );

        return formatResult(response.data, response._meta);
      } catch (err) {
        return formatMcpError(err);
      }
    },
  );

  // ─── bridge status ────────────────────────────────────────────────

  server.tool(
    'native_bridge_status',
    'Check the status of a cross-chain bridge transaction',
    {
      bridge_quote_id: z.string().describe('Bridge quote ID returned from bridge swap'),
    },
    async ({ bridge_quote_id }) => {
      try {
        const response = await apiRequest<BridgeTxStatusResponse>(
          'bridge/tx-status',
          { bridge_quote_id },
          { cacheType: 'bridge_tx_status' },
        );

        return formatResult(response.data, response._meta);
      } catch (err) {
        return formatMcpError(err);
      }
    },
  );

  // ─── bridge history ───────────────────────────────────────────────

  server.tool(
    'native_bridge_history',
    'View bridge transaction history for a wallet address',
    {
      address: z.string().describe('Wallet address to check history for'),
      page_size: z.number().optional().describe('Number of results per page (default: 20)'),
      page_index: z.number().optional().describe('Page index (default: 0)'),
    },
    async ({ address, page_size, page_index }) => {
      try {
        const params: Record<string, string> = {
          address,
          page_size: String(page_size ?? 20),
          page_index: String(page_index ?? 0),
        };

        const response = await apiRequest<BridgeTxHistoryResponse>(
          'bridge/tx-history',
          params,
        );

        return formatResult(response.data, response._meta);
      } catch (err) {
        return formatMcpError(err);
      }
    },
  );
}
