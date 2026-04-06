import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'native-cmd-orderbook-test-'));
  vi.stubEnv('XDG_CONFIG_HOME', tempDir);
  vi.stubEnv('XDG_CACHE_HOME', tempDir);
  vi.stubEnv('NATIVE_API_KEY', 'test-api-key');
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

async function createProgram() {
  const { registerOrderbookCommand } = await import('../../src/commands/orderbook.js');
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
  registerOrderbookCommand(program);
  return program;
}

const sampleOrderbook = [
  {
    base_symbol: 'ETH',
    quote_symbol: 'USDC',
    base_token: '0xaaa',
    quote_token: '0xbbb',
    min_amount: '0.01',
    levels: [
      { price: 3000.5, liquidity: 100.5 },
      { price: 3000.0, liquidity: 200.0 },
    ],
  },
  {
    base_symbol: 'WBTC',
    quote_symbol: 'USDC',
    base_token: '0xccc',
    quote_token: '0xbbb',
    min_amount: '0.001',
    levels: [
      { price: 60000.0, liquidity: 5.0 },
    ],
  },
];

describe('orderbook command', () => {
  let stdoutWrite: ReturnType<typeof vi.spyOn>;
  let stderrWrite: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  describe('pair filtering', () => {
    it('filters by pair when --pair is provided', async () => {
      const { apiRequest } = await import('../../src/lib/api-client.js');
      const mockApiRequest = vi.mocked(apiRequest);
      mockApiRequest.mockResolvedValue({
        data: sampleOrderbook,
        _meta: { source: 'api', age_ms: 0, fresh: true, retries: 0, latency_ms: 50 },
      });

      // Mock TTY so we get table output
      vi.mock('node:tty', () => ({ isatty: () => true }));
      vi.resetModules();

      const program = await createProgram();
      await program.parseAsync([
        'node', 'native', 'orderbook',
        '--pair', 'ETH/USDC',
      ]);

      const stdoutOutput = stdoutWrite.mock.calls.map((c) => c[0] as string).join('');
      expect(stdoutOutput).toContain('ETH/USDC');
      // Should NOT contain WBTC since we filtered by ETH/USDC
      expect(stdoutOutput).not.toContain('WBTC/USDC');
    });

    it('shows all pairs when --pair is not provided', async () => {
      const { apiRequest } = await import('../../src/lib/api-client.js');
      const mockApiRequest = vi.mocked(apiRequest);
      mockApiRequest.mockResolvedValue({
        data: sampleOrderbook,
        _meta: { source: 'api', age_ms: 0, fresh: true, retries: 0, latency_ms: 50 },
      });

      vi.mock('node:tty', () => ({ isatty: () => true }));
      vi.resetModules();

      const program = await createProgram();
      await program.parseAsync([
        'node', 'native', 'orderbook',
      ]);

      const stdoutOutput = stdoutWrite.mock.calls.map((c) => c[0] as string).join('');
      expect(stdoutOutput).toContain('ETH/USDC');
      expect(stdoutOutput).toContain('WBTC/USDC');
    });
  });

  describe('chain override', () => {
    it('passes chain parameter to API request', async () => {
      const { apiRequest } = await import('../../src/lib/api-client.js');
      const mockApiRequest = vi.mocked(apiRequest);
      mockApiRequest.mockResolvedValue({
        data: [],
        _meta: { source: 'api', age_ms: 0, fresh: true, retries: 0, latency_ms: 50 },
      });

      const program = await createProgram();
      await program.parseAsync([
        'node', 'native', 'orderbook',
        '--chain', 'arbitrum',
      ]);

      expect(mockApiRequest).toHaveBeenCalledTimes(1);
      const [, params] = mockApiRequest.mock.calls[0]!;
      expect(params['chain']).toBe('arbitrum');
    });
  });

  describe('JSON output', () => {
    it('outputs JSON when --json flag is set', async () => {
      const { apiRequest } = await import('../../src/lib/api-client.js');
      const mockApiRequest = vi.mocked(apiRequest);
      mockApiRequest.mockResolvedValue({
        data: sampleOrderbook,
        _meta: { source: 'api', age_ms: 0, fresh: true, retries: 0, latency_ms: 50, rate_limit_remaining: 10 },
      });

      const program = await createProgram();
      await program.parseAsync([
        'node', 'native', '--json', 'orderbook',
      ]);

      expect(stdoutWrite).toHaveBeenCalled();
      const output = (stdoutWrite.mock.calls[0]![0] as string).trim();
      const parsed = JSON.parse(output);
      expect(parsed.orderbook).toBeDefined();
      expect(Array.isArray(parsed.orderbook)).toBe(true);
      expect(parsed._meta).toBeDefined();
      expect(parsed._meta.source).toBe('api');
    });
  });

  describe('empty orderbook', () => {
    it('shows info message when no entries found', async () => {
      const { apiRequest } = await import('../../src/lib/api-client.js');
      const mockApiRequest = vi.mocked(apiRequest);
      mockApiRequest.mockResolvedValue({
        data: [],
        _meta: { source: 'api', age_ms: 0, fresh: true, retries: 0, latency_ms: 50 },
      });

      vi.mock('node:tty', () => ({ isatty: () => true }));
      vi.resetModules();

      const program = await createProgram();
      await program.parseAsync([
        'node', 'native', 'orderbook',
      ]);

      const stderrOutput = stderrWrite.mock.calls.map((c) => c[0] as string).join('');
      expect(stderrOutput).toContain('No orderbook entries');
    });
  });

  describe('requiresAuth', () => {
    it('passes requiresAuth: false to apiRequest', async () => {
      const { apiRequest } = await import('../../src/lib/api-client.js');
      const mockApiRequest = vi.mocked(apiRequest);
      mockApiRequest.mockResolvedValue({
        data: [],
        _meta: { source: 'api', age_ms: 0, fresh: true, retries: 0, latency_ms: 50 },
      });

      const program = await createProgram();
      await program.parseAsync([
        'node', 'native', 'orderbook',
      ]);

      const [, , opts] = mockApiRequest.mock.calls[0]!;
      expect((opts as Record<string, unknown>).requiresAuth).toBe(false);
    });
  });
});
