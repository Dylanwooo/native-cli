import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'native-cmd-bridge-test-'));
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
  const { registerBridgeCommand } = await import('../../src/commands/bridge.js');
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
  registerBridgeCommand(program);
  return program;
}

describe('bridge command', () => {
  let stdoutWrite: ReturnType<typeof vi.spyOn>;
  let stderrWrite: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  // ─── bridge quote ─────────────────────────────────────────────────

  describe('bridge quote', () => {
    it('calls bridge/indicative-quote endpoint', async () => {
      const { apiRequest } = await import('../../src/lib/api-client.js');
      const mockApiRequest = vi.mocked(apiRequest);
      mockApiRequest.mockResolvedValue({
        data: {
          buyAmount: '1000',
          sellAmount: '1',
          price: '1000',
          estimatedTime: 300,
        },
        _meta: { source: 'api', age_ms: 0, fresh: true, retries: 0, latency_ms: 50 },
      });

      const program = await createProgram();
      await program.parseAsync([
        'node', 'native', 'bridge', 'quote',
        '--from', 'ETH',
        '--to', 'USDC',
        '--amount', '1',
        '--src-chain', 'ethereum',
        '--dst-chain', 'arbitrum',
      ]);

      expect(mockApiRequest).toHaveBeenCalledTimes(1);
      const [endpoint, params] = mockApiRequest.mock.calls[0]!;
      expect(endpoint).toBe('bridge/indicative-quote');
      expect(params.src_chain).toBe('ethereum');
      expect(params.dst_chain).toBe('arbitrum');
    });

    it('outputs JSON with --json flag', async () => {
      const { apiRequest } = await import('../../src/lib/api-client.js');
      const mockApiRequest = vi.mocked(apiRequest);
      mockApiRequest.mockResolvedValue({
        data: { buyAmount: '1000', sellAmount: '1', price: '1000' },
        _meta: { source: 'api', age_ms: 0, fresh: true, retries: 0, latency_ms: 50 },
      });

      const program = await createProgram();
      await program.parseAsync([
        'node', 'native', '--json', 'bridge', 'quote',
        '--from', 'ETH',
        '--to', 'USDC',
        '--amount', '1',
        '--src-chain', 'ethereum',
        '--dst-chain', 'arbitrum',
      ]);

      expect(stdoutWrite).toHaveBeenCalled();
      const output = (stdoutWrite.mock.calls[0]![0] as string).trim();
      const parsed = JSON.parse(output);
      expect(parsed.buyAmount).toBe('1000');
      expect(parsed._meta).toBeDefined();
    });
  });

  // ─── bridge swap ──────────────────────────────────────────────────

  describe('bridge swap', () => {
    const validAddress = '0x1234567890123456789012345678901234567890';
    const validRefundAddr = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';

    it('calls bridge/firm-quote endpoint in normal mode', async () => {
      const { apiRequest } = await import('../../src/lib/api-client.js');
      const mockApiRequest = vi.mocked(apiRequest);
      mockApiRequest.mockResolvedValue({
        data: {
          buyAmount: '1000',
          sellAmount: '1',
          bridge_quote_id: 'bq-123',
          txRequest: { to: '0xabc', data: '0x123', value: '0' },
        },
        _meta: { source: 'api', age_ms: 0, fresh: true, retries: 0, latency_ms: 50 },
      });

      const program = await createProgram();
      await program.parseAsync([
        'node', 'native', 'bridge', 'swap',
        '--from', 'ETH',
        '--to', 'USDC',
        '--amount', '1',
        '--src-chain', 'ethereum',
        '--dst-chain', 'arbitrum',
        '--address', validAddress,
        '--refund-to', validRefundAddr,
      ]);

      expect(mockApiRequest).toHaveBeenCalledTimes(1);
      const [endpoint] = mockApiRequest.mock.calls[0]!;
      expect(endpoint).toBe('bridge/firm-quote');
    });

    it('calls bridge/indicative-quote in dry-run mode', async () => {
      const { apiRequest } = await import('../../src/lib/api-client.js');
      const mockApiRequest = vi.mocked(apiRequest);
      mockApiRequest.mockResolvedValue({
        data: { buyAmount: '1000', sellAmount: '1', price: '1000' },
        _meta: { source: 'api', age_ms: 0, fresh: true, retries: 0, latency_ms: 50 },
      });

      const program = await createProgram();
      await program.parseAsync([
        'node', 'native', 'bridge', 'swap',
        '--from', 'ETH',
        '--to', 'USDC',
        '--amount', '1',
        '--src-chain', 'ethereum',
        '--dst-chain', 'arbitrum',
        '--address', validAddress,
        '--refund-to', validRefundAddr,
        '--dry-run',
      ]);

      expect(mockApiRequest).toHaveBeenCalledTimes(1);
      const [endpoint] = mockApiRequest.mock.calls[0]!;
      expect(endpoint).toBe('bridge/indicative-quote');
    });

    it('does NOT call bridge/firm-quote in dry-run mode', async () => {
      const { apiRequest } = await import('../../src/lib/api-client.js');
      const mockApiRequest = vi.mocked(apiRequest);
      mockApiRequest.mockResolvedValue({
        data: { buyAmount: '1000', sellAmount: '1', price: '1000' },
        _meta: { source: 'api', age_ms: 0, fresh: true, retries: 0, latency_ms: 50 },
      });

      const program = await createProgram();
      await program.parseAsync([
        'node', 'native', 'bridge', 'swap',
        '--from', 'ETH',
        '--to', 'USDC',
        '--amount', '1',
        '--src-chain', 'ethereum',
        '--dst-chain', 'arbitrum',
        '--address', validAddress,
        '--refund-to', validRefundAddr,
        '--dry-run',
      ]);

      for (const call of mockApiRequest.mock.calls) {
        expect(call[0]).not.toBe('bridge/firm-quote');
      }
    });

    it('displays DRY RUN label in dry-run mode', async () => {
      const { apiRequest } = await import('../../src/lib/api-client.js');
      const mockApiRequest = vi.mocked(apiRequest);
      mockApiRequest.mockResolvedValue({
        data: { buyAmount: '1000', sellAmount: '1', price: '1000' },
        _meta: { source: 'api', age_ms: 0, fresh: true, retries: 0, latency_ms: 50 },
      });

      const program = await createProgram();
      await program.parseAsync([
        'node', 'native', 'bridge', 'swap',
        '--from', 'ETH',
        '--to', 'USDC',
        '--amount', '1',
        '--src-chain', 'ethereum',
        '--dst-chain', 'arbitrum',
        '--address', validAddress,
        '--refund-to', validRefundAddr,
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
        data: { buyAmount: '1000', sellAmount: '1', price: '1000' },
        _meta: { source: 'api', age_ms: 0, fresh: true, retries: 0, latency_ms: 50 },
      });

      const program = await createProgram();
      await program.parseAsync([
        'node', 'native', '--json', 'bridge', 'swap',
        '--from', 'ETH',
        '--to', 'USDC',
        '--amount', '1',
        '--src-chain', 'ethereum',
        '--dst-chain', 'arbitrum',
        '--address', validAddress,
        '--refund-to', validRefundAddr,
        '--dry-run',
      ]);

      expect(stdoutWrite).toHaveBeenCalled();
      const output = (stdoutWrite.mock.calls[0]![0] as string).trim();
      const parsed = JSON.parse(output);
      expect(parsed.dry_run).toBe(true);
    });

    it('validates sender address format', async () => {
      const { apiRequest } = await import('../../src/lib/api-client.js');
      const mockApiRequest = vi.mocked(apiRequest);

      const program = await createProgram();
      await program.parseAsync([
        'node', 'native', 'bridge', 'swap',
        '--from', 'ETH',
        '--to', 'USDC',
        '--amount', '1',
        '--src-chain', 'ethereum',
        '--dst-chain', 'arbitrum',
        '--address', 'bad-address',
        '--refund-to', validRefundAddr,
      ]);

      expect(mockApiRequest).not.toHaveBeenCalled();
      const allStderr = stderrWrite.mock.calls.map((c) => c[0] as string).join('');
      expect(allStderr).toContain('Invalid');
    });

    it('validates refund address format', async () => {
      const { apiRequest } = await import('../../src/lib/api-client.js');
      const mockApiRequest = vi.mocked(apiRequest);

      const program = await createProgram();
      await program.parseAsync([
        'node', 'native', 'bridge', 'swap',
        '--from', 'ETH',
        '--to', 'USDC',
        '--amount', '1',
        '--src-chain', 'ethereum',
        '--dst-chain', 'arbitrum',
        '--address', validAddress,
        '--refund-to', 'bad-refund',
      ]);

      expect(mockApiRequest).not.toHaveBeenCalled();
      const allStderr = stderrWrite.mock.calls.map((c) => c[0] as string).join('');
      expect(allStderr).toContain('Invalid');
    });
  });

  // ─── bridge status ────────────────────────────────────────────────

  describe('bridge status', () => {
    it('calls bridge/tx-status endpoint with bridge_quote_id', async () => {
      const { apiRequest } = await import('../../src/lib/api-client.js');
      const mockApiRequest = vi.mocked(apiRequest);
      mockApiRequest.mockResolvedValue({
        data: {
          bridge_quote_id: 'bq-123',
          status: 'completed',
          src_tx_hash: '0xabc',
          dst_tx_hash: '0xdef',
        },
        _meta: { source: 'api', age_ms: 0, fresh: true, retries: 0, latency_ms: 50 },
      });

      const program = await createProgram();
      await program.parseAsync([
        'node', 'native', 'bridge', 'status',
        '--id', 'bq-123',
      ]);

      expect(mockApiRequest).toHaveBeenCalledTimes(1);
      const [endpoint, params] = mockApiRequest.mock.calls[0]!;
      expect(endpoint).toBe('bridge/tx-status');
      expect(params.bridge_quote_id).toBe('bq-123');
    });

    it('displays status in human-readable format', async () => {
      const { apiRequest } = await import('../../src/lib/api-client.js');
      const mockApiRequest = vi.mocked(apiRequest);
      mockApiRequest.mockResolvedValue({
        data: {
          bridge_quote_id: 'bq-123',
          status: 'completed',
          src_tx_hash: '0xabc',
          dst_tx_hash: '0xdef',
        },
        _meta: { source: 'api', age_ms: 0, fresh: true, retries: 0, latency_ms: 50 },
      });

      vi.mock('node:tty', () => ({ isatty: () => true }));
      vi.resetModules();

      const program = await createProgram();
      await program.parseAsync([
        'node', 'native', 'bridge', 'status',
        '--id', 'bq-123',
      ]);

      const stdoutOutput = stdoutWrite.mock.calls.map((c) => c[0] as string).join('');
      expect(stdoutOutput).toContain('completed');
      expect(stdoutOutput).toContain('bq-123');
    });

    it('outputs JSON with --json flag', async () => {
      const { apiRequest } = await import('../../src/lib/api-client.js');
      const mockApiRequest = vi.mocked(apiRequest);
      mockApiRequest.mockResolvedValue({
        data: { bridge_quote_id: 'bq-123', status: 'pending' },
        _meta: { source: 'api', age_ms: 0, fresh: true, retries: 0, latency_ms: 50 },
      });

      const program = await createProgram();
      await program.parseAsync([
        'node', 'native', '--json', 'bridge', 'status',
        '--id', 'bq-123',
      ]);

      expect(stdoutWrite).toHaveBeenCalled();
      const output = (stdoutWrite.mock.calls[0]![0] as string).trim();
      const parsed = JSON.parse(output);
      expect(parsed.bridge_quote_id).toBe('bq-123');
      expect(parsed.status).toBe('pending');
    });
  });

  // ─── bridge history ───────────────────────────────────────────────

  describe('bridge history', () => {
    it('calls bridge/tx-history endpoint', async () => {
      const { apiRequest } = await import('../../src/lib/api-client.js');
      const mockApiRequest = vi.mocked(apiRequest);
      mockApiRequest.mockResolvedValue({
        data: {
          data: [
            {
              bridge_quote_id: 'bq-001',
              status: 'completed',
              src_chain: 'ethereum',
              dst_chain: 'arbitrum',
              token_in: 'ETH',
              token_out: 'USDC',
              amount: '1.5',
              created_at: '2025-01-01T00:00:00Z',
            },
          ],
          total: 1,
        },
        _meta: { source: 'api', age_ms: 0, fresh: true, retries: 0, latency_ms: 50 },
      });

      const program = await createProgram();
      await program.parseAsync([
        'node', 'native', 'bridge', 'history',
        '--address', '0x1234567890123456789012345678901234567890',
      ]);

      expect(mockApiRequest).toHaveBeenCalledTimes(1);
      const [endpoint, params] = mockApiRequest.mock.calls[0]!;
      expect(endpoint).toBe('bridge/tx-history');
      expect(params.address).toBe('0x1234567890123456789012345678901234567890');
    });

    it('shows info message when no transactions found', async () => {
      const { apiRequest } = await import('../../src/lib/api-client.js');
      const mockApiRequest = vi.mocked(apiRequest);
      mockApiRequest.mockResolvedValue({
        data: { data: [], total: 0 },
        _meta: { source: 'api', age_ms: 0, fresh: true, retries: 0, latency_ms: 50 },
      });

      vi.mock('node:tty', () => ({ isatty: () => true }));
      vi.resetModules();

      const program = await createProgram();
      await program.parseAsync([
        'node', 'native', 'bridge', 'history',
        '--address', '0x1234567890123456789012345678901234567890',
      ]);

      const stderrOutput = stderrWrite.mock.calls.map((c) => c[0] as string).join('');
      expect(stderrOutput).toContain('No bridge transactions');
    });

    it('outputs JSON with --json flag', async () => {
      const { apiRequest } = await import('../../src/lib/api-client.js');
      const mockApiRequest = vi.mocked(apiRequest);
      mockApiRequest.mockResolvedValue({
        data: {
          data: [
            {
              bridge_quote_id: 'bq-001',
              status: 'completed',
              src_chain: 'ethereum',
              dst_chain: 'arbitrum',
              token_in: 'ETH',
              token_out: 'USDC',
              amount: '1.5',
            },
          ],
          total: 1,
        },
        _meta: { source: 'api', age_ms: 0, fresh: true, retries: 0, latency_ms: 50 },
      });

      const program = await createProgram();
      await program.parseAsync([
        'node', 'native', '--json', 'bridge', 'history',
        '--address', '0x1234567890123456789012345678901234567890',
      ]);

      expect(stdoutWrite).toHaveBeenCalled();
      const output = (stdoutWrite.mock.calls[0]![0] as string).trim();
      const parsed = JSON.parse(output);
      expect(parsed.data).toBeDefined();
      expect(parsed.data.length).toBe(1);
    });

    it('passes pagination parameters', async () => {
      const { apiRequest } = await import('../../src/lib/api-client.js');
      const mockApiRequest = vi.mocked(apiRequest);
      mockApiRequest.mockResolvedValue({
        data: { data: [], total: 0 },
        _meta: { source: 'api', age_ms: 0, fresh: true, retries: 0, latency_ms: 50 },
      });

      const program = await createProgram();
      await program.parseAsync([
        'node', 'native', 'bridge', 'history',
        '--address', '0x1234567890123456789012345678901234567890',
        '--page-size', '10',
        '--page-index', '2',
      ]);

      const [, params] = mockApiRequest.mock.calls[0]!;
      expect(params.page_size).toBe('10');
      expect(params.page_index).toBe('2');
    });
  });
});
