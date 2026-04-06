import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'native-cmd-tokens-test-'));
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
  const { registerTokensCommand } = await import('../../src/commands/tokens.js');
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
  registerTokensCommand(program);
  return program;
}

const sampleTokenMap = {
  ethereum: [
    { address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', symbol: 'ETH', name: 'Ethereum', decimals: 18 },
    { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', symbol: 'USDC', name: 'USD Coin', decimals: 6 },
  ],
  arbitrum: [
    { address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', symbol: 'ETH', name: 'Ethereum', decimals: 18 },
  ],
};

describe('tokens command', () => {
  let stdoutWrite: ReturnType<typeof vi.spyOn>;
  let stderrWrite: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  describe('chain filtering', () => {
    it('filters tokens by chain when --chain is provided', async () => {
      const { apiRequest } = await import('../../src/lib/api-client.js');
      const mockApiRequest = vi.mocked(apiRequest);
      mockApiRequest.mockResolvedValue({
        data: sampleTokenMap,
        _meta: { source: 'api', age_ms: 0, fresh: true, retries: 0, latency_ms: 50 },
      });

      vi.mock('node:tty', () => ({ isatty: () => true }));
      vi.resetModules();

      const program = await createProgram();
      await program.parseAsync([
        'node', 'native', 'tokens',
        '--chain', 'arbitrum',
      ]);

      const stdoutOutput = stdoutWrite.mock.calls.map((c) => c[0] as string).join('');
      // Arbitrum has only 1 ETH token
      expect(stdoutOutput).toContain('ETH');
      // Should NOT contain USDC since that's only on ethereum
      expect(stdoutOutput).not.toContain('USDC');
    });

    it('shows all chains when --chain is not provided', async () => {
      const { apiRequest } = await import('../../src/lib/api-client.js');
      const mockApiRequest = vi.mocked(apiRequest);
      mockApiRequest.mockResolvedValue({
        data: sampleTokenMap,
        _meta: { source: 'api', age_ms: 0, fresh: true, retries: 0, latency_ms: 50 },
      });

      vi.mock('node:tty', () => ({ isatty: () => true }));
      vi.resetModules();

      const program = await createProgram();
      await program.parseAsync([
        'node', 'native', 'tokens',
      ]);

      const stdoutOutput = stdoutWrite.mock.calls.map((c) => c[0] as string).join('');
      expect(stdoutOutput).toContain('ETH');
      expect(stdoutOutput).toContain('USDC');
    });
  });

  describe('JSON output', () => {
    it('outputs JSON when --json flag is set', async () => {
      const { apiRequest } = await import('../../src/lib/api-client.js');
      const mockApiRequest = vi.mocked(apiRequest);
      mockApiRequest.mockResolvedValue({
        data: sampleTokenMap,
        _meta: { source: 'api', age_ms: 0, fresh: true, retries: 0, latency_ms: 50, rate_limit_remaining: 10 },
      });

      const program = await createProgram();
      await program.parseAsync([
        'node', 'native', '--json', 'tokens',
      ]);

      expect(stdoutWrite).toHaveBeenCalled();
      const output = (stdoutWrite.mock.calls[0]![0] as string).trim();
      const parsed = JSON.parse(output);
      expect(parsed.tokens).toBeDefined();
      expect(Array.isArray(parsed.tokens)).toBe(true);
      expect(parsed._meta).toBeDefined();
    });

    it('includes chain field in flattened tokens JSON', async () => {
      const { apiRequest } = await import('../../src/lib/api-client.js');
      const mockApiRequest = vi.mocked(apiRequest);
      mockApiRequest.mockResolvedValue({
        data: sampleTokenMap,
        _meta: { source: 'api', age_ms: 0, fresh: true, retries: 0, latency_ms: 50 },
      });

      const program = await createProgram();
      await program.parseAsync([
        'node', 'native', '--json', 'tokens',
      ]);

      const output = (stdoutWrite.mock.calls[0]![0] as string).trim();
      const parsed = JSON.parse(output);
      // When no chain filter, tokens should be flattened with chain info
      const ethTokens = parsed.tokens.filter((t: Record<string, unknown>) => t.chain === 'ethereum');
      expect(ethTokens.length).toBeGreaterThan(0);
    });
  });

  describe('empty tokens', () => {
    it('shows info message when no tokens found', async () => {
      const { apiRequest } = await import('../../src/lib/api-client.js');
      const mockApiRequest = vi.mocked(apiRequest);
      mockApiRequest.mockResolvedValue({
        data: {},
        _meta: { source: 'api', age_ms: 0, fresh: true, retries: 0, latency_ms: 50 },
      });

      vi.mock('node:tty', () => ({ isatty: () => true }));
      vi.resetModules();

      const program = await createProgram();
      await program.parseAsync([
        'node', 'native', 'tokens',
      ]);

      const stderrOutput = stderrWrite.mock.calls.map((c) => c[0] as string).join('');
      expect(stderrOutput).toContain('No tokens found');
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
        'node', 'native', 'tokens',
      ]);

      const [, , opts] = mockApiRequest.mock.calls[0]!;
      expect((opts as Record<string, unknown>).requiresAuth).toBe(false);
    });
  });

  describe('handles array response', () => {
    it('handles direct array response from API', async () => {
      const { apiRequest } = await import('../../src/lib/api-client.js');
      const mockApiRequest = vi.mocked(apiRequest);
      mockApiRequest.mockResolvedValue({
        data: [
          { address: '0x1234', symbol: 'TEST', name: 'Test Token', decimals: 18 },
        ],
        _meta: { source: 'api', age_ms: 0, fresh: true, retries: 0, latency_ms: 50 },
      });

      const program = await createProgram();
      await program.parseAsync([
        'node', 'native', '--json', 'tokens',
      ]);

      const output = (stdoutWrite.mock.calls[0]![0] as string).trim();
      const parsed = JSON.parse(output);
      expect(parsed.tokens).toHaveLength(1);
      expect(parsed.tokens[0].symbol).toBe('TEST');
    });
  });
});
