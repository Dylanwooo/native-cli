import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';

let tempDir: string;

const TEST_ADDRESS = '0xbf381E1cBfdb0D02F3800010e490130D3dC73118';

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'native-cmd-quote-test-'));
  vi.stubEnv('XDG_CONFIG_HOME', tempDir);
  vi.stubEnv('XDG_CACHE_HOME', tempDir);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
  try {
    rmSync(tempDir, { recursive: true, force: true });
  } catch {
    // cleanup best-effort
  }
});

// Mock the api-client module
vi.mock('../../src/lib/api-client.js', () => ({
  apiRequest: vi.fn(),
}));

// Mock token resolver to pass through inputs as-is
vi.mock('../../src/lib/token-resolver.js', () => ({
  resolveToken: vi.fn(async (input: string) => input),
}));

async function createProgram() {
  const { registerQuoteCommand } = await import('../../src/commands/quote.js');
  const program = new Command();
  program
    .option('--json', 'Output as JSON')
    .option('--skip-cache', 'Bypass cache')
    .option('--no-color', 'Disable colors')
    .option('--chain <chain>', 'Chain')
    .option('--api-url <url>', 'API URL')
    .option('--api-key-file <path>', 'API key file')
    .option('--max-age <ms>', 'Max cache age')
    .option('--stale-ok', 'Accept stale cache');
  program.exitOverride();
  registerQuoteCommand(program);
  return program;
}

