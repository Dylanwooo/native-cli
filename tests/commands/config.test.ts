import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';

// Mock node:tty at module level so isJsonMode() returns false (TTY mode)
// This ensures commands take the human-readable output path in tests
vi.mock('node:tty', () => ({
  isatty: () => true,
}));

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'native-cmd-config-test-'));
  vi.stubEnv('XDG_CONFIG_HOME', tempDir);
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

async function createProgram() {
  const { registerConfigCommand } = await import('../../src/commands/config.js');
  const program = new Command();
  program.option('--json', 'Output as JSON');
  program.exitOverride(); // Prevent process.exit in tests
  registerConfigCommand(program);
  return program;
}

describe('config command', () => {
  let stdoutWrite: ReturnType<typeof vi.spyOn>;
  let stderrWrite: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  describe('config set', () => {
    it('writes a config value', async () => {
      const program = await createProgram();
      await program.parseAsync(['node', 'native', 'config', 'set', 'api-key', 'test-key']);

      // Verify the value was actually written by reading it back
      const { getConfigValue } = await import('../../src/lib/config.js');
      expect(getConfigValue('api-key')).toBe('test-key');
    });

    it('outputs JSON when --json flag is set', async () => {
      const program = await createProgram();
      await program.parseAsync(['node', 'native', '--json', 'config', 'set', 'api-key', 'test-key']);

      expect(stdoutWrite).toHaveBeenCalled();
      const output = (stdoutWrite.mock.calls[0]![0] as string).trim();
      const parsed = JSON.parse(output);
      expect(parsed.key).toBe('api-key');
      expect(parsed.value).toBe('test-key');
      expect(parsed.status).toBe('set');
    });

    it('shows error for invalid key', async () => {
      const program = await createProgram();
      await program.parseAsync(['node', 'native', 'config', 'set', 'invalid-key', 'value']);

      expect(stderrWrite).toHaveBeenCalled();
      const output = stderrWrite.mock.calls.map((c) => c[0] as string).join('');
      expect(output).toContain('Invalid config key');
    });
  });

  describe('config get', () => {
    it('reads a config value', async () => {
      const { setConfigValue } = await import('../../src/lib/config.js');
      setConfigValue('api-key', 'my-key');

      vi.resetModules();
      const program = await createProgram();
      await program.parseAsync(['node', 'native', 'config', 'get', 'api-key']);

      expect(stdoutWrite).toHaveBeenCalled();
      const output = stdoutWrite.mock.calls.map((c) => c[0] as string).join('');
      expect(output).toContain('my-key');
    });

    it('shows error for unset key', async () => {
      const program = await createProgram();
      await program.parseAsync(['node', 'native', 'config', 'get', 'api-key']);

      expect(stderrWrite).toHaveBeenCalled();
      const output = stderrWrite.mock.calls.map((c) => c[0] as string).join('');
      expect(output).toContain('not set');
    });

    it('outputs JSON when --json flag is set', async () => {
      const { setConfigValue } = await import('../../src/lib/config.js');
      setConfigValue('default-chain', 'base');

      vi.resetModules();
      const program = await createProgram();
      await program.parseAsync(['node', 'native', '--json', 'config', 'get', 'default-chain']);

      expect(stdoutWrite).toHaveBeenCalled();
      const output = (stdoutWrite.mock.calls[0]![0] as string).trim();
      const parsed = JSON.parse(output);
      expect(parsed.key).toBe('default-chain');
      expect(parsed.value).toBe('base');
    });

    it('outputs JSON with null for unset key when --json flag is set', async () => {
      const program = await createProgram();
      await program.parseAsync(['node', 'native', '--json', 'config', 'get', 'api-key']);

      expect(stdoutWrite).toHaveBeenCalled();
      const output = (stdoutWrite.mock.calls[0]![0] as string).trim();
      const parsed = JSON.parse(output);
      expect(parsed.key).toBe('api-key');
      expect(parsed.value).toBeNull();
    });
  });

  describe('config list', () => {
    it('shows all config values', async () => {
      const { setConfigValue } = await import('../../src/lib/config.js');
      setConfigValue('api-key', 'list-test-key');
      setConfigValue('default-chain', 'arbitrum');

      vi.resetModules();
      const program = await createProgram();
      await program.parseAsync(['node', 'native', 'config', 'list']);

      expect(stdoutWrite).toHaveBeenCalled();
      const output = stdoutWrite.mock.calls.map((c) => c[0] as string).join('');
      expect(output).toContain('list-test-key');
      expect(output).toContain('arbitrum');
    });

    it('shows message when no config is set', async () => {
      const program = await createProgram();
      await program.parseAsync(['node', 'native', 'config', 'list']);

      expect(stderrWrite).toHaveBeenCalled();
      const output = stderrWrite.mock.calls.map((c) => c[0] as string).join('');
      expect(output).toContain('No configuration set');
    });

    it('outputs JSON when --json flag is set', async () => {
      const { setConfigValue } = await import('../../src/lib/config.js');
      setConfigValue('api-key', 'json-key');

      vi.resetModules();
      const program = await createProgram();
      await program.parseAsync(['node', 'native', '--json', 'config', 'list']);

      expect(stdoutWrite).toHaveBeenCalled();
      const output = (stdoutWrite.mock.calls[0]![0] as string).trim();
      const parsed = JSON.parse(output);
      expect(parsed.api_key).toBe('json-key');
    });

    it('outputs empty JSON object when no config set and --json flag used', async () => {
      const program = await createProgram();
      await program.parseAsync(['node', 'native', '--json', 'config', 'list']);

      expect(stdoutWrite).toHaveBeenCalled();
      const output = (stdoutWrite.mock.calls[0]![0] as string).trim();
      const parsed = JSON.parse(output);
      expect(parsed).toEqual({});
    });
  });

  describe('config path', () => {
    it('shows config file path', async () => {
      const program = await createProgram();
      await program.parseAsync(['node', 'native', 'config', 'path']);

      expect(stdoutWrite).toHaveBeenCalled();
      const output = (stdoutWrite.mock.calls[0]![0] as string).trim();
      expect(output).toContain('native');
      expect(output).toContain('config.json');
    });

    it('outputs JSON when --json flag is set', async () => {
      const program = await createProgram();
      await program.parseAsync(['node', 'native', '--json', 'config', 'path']);

      expect(stdoutWrite).toHaveBeenCalled();
      const output = (stdoutWrite.mock.calls[0]![0] as string).trim();
      const parsed = JSON.parse(output);
      expect(parsed.path).toBeDefined();
      expect(parsed.path).toContain('config.json');
    });
  });
});
