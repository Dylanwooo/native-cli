import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerAllTools } from './mcp/register-tools.js';
import { VERSION } from './lib/version.js';

const server = new McpServer(
  {
    name: 'nativefi-mcp',
    version: VERSION,
  },
  {
    instructions: [
      'Native DeFi — token swaps, cross-chain bridges, and orderbook data.',
      '',
      'No auth: native_search_docs, native_get_examples, native_list_tokens',
      '',
      'Auth required:',
      '• native_get_quote / native_get_swap_quote — quotes & calldata',
      '• native_get_orderbook — liquidity depth',
      '• native_bridge_quote / native_bridge_swap / native_bridge_status / native_bridge_history',
      '',
      'Unsure about params, errors, or workflows? Call native_search_docs.',
      'Need code samples? Call native_get_examples.',
    ].join('\n'),
  },
);

registerAllTools(server);

const transport = new StdioServerTransport();
await server.connect(transport);
