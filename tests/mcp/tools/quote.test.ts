import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

let tempDir: string;

const TEST_ADDRESS = '0xbf381E1cBfdb0D02F3800010e490130D3dC73118';

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'native-mcp-quote-test-'));
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

describe('MCP quote tool', () => {
  it('registers native_get_quote tool', async () => {
    const server = new McpServer({ name: 'test', version: '0.0.1' });
    const { registerQuoteTool } = await import('../../../src/mcp/tools/quote.js');
    registerQuoteTool(server);

    const tools = (server as unknown as { _registeredTools: Record<string, unknown> })._registeredTools;
    expect('native_get_quote' in tools).toBe(true);
  });

  it('calls apiRequest with correct params', async () => {
    const { apiRequest } = await import('../../../src/lib/api-client.js');
    const mockApiRequest = vi.mocked(apiRequest);
    mockApiRequest.mockResolvedValue({
      data: { buyerTokenAmount: '1000', price: '1000' },
      _meta: { source: 'api', age_ms: 0, fresh: true, retries: 0, latency_ms: 50 },
    });

    const server = new McpServer({ name: 'test', version: '0.0.1' });
    const { registerQuoteTool } = await import('../../../src/mcp/tools/quote.js');
    registerQuoteTool(server);

    const result = await callTool(server, 'native_get_quote', {
      from: 'ETH',
      to: 'USDC',
      amount: '10',
      address: TEST_ADDRESS,
      chain: 'arbitrum',
    });

    expect(mockApiRequest).toHaveBeenCalledTimes(1);
    const [endpoint, params] = mockApiRequest.mock.calls[0]!;
    expect(endpoint).toBe('indicative-quote');
    expect(params.token_in).toBe('ETH');
    expect(params.token_out).toBe('USDC');
    expect(params.amount).toBe('10');
    expect(params.from_address).toBe(TEST_ADDRESS);
    expect(params.src_chain).toBe('arbitrum');
    expect(params.dst_chain).toBe('arbitrum');
  });

  it('returns structured JSON content', async () => {
    const { apiRequest } = await import('../../../src/lib/api-client.js');
    const mockApiRequest = vi.mocked(apiRequest);
    mockApiRequest.mockResolvedValue({
      data: { buyerTokenAmount: '1834.25', price: '1834.25' },
      _meta: { source: 'api', age_ms: 0, fresh: true, retries: 0, latency_ms: 82 },
    });

    const server = new McpServer({ name: 'test', version: '0.0.1' });
    const { registerQuoteTool } = await import('../../../src/mcp/tools/quote.js');
    registerQuoteTool(server);

    const result = await callTool(server, 'native_get_quote', {
      from: 'ETH',
      to: 'USDC',
      amount: '1',
      address: TEST_ADDRESS,
    });

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.data.buyerTokenAmount).toBe('1834.25');
    expect(parsed._meta.source).toBe('api');
    expect(parsed._meta.latency_ms).toBe(82);
  });

  it('passes multihop flag', async () => {
    const { apiRequest } = await import('../../../src/lib/api-client.js');
    const mockApiRequest = vi.mocked(apiRequest);
    mockApiRequest.mockResolvedValue({
      data: { buyerTokenAmount: '100', price: '100' },
      _meta: { source: 'api', age_ms: 0, fresh: true, retries: 0, latency_ms: 50 },
    });

    const server = new McpServer({ name: 'test', version: '0.0.1' });
    const { registerQuoteTool } = await import('../../../src/mcp/tools/quote.js');
    registerQuoteTool(server);

    await callTool(server, 'native_get_quote', {
      from: 'ETH',
      to: 'USDC',
      amount: '1',
      address: TEST_ADDRESS,
      multihop: true,
    });

    const [, params] = mockApiRequest.mock.calls[0]!;
    expect(params.allow_multihop).toBe('true');
  });

  it('handles cross-chain params', async () => {
    const { apiRequest } = await import('../../../src/lib/api-client.js');
    const mockApiRequest = vi.mocked(apiRequest);
    mockApiRequest.mockResolvedValue({
      data: { buyerTokenAmount: '100', price: '100' },
      _meta: { source: 'api', age_ms: 0, fresh: true, retries: 0, latency_ms: 50 },
    });

    const server = new McpServer({ name: 'test', version: '0.0.1' });
    const { registerQuoteTool } = await import('../../../src/mcp/tools/quote.js');
    registerQuoteTool(server);

    await callTool(server, 'native_get_quote', {
      from: 'ETH',
      to: 'USDC',
      amount: '1',
      address: TEST_ADDRESS,
      src_chain: 'ethereum',
      dst_chain: 'arbitrum',
    });

    const [, params] = mockApiRequest.mock.calls[0]!;
    expect(params.src_chain).toBe('ethereum');
    expect(params.dst_chain).toBe('arbitrum');
  });

  it('returns error content on API failure', async () => {
    const { apiRequest } = await import('../../../src/lib/api-client.js');
    const mockApiRequest = vi.mocked(apiRequest);
    const { NativeApiError } = await import('../../../src/lib/errors.js');
    mockApiRequest.mockRejectedValue(
      new NativeApiError({ code: 101010, message: 'Amount exceeds available liquidity' }),
    );

    const server = new McpServer({ name: 'test', version: '0.0.1' });
    const { registerQuoteTool } = await import('../../../src/mcp/tools/quote.js');
    registerQuoteTool(server);

    const result = await callTool(server, 'native_get_quote', {
      from: 'ETH',
      to: 'USDC',
      amount: '999999999',
      address: TEST_ADDRESS,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Amount exceeds available liquidity');
  });
});
