import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'native-mcp-ob-test-'));
  vi.stubEnv('XDG_CONFIG_HOME', tempDir);
  vi.stubEnv('XDG_CACHE_HOME', tempDir);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
  try { rmSync(tempDir, { recursive: true, force: true }); } catch {}
});

vi.mock('../../../src/lib/api-client.js', () => ({
  apiRequest: vi.fn(),
}));

async function callTool(server: McpServer, name: string, args: Record<string, unknown>) {
  const tools = (server as unknown as { _registeredTools: Record<string, { handler: Function }> })._registeredTools;
  const tool = tools[name];
  if (!tool) throw new Error(`Tool ${name} not found`);
  return tool.handler(args, {});
}

describe('MCP orderbook tool', () => {
  it('returns all pairs when no filter', async () => {
    const { apiRequest } = await import('../../../src/lib/api-client.js');
    const mockApiRequest = vi.mocked(apiRequest);
    mockApiRequest.mockResolvedValue({
      data: [
        { base_symbol: 'ETH', quote_symbol: 'USDC', levels: [[100, 1834]] },
        { base_symbol: 'BTC', quote_symbol: 'USDC', levels: [[10, 45000]] },
      ],
      _meta: { source: 'api', age_ms: 0, fresh: true, retries: 0, latency_ms: 30 },
    });

    const server = new McpServer({ name: 'test', version: '0.0.1' });
    const { registerOrderbookTool } = await import('../../../src/mcp/tools/orderbook.js');
    registerOrderbookTool(server);

    const result = await callTool(server, 'native_get_orderbook', { chain: 'arbitrum' });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.data).toHaveLength(2);
  });

  it('filters by pair', async () => {
    const { apiRequest } = await import('../../../src/lib/api-client.js');
    const mockApiRequest = vi.mocked(apiRequest);
    mockApiRequest.mockResolvedValue({
      data: [
        { base_symbol: 'ETH', quote_symbol: 'USDC', levels: [[100, 1834]] },
        { base_symbol: 'BTC', quote_symbol: 'USDC', levels: [[10, 45000]] },
      ],
      _meta: { source: 'api', age_ms: 0, fresh: true, retries: 0, latency_ms: 30 },
    });

    const server = new McpServer({ name: 'test', version: '0.0.1' });
    const { registerOrderbookTool } = await import('../../../src/mcp/tools/orderbook.js');
    registerOrderbookTool(server);

    const result = await callTool(server, 'native_get_orderbook', {
      chain: 'arbitrum',
      pair: 'ETH/USDC',
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.data).toHaveLength(1);
    expect(parsed.data[0].base_symbol).toBe('ETH');
  });

  it('does not require auth', async () => {
    const { apiRequest } = await import('../../../src/lib/api-client.js');
    const mockApiRequest = vi.mocked(apiRequest);
    mockApiRequest.mockResolvedValue({
      data: [],
      _meta: { source: 'api', age_ms: 0, fresh: true, retries: 0, latency_ms: 30 },
    });

    const server = new McpServer({ name: 'test', version: '0.0.1' });
    const { registerOrderbookTool } = await import('../../../src/mcp/tools/orderbook.js');
    registerOrderbookTool(server);

    await callTool(server, 'native_get_orderbook', {});

    const [, , opts] = mockApiRequest.mock.calls[0]!;
    expect((opts as Record<string, unknown>).requiresAuth).toBe(false);
  });
});
