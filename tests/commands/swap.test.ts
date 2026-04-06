import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'native-cmd-swap-test-'));
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

// Mock token resolver to pass through inputs as-is
vi.mock('../../src/lib/token-resolver.js', () => ({
  resolveToken: vi.fn(async (input: string) => input),
}));

async function createProgram() {
  const { registerSwapCommand } = await import('../../src/commands/swap.js');
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
  registerSwapCommand(program);
  return program;
}

describe('swap command', () => {
  let stdoutWrite: ReturnType<typeof vi.spyOn>;
  let stderrWrite: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  describe('dry-run uses indicative quote', () => {
    it('calls indicative-quote endpoint in dry-run mode', async () => {
      const { apiRequest } = await import('../../src/lib/api-client.js');
      const mockApiRequest = vi.mocked(apiRequest);
      mockApiRequest.mockResolvedValue({
        data: {
          buyAmount: '3000',
          sellAmount: '1',
          price: '3000',
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
        'node', 'native', 'swap',
        '--from', 'ETH',
        '--to', 'USDC',
        '--amount', '1',
        '--address', '0x1234567890123456789012345678901234567890',
        '--dry-run',
      ]);

      expect(mockApiRequest).toHaveBeenCalledTimes(1);
      const [endpoint] = mockApiRequest.mock.calls[0]!;
      expect(endpoint).toBe('indicative-quote');
    });

    it('does NOT call firm-quote endpoint in dry-run mode', async () => {
      const { apiRequest } = await import('../../src/lib/api-client.js');
      const mockApiRequest = vi.mocked(apiRequest);
      mockApiRequest.mockResolvedValue({
        data: { buyAmount: '3000', sellAmount: '1', price: '3000' },
        _meta: { source: 'api', age_ms: 0, fresh: true, retries: 0, latency_ms: 50 },
      });

      const program = await createProgram();
      await program.parseAsync([
        'node', 'native', 'swap',
        '--from', 'ETH',
        '--to', 'USDC',
        '--amount', '1',
        '--address', '0x1234567890123456789012345678901234567890',
        '--dry-run',
      ]);

      for (const call of mockApiRequest.mock.calls) {
        expect(call[0]).not.toBe('firm-quote');
      }
    });

    it('displays DRY RUN label in output', async () => {
      const { apiRequest } = await import('../../src/lib/api-client.js');
      const mockApiRequest = vi.mocked(apiRequest);
      mockApiRequest.mockResolvedValue({
        data: { buyAmount: '3000', sellAmount: '1', price: '3000' },
        _meta: { source: 'api', age_ms: 0, fresh: true, retries: 0, latency_ms: 50 },
      });

      const program = await createProgram();
      await program.parseAsync([
        'node', 'native', 'swap',
        '--from', 'ETH',
        '--to', 'USDC',
        '--amount', '1',
        '--address', '0x1234567890123456789012345678901234567890',
        '--dry-run',
      ]);

      const allStderr = stderrWrite.mock.calls.map((c) => c[0] as string).join('');
      expect(allStderr).toContain('DRY RUN');
      expect(allStderr).toContain('indicative quote');
    });

    it('includes dry_run=true in JSON output during dry-run', async () => {
      const { apiRequest } = await import('../../src/lib/api-client.js');
      const mockApiRequest = vi.mocked(apiRequest);
      mockApiRequest.mockResolvedValue({
        data: { buyAmount: '3000', sellAmount: '1', price: '3000' },
        _meta: { source: 'api', age_ms: 0, fresh: true, retries: 0, latency_ms: 50 },
      });

      const program = await createProgram();
      await program.parseAsync([
        'node', 'native', '--json', 'swap',
        '--from', 'ETH',
        '--to', 'USDC',
        '--amount', '1',
        '--address', '0x1234567890123456789012345678901234567890',
        '--dry-run',
      ]);

      expect(stdoutWrite).toHaveBeenCalled();
      const output = (stdoutWrite.mock.calls[0]![0] as string).trim();
      const parsed = JSON.parse(output);
      expect(parsed.dry_run).toBe(true);
    });
  });

  describe('normal mode uses firm quote', () => {
    it('calls firm-quote endpoint in normal mode', async () => {
      const { apiRequest } = await import('../../src/lib/api-client.js');
      const mockApiRequest = vi.mocked(apiRequest);
      mockApiRequest.mockResolvedValue({
        data: {
          buyerTokenAmount: '3000',
          price: '3000',
          txRequest: {
            target: '0xabc',
            calldata: '0x1234567890abcdef1234',
            value: '1000000000',
          },
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
        'node', 'native', 'swap',
        '--from', 'ETH',
        '--to', 'USDC',
        '--amount', '1',
        '--address', '0x1234567890123456789012345678901234567890',
      ]);

      expect(mockApiRequest).toHaveBeenCalledTimes(1);
      const [endpoint] = mockApiRequest.mock.calls[0]!;
      expect(endpoint).toBe('firm-quote');
    });
  });

  describe('required flags validation', () => {
    it('requires --from flag', async () => {
      const program = await createProgram();

      let exitCode: number | undefined;
      try {
        await program.parseAsync([
          'node', 'native', 'swap',
          '--to', 'USDC',
          '--amount', '1',
          '--address', '0x1234567890123456789012345678901234567890',
        ]);
      } catch (err: unknown) {
        if (err && typeof err === 'object' && 'exitCode' in err) {
          exitCode = (err as { exitCode: number }).exitCode;
        }
      }
      expect(exitCode).toBeDefined();
    });

    it('requires --to flag', async () => {
      const program = await createProgram();

      let exitCode: number | undefined;
      try {
        await program.parseAsync([
          'node', 'native', 'swap',
          '--from', 'ETH',
          '--amount', '1',
          '--address', '0x1234567890123456789012345678901234567890',
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
          'node', 'native', 'swap',
          '--from', 'ETH',
          '--to', 'USDC',
          '--address', '0x1234567890123456789012345678901234567890',
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
          'node', 'native', 'swap',
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

  describe('address validation', () => {
    it('rejects address that does not start with 0x', async () => {
      const { apiRequest } = await import('../../src/lib/api-client.js');
      const mockApiRequest = vi.mocked(apiRequest);

      const program = await createProgram();
      await program.parseAsync([
        'node', 'native', 'swap',
        '--from', 'ETH',
        '--to', 'USDC',
        '--amount', '1',
        '--address', 'notahexaddress01234567890123456789012',
      ]);

      // Should not call API
      expect(mockApiRequest).not.toHaveBeenCalled();

      const allStderr = stderrWrite.mock.calls.map((c) => c[0] as string).join('');
      expect(allStderr).toContain('Invalid address');
    });

    it('rejects address with wrong length', async () => {
      const { apiRequest } = await import('../../src/lib/api-client.js');
      const mockApiRequest = vi.mocked(apiRequest);

      const program = await createProgram();
      await program.parseAsync([
        'node', 'native', 'swap',
        '--from', 'ETH',
        '--to', 'USDC',
        '--amount', '1',
        '--address', '0x1234',
      ]);

      expect(mockApiRequest).not.toHaveBeenCalled();

      const allStderr = stderrWrite.mock.calls.map((c) => c[0] as string).join('');
      expect(allStderr).toContain('Invalid address');
    });
  });
});
