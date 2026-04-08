import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerAllTools } from './mcp/register-tools.js';

const server = new McpServer({
  name: 'nativefi-mcp',
  version: '0.3.0',
});

registerAllTools(server);

const transport = new StdioServerTransport();
await server.connect(transport);
