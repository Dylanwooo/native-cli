import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'native-mcp-tokens-test-'));
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
  const tools = (server as unknown as {
    _registeredTools: Record<string, { handler: (args: unknown, extra: unknown) => unknown }>;
  })._registeredTools;
  const tool = tools[name];
  if (!tool) throw new Error(`Tool ${name} not found`);
  return tool.handler(args, {});
}

function mockTokensResponse(data: unknown) {
  return {
    data,
    _meta: { source: 'api' as const, age_ms: 0, fresh: true, retries: 0, latency_ms: 10 },
  };
}

function parseResult(result: unknown): { data: unknown; _meta: unknown } {
  const r = result as { content: Array<{ type: string; text: string }> };
  return JSON.parse(r.content[0]!.text);
}

describe('MCP tokens tool', () => {
  it('registers native_list_tokens tool', async () => {
    const server = new McpServer({ name: 'test', version: '0.0.1' });
    const { registerTokensTool } = await import('../../../src/mcp/tools/tokens.js');
    registerTokensTool(server);

    const tools = (server as unknown as { _registeredTools: Record<string, unknown> })._registeredTools;
    expect('native_list_tokens' in tools).toBe(true);
  });

  it('passes chain through as a query param when provided', async () => {
    const { apiRequest } = await import('../../../src/lib/api-client.js');
    const mockApiRequest = vi.mocked(apiRequest);
    mockApiRequest.mockResolvedValue(mockTokensResponse([]));

    const server = new McpServer({ name: 'test', version: '0.0.1' });
    const { registerTokensTool } = await import('../../../src/mcp/tools/tokens.js');
    registerTokensTool(server);

    await callTool(server, 'native_list_tokens', { chain: 'arbitrum' });

    expect(mockApiRequest).toHaveBeenCalledTimes(1);
    const [endpoint, params, opts] = mockApiRequest.mock.calls[0]!;
    expect(endpoint).toBe('widget-tokens');
    expect(params).toEqual({ chain: 'arbitrum' });
    expect(opts?.cacheType).toBe('tokens');
    expect(opts?.requiresAuth).toBe(false);
  });

  it('omits the chain param when no chain is provided', async () => {
    const { apiRequest } = await import('../../../src/lib/api-client.js');
    const mockApiRequest = vi.mocked(apiRequest);
    mockApiRequest.mockResolvedValue(mockTokensResponse([]));

    const server = new McpServer({ name: 'test', version: '0.0.1' });
    const { registerTokensTool } = await import('../../../src/mcp/tools/tokens.js');
    registerTokensTool(server);

    await callTool(server, 'native_list_tokens', {});

    const [, params] = mockApiRequest.mock.calls[0]!;
    expect(params).toEqual({});
  });

  it('returns array response data unchanged', async () => {
    const { apiRequest } = await import('../../../src/lib/api-client.js');
    const mockApiRequest = vi.mocked(apiRequest);
    const tokens = [
      { address: '0xA', symbol: 'USDC', name: 'USD Coin', decimals: 6 },
      { address: '0xB', symbol: 'WETH', name: 'Wrapped Ether', decimals: 18 },
    ];
    mockApiRequest.mockResolvedValue(mockTokensResponse(tokens));

    const server = new McpServer({ name: 'test', version: '0.0.1' });
    const { registerTokensTool } = await import('../../../src/mcp/tools/tokens.js');
    registerTokensTool(server);

    const result = await callTool(server, 'native_list_tokens', { chain: 'ethereum' });
    const parsed = parseResult(result);
    expect(parsed.data).toEqual(tokens);
  });

  it('filters map response to the requested chain', async () => {
    const { apiRequest } = await import('../../../src/lib/api-client.js');
    const mockApiRequest = vi.mocked(apiRequest);
    mockApiRequest.mockResolvedValue(
      mockTokensResponse({
        ethereum: [{ address: '0xETH-USDC', symbol: 'USDC', name: 'USD Coin', decimals: 6 }],
        arbitrum: [{ address: '0xARB-USDC', symbol: 'USDC', name: 'USD Coin', decimals: 6 }],
      }),
    );

    const server = new McpServer({ name: 'test', version: '0.0.1' });
    const { registerTokensTool } = await import('../../../src/mcp/tools/tokens.js');
    registerTokensTool(server);

    const result = await callTool(server, 'native_list_tokens', { chain: 'arbitrum' });
    const parsed = parseResult(result) as { data: Array<{ address: string }> };
    expect(parsed.data).toHaveLength(1);
    expect(parsed.data[0]!.address).toBe('0xARB-USDC');
  });

  it('returns empty list when map shape is missing the requested chain', async () => {
    const { apiRequest } = await import('../../../src/lib/api-client.js');
    const mockApiRequest = vi.mocked(apiRequest);
    mockApiRequest.mockResolvedValue(
      mockTokensResponse({
        ethereum: [{ address: '0xA', symbol: 'USDC', name: 'USD Coin', decimals: 6 }],
      }),
    );

    const server = new McpServer({ name: 'test', version: '0.0.1' });
    const { registerTokensTool } = await import('../../../src/mcp/tools/tokens.js');
    registerTokensTool(server);

    const result = await callTool(server, 'native_list_tokens', { chain: 'base' });
    const parsed = parseResult(result) as { data: unknown[] };
    expect(parsed.data).toEqual([]);
  });

  it('flattens all chains when no chain is provided', async () => {
    // Unique to this tool: without a chain filter, the handler walks
    // Object.values and concats every chain's token list.
    const { apiRequest } = await import('../../../src/lib/api-client.js');
    const mockApiRequest = vi.mocked(apiRequest);
    mockApiRequest.mockResolvedValue(
      mockTokensResponse({
        ethereum: [{ address: '0xETH-A', symbol: 'AAA', name: 'A', decimals: 18 }],
        arbitrum: [
          { address: '0xARB-B', symbol: 'BBB', name: 'B', decimals: 18 },
          { address: '0xARB-C', symbol: 'CCC', name: 'C', decimals: 18 },
        ],
      }),
    );

    const server = new McpServer({ name: 'test', version: '0.0.1' });
    const { registerTokensTool } = await import('../../../src/mcp/tools/tokens.js');
    registerTokensTool(server);

    const result = await callTool(server, 'native_list_tokens', {});
    const parsed = parseResult(result) as { data: Array<{ address: string }> };
    expect(parsed.data).toHaveLength(3);
    const addresses = parsed.data.map((t) => t.address);
    expect(addresses).toEqual(expect.arrayContaining(['0xETH-A', '0xARB-B', '0xARB-C']));
  });

  it('returns error content on API failure', async () => {
    const { apiRequest } = await import('../../../src/lib/api-client.js');
    const mockApiRequest = vi.mocked(apiRequest);
    const { NativeApiError } = await import('../../../src/lib/errors.js');
    mockApiRequest.mockRejectedValue(
      new NativeApiError({ code: 201001, message: 'Auth error' }),
    );

    const server = new McpServer({ name: 'test', version: '0.0.1' });
    const { registerTokensTool } = await import('../../../src/mcp/tools/tokens.js');
    registerTokensTool(server);

    const result = (await callTool(server, 'native_list_tokens', {})) as {
      isError: true;
      content: Array<{ text: string }>;
    };
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toMatch(/^\[API Error 201001\] /);
  });
});
