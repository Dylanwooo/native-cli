import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'native-config-test-'));
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

async function importConfig() {
  return await import('../../src/lib/config.js');
}

describe('config', () => {
  describe('getConfigValue / setConfigValue', () => {
    it('returns undefined for unset config key', async () => {
      const { getConfigValue } = await importConfig();
      expect(getConfigValue('api-key')).toBeUndefined();
    });

    it('writes and reads a string config value', async () => {
      const { setConfigValue, getConfigValue } = await importConfig();
      const result = setConfigValue('api-key', 'my-secret-key');
      expect(result).toBe(true);
      expect(getConfigValue('api-key')).toBe('my-secret-key');
    });

    it('writes and reads a numeric config value (slippage)', async () => {
      const { setConfigValue, getConfigValue } = await importConfig();
      setConfigValue('slippage', '0.5');
      expect(getConfigValue('slippage')).toBe(0.5);
    });

    it('writes and reads rate_limit_rps as number', async () => {
      const { setConfigValue, getConfigValue } = await importConfig();
      setConfigValue('rate-limit-rps', '15');
      expect(getConfigValue('rate-limit-rps')).toBe(15);
    });

    it('rejects invalid numeric value for slippage', async () => {
      const { setConfigValue } = await importConfig();
      const result = setConfigValue('slippage', 'not-a-number');
      expect(result).toBe(false);
    });

    it('returns false for unknown config key', async () => {
      const { setConfigValue } = await importConfig();
      const result = setConfigValue('unknown-key', 'value');
      expect(result).toBe(false);
    });

    it('returns undefined for unknown config key on get', async () => {
      const { getConfigValue } = await importConfig();
      expect(getConfigValue('nonexistent')).toBeUndefined();
    });

    it('accepts valid rate_limit_strategy values', async () => {
      const { setConfigValue, getConfigValue } = await importConfig();
      expect(setConfigValue('rate-limit-strategy', 'queue')).toBe(true);
      expect(getConfigValue('rate-limit-strategy')).toBe('queue');

      expect(setConfigValue('rate-limit-strategy', 'reject')).toBe(true);
      expect(getConfigValue('rate-limit-strategy')).toBe('reject');

      expect(setConfigValue('rate-limit-strategy', 'degrade')).toBe(true);
      expect(getConfigValue('rate-limit-strategy')).toBe('degrade');
    });

    it('rejects invalid rate_limit_strategy value', async () => {
      const { setConfigValue } = await importConfig();
      expect(setConfigValue('rate-limit-strategy', 'invalid')).toBe(false);
    });

    it('supports both dash and underscore key variants', async () => {
      const { setConfigValue, getConfigValue } = await importConfig();
      setConfigValue('api-url', 'https://example.com');
      expect(getConfigValue('api_url')).toBe('https://example.com');
    });
  });

  describe('listConfig', () => {
    it('returns empty object when no config exists', async () => {
      const { listConfig } = await importConfig();
      expect(listConfig()).toEqual({});
    });

    it('returns all set values', async () => {
      const { setConfigValue, listConfig } = await importConfig();
      setConfigValue('api-key', 'test-key');
      setConfigValue('default-chain', 'arbitrum');

      const config = listConfig();
      expect(config.api_key).toBe('test-key');
      expect(config.default_chain).toBe('arbitrum');
    });
  });

  describe('configPath', () => {
    it('returns path under XDG_CONFIG_HOME/native', async () => {
      const { configPath } = await importConfig();
      const path = configPath();
      expect(path).toContain(tempDir);
      expect(path).toContain('native');
      expect(path).toContain('config.json');
    });
  });

  describe('config file handling', () => {
    it('creates config directory on first write', async () => {
      const { setConfigValue } = await importConfig();
      setConfigValue('api-key', 'test');

      const configDir = join(tempDir, 'native');
      const { existsSync } = await import('node:fs');
      expect(existsSync(configDir)).toBe(true);
    });

    it('handles corrupted config file gracefully', async () => {
      // Write corrupted file
      const configDir = join(tempDir, 'native');
      const { mkdirSync } = await import('node:fs');
      mkdirSync(configDir, { recursive: true });
      writeFileSync(join(configDir, 'config.json'), 'NOT JSON!!!', 'utf-8');

      const { listConfig } = await importConfig();
      // Should return empty defaults, not throw
      expect(listConfig()).toEqual({});
    });
  });

  describe('resolveConfig', () => {
    it('returns defaults when no config file exists', async () => {
      const { resolveConfig } = await importConfig();
      const config = resolveConfig();

      expect(config.apiUrl).toBe('https://v2.api.native.org/swap-api-v2/v1');
      expect(config.chain).toBe('ethereum');
      expect(config.slippage).toBe(0.5);
      expect(config.rateLimitRps).toBe(10);
      expect(config.rateLimitBurst).toBe(20);
      expect(config.rateLimitStrategy).toBe('queue');
      expect(config.apiKey).toBeUndefined();
    });

    it('uses config file values', async () => {
      const { setConfigValue, resolveConfig } = await importConfig();
      setConfigValue('api-key', 'file-key');
      setConfigValue('default-chain', 'bsc');
      setConfigValue('slippage', '1.0');

      const config = resolveConfig();
      expect(config.apiKey).toBe('file-key');
      expect(config.chain).toBe('bsc');
      expect(config.slippage).toBe(1.0);
    });

    it('flag overrides take precedence over file config', async () => {
      const { setConfigValue, resolveConfig } = await importConfig();
      setConfigValue('api-key', 'file-key');
      setConfigValue('default-chain', 'bsc');

      const config = resolveConfig({
        apiKey: 'flag-key',
        chain: 'arbitrum',
      });

      expect(config.apiKey).toBe('flag-key');
      expect(config.chain).toBe('arbitrum');
    });

    it('env vars override file config', async () => {
      const { setConfigValue, resolveConfig } = await importConfig();
      setConfigValue('api-key', 'file-key');

      vi.stubEnv('NATIVE_API_KEY', 'env-key');
      vi.stubEnv('NATIVE_CHAIN', 'base');

      const config = resolveConfig();
      expect(config.apiKey).toBe('env-key');
      expect(config.chain).toBe('base');
    });

    it('flags override env vars', async () => {
      vi.stubEnv('NATIVE_API_KEY', 'env-key');

      const { resolveConfig } = await importConfig();
      const config = resolveConfig({ apiKey: 'flag-key' });
      expect(config.apiKey).toBe('flag-key');
    });
  });

  describe('VALID_CONFIG_KEYS', () => {
    it('exports a list of valid dash-style config keys', async () => {
      const { VALID_CONFIG_KEYS } = await importConfig();
      expect(Array.isArray(VALID_CONFIG_KEYS)).toBe(true);
      expect(VALID_CONFIG_KEYS).toContain('api-key');
      expect(VALID_CONFIG_KEYS).toContain('api-url');
      expect(VALID_CONFIG_KEYS).toContain('default-chain');
      expect(VALID_CONFIG_KEYS).toContain('slippage');
      expect(VALID_CONFIG_KEYS).toContain('rate-limit-rps');
      expect(VALID_CONFIG_KEYS).toContain('rate-limit-burst');
      expect(VALID_CONFIG_KEYS).toContain('rate-limit-strategy');
    });
  });
});
