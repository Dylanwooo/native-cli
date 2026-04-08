import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

let tempDir: string;

const TEST_ADDRESS = '0xbf381E1cBfdb0D02F3800010e490130D3dC73118';

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'native-mcp-bridge-test-'));
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

describe('MCP bridge tools', () => {
  it('registers all 4 bridge tools', async () => {
    const server = new McpServer({ name: 'test', version: '0.0.1' });
    const { registerBridgeTools } = await import('../../../src/mcp/tools/bridge.js');
    registerBridgeTools(server);

    const tools = (server as unknown as { _registeredTools: Record<string, unknown> })._registeredTools;
    expect('native_bridge_quote' in tools).toBe(true);
    expect('native_bridge_swap' in tools).toBe(true);
    expect('native_bridge_status' in tools).toBe(true);
    expect('native_bridge_history' in tools).toBe(true);
  });

  it('bridge_quote calls correct endpoint', async () => {
    const { apiRequest } = await import('../../../src/lib/api-client.js');
    const mockApiRequest = vi.mocked(apiRequest);
    mockApiRequest.mockResolvedValue({
      data: { buyerTokenAmount: '1000', price: '1000', estimatedTime: 120 },
      _meta: { source: 'api', age_ms: 0, fresh: true, retries: 0, latency_ms: 50 },
    });

    const server = new McpServer({ name: 'test', version: '0.0.1' });
    const { registerBridgeTools } = await import('../../../src/mcp/tools/bridge.js');
    registerBridgeTools(server);

    await callTool(server, 'native_bridge_quote', {
      from: 'ETH',
      to: 'USDC',
      amount: '10',
      src_chain: 'ethereum',
      dst_chain: 'arbitrum',
    });

    const [endpoint, params] = mockApiRequest.mock.calls[0]!;
    expect(endpoint).toBe('bridge/indicative-quote');
    expect(params.src_chain).toBe('ethereum');
    expect(params.dst_chain).toBe('arbitrum');
  });

  it('bridge_swap uses noCache', async () => {
    const { apiRequest } = await import('../../../src/lib/api-client.js');
    const mockApiRequest = vi.mocked(apiRequest);
    mockApiRequest.mockResolvedValue({
      data: { bridge_quote_id: 'brg_123', txRequest: { target: '0x1', calldata: '0x2', value: '0' } },
      _meta: { source: 'api', age_ms: 0, fresh: true, retries: 0, latency_ms: 50 },
    });

    const server = new McpServer({ name: 'test', version: '0.0.1' });
    const { registerBridgeTools } = await import('../../../src/mcp/tools/bridge.js');
    registerBridgeTools(server);

    await callTool(server, 'native_bridge_swap', {
      from: 'ETH',
      to: 'USDC',
      amount: '5',
      src_chain: 'ethereum',
      dst_chain: 'arbitrum',
      address: TEST_ADDRESS,
      refund_to: TEST_ADDRESS,
    });

    const [endpoint, , opts] = mockApiRequest.mock.calls[0]!;
    expect(endpoint).toBe('bridge/firm-quote');
    expect((opts as Record<string, unknown>).noCache).toBe(true);
  });

  it('bridge_status returns status info', async () => {
    const { apiRequest } = await import('../../../src/lib/api-client.js');
    const mockApiRequest = vi.mocked(apiRequest);
    mockApiRequest.mockResolvedValue({
      data: { bridge_quote_id: 'brg_123', status: 'completed', src_tx_hash: '0xaaa', dst_tx_hash: '0xbbb' },
      _meta: { source: 'api', age_ms: 0, fresh: true, retries: 0, latency_ms: 30 },
    });

    const server = new McpServer({ name: 'test', version: '0.0.1' });
    const { registerBridgeTools } = await import('../../../src/mcp/tools/bridge.js');
    registerBridgeTools(server);

    const result = await callTool(server, 'native_bridge_status', {
      bridge_quote_id: 'brg_123',
    });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.data.status).toBe('completed');
    expect(parsed.data.src_tx_hash).toBe('0xaaa');
  });

  it('bridge_history paginates correctly', async () => {
    const { apiRequest } = await import('../../../src/lib/api-client.js');
    const mockApiRequest = vi.mocked(apiRequest);
    mockApiRequest.mockResolvedValue({
      data: { data: [{ bridge_quote_id: 'brg_1', status: 'completed' }], total: 50 },
      _meta: { source: 'api', age_ms: 0, fresh: true, retries: 0, latency_ms: 30 },
    });

    const server = new McpServer({ name: 'test', version: '0.0.1' });
    const { registerBridgeTools } = await import('../../../src/mcp/tools/bridge.js');
    registerBridgeTools(server);

    await callTool(server, 'native_bridge_history', {
      address: TEST_ADDRESS,
      page_size: 10,
      page_index: 2,
    });

    const [, params] = mockApiRequest.mock.calls[0]!;
    expect(params.page_size).toBe('10');
    expect(params.page_index).toBe('2');
  });
});
