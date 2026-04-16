import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerDocTools } from './tools/docs.js';
import { registerQuoteTool } from './tools/quote.js';
import { registerSwapTool } from './tools/swap.js';
import { registerOrderbookTool } from './tools/orderbook.js';
import { registerTokensTool } from './tools/tokens.js';
import { registerBridgeTools } from './tools/bridge.js';

export function registerAllTools(server: McpServer): void {
  // No-auth tools first (docs, examples, tokens)
  registerDocTools(server);
  registerTokensTool(server);

  // Auth-required tools
  registerQuoteTool(server);
  registerSwapTool(server);
  registerOrderbookTool(server);
  registerBridgeTools(server);
}