describe('quote command', () => {
  let stdoutWrite: ReturnType<typeof vi.spyOn>;
  let stderrWrite: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  it('makes API request with correct params', async () => {
    const { apiRequest } = await import('../../src/lib/api-client.js');
    const mockApiRequest = vi.mocked(apiRequest);
    mockApiRequest.mockResolvedValue({
      data: {
        buyerTokenAmount: '1000',
        sellerTokenAmount: '1',
        price: '1000',
      },
      _meta: {
        source: 'api',
        age_ms: 0,
        fresh: true,
        retries: 0,
        latency_ms: 50,
        rate_limit_remaining: 10,
      },
    });

    const program = await createProgram();
    await program.parseAsync([
      'node', 'native', 'quote',
      '--from', 'ETH',
      '--to', 'USDC',
      '--amount', '1',
      '--address', TEST_ADDRESS,
    ]);

    expect(mockApiRequest).toHaveBeenCalledTimes(1);
    const [endpoint, params] = mockApiRequest.mock.calls[0]!;
    expect(endpoint).toBe('indicative-quote');
    expect(params.token_in).toBe('ETH');
    expect(params.token_out).toBe('USDC');
    expect(params.amount).toBe('1');
    expect(params.from_address).toBe(TEST_ADDRESS);
  });

  it('passes multihop flag correctly', async () => {
    const { apiRequest } = await import('../../src/lib/api-client.js');
    const mockApiRequest = vi.mocked(apiRequest);
    mockApiRequest.mockResolvedValue({
      data: { buyerTokenAmount: '100', sellerTokenAmount: '1', price: '100' },
      _meta: { source: 'api', age_ms: 0, fresh: true, retries: 0, latency_ms: 50 },
    });

    const program = await createProgram();
    await program.parseAsync([
      'node', 'native', 'quote',
      '--from', 'ETH',
      '--to', 'USDC',
      '--amount', '1',
      '--address', TEST_ADDRESS,
      '--multihop',
    ]);

    expect(mockApiRequest).toHaveBeenCalledTimes(1);
    const [, params] = mockApiRequest.mock.calls[0]!;
    expect(params.allow_multihop).toBe('true');
  });

  it('outputs JSON when --json flag is set', async () => {
    const { apiRequest } = await import('../../src/lib/api-client.js');
    const mockApiRequest = vi.mocked(apiRequest);
    mockApiRequest.mockResolvedValue({
      data: { buyerTokenAmount: '1000', sellerTokenAmount: '1', price: '1000' },
      _meta: { source: 'api', age_ms: 0, fresh: true, retries: 0, latency_ms: 50, rate_limit_remaining: 10 },
    });

    const program = await createProgram();
    await program.parseAsync([
      'node', 'native', '--json', 'quote',
      '--from', 'ETH',
      '--to', 'USDC',
      '--amount', '1',
      '--address', TEST_ADDRESS,
    ]);

    expect(stdoutWrite).toHaveBeenCalled();
    const output = (stdoutWrite.mock.calls[0]![0] as string).trim();
    const parsed = JSON.parse(output);
    expect(parsed.buyerTokenAmount).toBe('1000');
    expect(parsed._meta).toBeDefined();
    expect(parsed._meta.source).toBe('api');
  });

  it('handles error response gracefully', async () => {
    const { apiRequest } = await import('../../src/lib/api-client.js');
    const mockApiRequest = vi.mocked(apiRequest);
    const { NativeApiError } = await import('../../src/lib/errors.js');
    mockApiRequest.mockRejectedValue(
      new NativeApiError({ code: 101010, message: 'Amount exceeds available liquidity' })
    );

    const program = await createProgram();
    await program.parseAsync([
      'node', 'native', 'quote',
      '--from', 'ETH',
      '--to', 'USDC',
      '--amount', '999999999',
      '--address', TEST_ADDRESS,
    ]);

    expect(stderrWrite).toHaveBeenCalled();
    const output = stderrWrite.mock.calls.map((c) => c[0] as string).join('');
    expect(output).toContain('Amount exceeds available liquidity');
  });

  it('sets chain params from default config', async () => {
    const { apiRequest } = await import('../../src/lib/api-client.js');
    const mockApiRequest = vi.mocked(apiRequest);
    mockApiRequest.mockResolvedValue({
      data: { buyerTokenAmount: '100', sellerTokenAmount: '1', price: '100' },
      _meta: { source: 'api', age_ms: 0, fresh: true, retries: 0, latency_ms: 50 },
    });

    const program = await createProgram();
    await program.parseAsync([
      'node', 'native', 'quote',
      '--from', 'ETH',
      '--to', 'USDC',
      '--amount', '1',
      '--address', TEST_ADDRESS,
    ]);

    const [, params] = mockApiRequest.mock.calls[0]!;
    // Default chain is 'ethereum'
    expect(params.src_chain).toBe('ethereum');
    expect(params.dst_chain).toBe('ethereum');
  });

  it('uses --chain flag when provided', async () => {
    const { apiRequest } = await import('../../src/lib/api-client.js');
    const mockApiRequest = vi.mocked(apiRequest);
    mockApiRequest.mockResolvedValue({
      data: { buyerTokenAmount: '100', sellerTokenAmount: '1', price: '100' },
      _meta: { source: 'api', age_ms: 0, fresh: true, retries: 0, latency_ms: 50 },
    });

    const program = await createProgram();
    await program.parseAsync([
      'node', 'native', 'quote',
      '--from', 'ETH',
      '--to', 'USDC',
      '--amount', '1',
      '--address', TEST_ADDRESS,
      '--chain', 'arbitrum',
    ]);

    const [, params] = mockApiRequest.mock.calls[0]!;
    expect(params.src_chain).toBe('arbitrum');
    expect(params.dst_chain).toBe('arbitrum');
  });

  it('uses --src-chain and --dst-chain for cross-chain quotes', async () => {
    const { apiRequest } = await import('../../src/lib/api-client.js');
    const mockApiRequest = vi.mocked(apiRequest);
    mockApiRequest.mockResolvedValue({
      data: { buyerTokenAmount: '100', sellerTokenAmount: '1', price: '100' },
      _meta: { source: 'api', age_ms: 0, fresh: true, retries: 0, latency_ms: 50 },
    });

    const program = await createProgram();
    await program.parseAsync([
      'node', 'native', 'quote',
      '--from', 'ETH',
      '--to', 'USDC',
      '--amount', '1',
      '--address', TEST_ADDRESS,
      '--src-chain', 'ethereum',
      '--dst-chain', 'arbitrum',
    ]);

    const [, params] = mockApiRequest.mock.calls[0]!;
    expect(params.src_chain).toBe('ethereum');
    expect(params.dst_chain).toBe('arbitrum');
  });

  it('displays formatted output in non-JSON mode', async () => {
    const { apiRequest } = await import('../../src/lib/api-client.js');
    const mockApiRequest = vi.mocked(apiRequest);
    mockApiRequest.mockResolvedValue({
      data: { buyerTokenAmount: '3000', sellerTokenAmount: '1', price: '3000' },
      _meta: { source: 'api', age_ms: 0, fresh: true, retries: 0, latency_ms: 42, rate_limit_remaining: 5 },
    });

    // Ensure we're not in JSON mode by setting isTTY
    vi.mock('node:tty', () => ({
      isatty: () => true,
    }));

    vi.resetModules();
    const program = await createProgram();
    await program.parseAsync([
      'node', 'native', 'quote',
      '--from', 'ETH',
      '--to', 'USDC',
      '--amount', '1',
      '--address', TEST_ADDRESS,
    ]);

    // In non-JSON mode, printKeyValue writes to stdout and printInfo to stderr
    const stdoutOutput = stdoutWrite.mock.calls.map((c) => c[0] as string).join('');
    const stderrOutput = stderrWrite.mock.calls.map((c) => c[0] as string).join('');
    const allOutput = stdoutOutput + stderrOutput;

    expect(allOutput).toContain('ETH');
    expect(allOutput).toContain('USDC');
    expect(allOutput).toContain('3000');
  });

  it('passes cacheType as indicative_quote', async () => {
    const { apiRequest } = await import('../../src/lib/api-client.js');
    const mockApiRequest = vi.mocked(apiRequest);
    mockApiRequest.mockResolvedValue({
      data: { buyerTokenAmount: '100', sellerTokenAmount: '1', price: '100' },
      _meta: { source: 'api', age_ms: 0, fresh: true, retries: 0, latency_ms: 50 },
    });

    const program = await createProgram();
    await program.parseAsync([
      'node', 'native', 'quote',
      '--from', 'ETH',
      '--to', 'USDC',
      '--amount', '1',
      '--address', TEST_ADDRESS,
    ]);

    const [, , opts] = mockApiRequest.mock.calls[0]!;
    expect(opts).toBeDefined();
    expect((opts as Record<string, unknown>).cacheType).toBe('indicative_quote');
  });

  it('requires --from flag', async () => {
    const program = await createProgram();

    let exitCode: number | undefined;
    try {
      await program.parseAsync([
        'node', 'native', 'quote',
        '--to', 'USDC',
        '--amount', '1',
        '--address', TEST_ADDRESS,
      ]);
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'exitCode' in err) {
        exitCode = (err as { exitCode: number }).exitCode;
      }
    }
    // Commander should throw/exit for missing required option
    expect(exitCode).toBeDefined();
  });

  it('requires --to flag', async () => {
    const program = await createProgram();

    let exitCode: number | undefined;
    try {
      await program.parseAsync([
        'node', 'native', 'quote',
        '--from', 'ETH',
        '--amount', '1',
        '--address', TEST_ADDRESS,
      ]);
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'exitCode' in err) {
        exitCode = (err as { exitCode: number }).exitCode;
      }
    }
    expect(exitCode).toBeDefined();
  });

  it('requires --amount flag', async () => {
    const program = await createProgram();

    let exitCode: number | undefined;
    try {
      await program.parseAsync([
        'node', 'native', 'quote',
        '--from', 'ETH',
        '--to', 'USDC',
        '--address', TEST_ADDRESS,
      ]);
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'exitCode' in err) {
        exitCode = (err as { exitCode: number }).exitCode;
      }
    }
    expect(exitCode).toBeDefined();
  });

  it('requires --address flag', async () => {
    const program = await createProgram();

    let exitCode: number | undefined;
    try {
      await program.parseAsync([
        'node', 'native', 'quote',
        '--from', 'ETH',
        '--to', 'USDC',
        '--amount', '1',
      ]);
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'exitCode' in err) {
        exitCode = (err as { exitCode: number }).exitCode;
      }
    }
    expect(exitCode).toBeDefined();
  });
});
