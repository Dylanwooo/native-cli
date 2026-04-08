import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

let tempDir: string;

const TEST_ADDRESS = '0xbf381E1cBfdb0D02F3800010e490130D3dC73118';

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'native-mcp-swap-test-'));
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

vi.mock('../../../src/lib/token-resolver.js', () => ({
  resolveToken: vi.fn(async (input: string) => input),
}));

async function callTool(server: McpServer, name: string, args: Record<string, unknown>) {
  const tools = (server as unknown as { _registeredTools: Record<string, { handler: Function }> })._registeredTools;
  const tool = tools[name];
  if (!tool) throw new Error(`Tool ${name} not found`);
  return tool.handler(args, {});
}

describe('MCP swap tool', () => {
  it('registers native_get_swap_quote tool', async () => {
    const server = new McpServer({ name: 'test', version: '0.0.1' });
    const { registerSwapTool } = await import('../../../src/mcp/tools/swap.js');
    registerSwapTool(server);

    const tools = (server as unknown as { _registeredTools: Record<string, unknown> })._registeredTools;
    expect('native_get_swap_quote' in tools).toBe(true);
  });

  it('calls firm-quote endpoint with noCache', async () => {
    const { apiRequest } = await import('../../../src/lib/api-client.js');
    const mockApiRequest = vi.mocked(apiRequest);
    mockApiRequest.mockResolvedValue({
      data: {
        buyerTokenAmount: '1000',
        price: '1000',
        txRequest: { target: '0xabc', calldata: '0x1234', value: '0' },
      },
      _meta: { source: 'api', age_ms: 0, fresh: true, retries: 0, latency_ms: 50 },
    });

    const server = new McpServer({ name: 'test', version: '0.0.1' });
    const { registerSwapTool } = await import('../../../src/mcp/tools/swap.js');
    registerSwapTool(server);

    await callTool(server, 'native_get_swap_quote', {
      from: 'ETH',
      to: 'USDC',
      amount: '1',
      address: TEST_ADDRESS,
      chain: 'arbitrum',
    });

    expect(mockApiRequest).toHaveBeenCalledTimes(1);
    const [endpoint, , opts] = mockApiRequest.mock.calls[0]!;
    expect(endpoint).toBe('firm-quote');
    expect((opts as Record<string, unknown>).noCache).toBe(true);
  });

  it('includes txRequest in response', async () => {
    const { apiRequest } = await import('../../../src/lib/api-client.js');
    const mockApiRequest = vi.mocked(apiRequest);
    mockApiRequest.mockResolvedValue({
      data: {
        buyerTokenAmount: '1834',
        txRequest: { target: '0xContractAddr', calldata: '0xabcdef', value: '10000000' },
      },
      _meta: { source: 'api', age_ms: 0, fresh: true, retries: 0, latency_ms: 30 },
    });

    const server = new McpServer({ name: 'test', version: '0.0.1' });
    const { registerSwapTool } = await import('../../../src/mcp/tools/swap.js');
    registerSwapTool(server);

    const result = await callTool(server, 'native_get_swap_quote', {
      from: 'ETH',
      to: 'USDC',
      amount: '10',
      address: TEST_ADDRESS,
    });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.data.txRequest.target).toBe('0xContractAddr');
    expect(parsed.data.txRequest.calldata).toBe('0xabcdef');
  });

  it('uses custom slippage', async () => {
    const { apiRequest } = await import('../../../src/lib/api-client.js');
    const mockApiRequest = vi.mocked(apiRequest);
    mockApiRequest.mockResolvedValue({
      data: { buyerTokenAmount: '100' },
      _meta: { source: 'api', age_ms: 0, fresh: true, retries: 0, latency_ms: 50 },
    });

    const server = new McpServer({ name: 'test', version: '0.0.1' });
    const { registerSwapTool } = await import('../../../src/mcp/tools/swap.js');
    registerSwapTool(server);

    await callTool(server, 'native_get_swap_quote', {
      from: 'ETH',
      to: 'USDC',
      amount: '1',
      address: TEST_ADDRESS,
      slippage: 1.5,
    });

    const [, params] = mockApiRequest.mock.calls[0]!;
    expect(params.slippage).toBe('1.5');
  });
});
