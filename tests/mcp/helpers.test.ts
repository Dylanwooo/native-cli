import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NativeApiError, NativeCliError } from '../../src/lib/errors.js';
import { formatResult, formatMcpError, resolveChain } from '../../src/mcp/helpers.js';
import type { ApiMeta } from '../../src/types.js';

const META: ApiMeta = {
  source: 'api',
  age_ms: 0,
  fresh: true,
  retries: 0,
  latency_ms: 42,
};

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'native-mcp-helpers-test-'));
  vi.stubEnv('XDG_CONFIG_HOME', tempDir);
  vi.stubEnv('XDG_CACHE_HOME', tempDir);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
  try { rmSync(tempDir, { recursive: true, force: true }); } catch {}
});

describe('formatResult', () => {
  it('wraps data and meta as a single text content block with stringified JSON', () => {
    const result = formatResult({ ok: true, value: 123 }, META);

    expect(result.content).toHaveLength(1);
    expect(result.content[0]!.type).toBe('text');

    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.data).toEqual({ ok: true, value: 123 });
    expect(parsed._meta).toEqual(META);
  });
});

describe('formatMcpError', () => {
  // This is the contract AI agents parse. The [API Error <code>] prefix and
  // the "\n\nSuggestion: " separator are part of that contract — changing
  // either is a breaking change for any agent currently matching on them.

  describe('NativeApiError', () => {
    it('prefixes with [API Error <code>] when the error has a code', () => {
      const err = new NativeApiError({ code: 101010 });
      const result = formatMcpError(err);

      expect(result.isError).toBe(true);
      const text = result.content[0]!.text;
      expect(text).toMatch(/^\[API Error 101010\] /);
      expect(text).toContain('Amount exceeds available liquidity');
      expect(text).toContain('\n\nSuggestion: ');
      expect(text).toContain('orderbook depth');
    });

    it('omits the [API Error] prefix when the error has no code', () => {
      // Unknown/missing code still produces a NativeApiError, but without a
      // mapped code the prefix must not appear.
      const err = new NativeApiError({ message: 'something broke' }, 500);
      const result = formatMcpError(err);

      expect(result.isError).toBe(true);
      const text = result.content[0]!.text;
      expect(text).not.toMatch(/^\[API Error /);
      expect(text).toContain('\n\nSuggestion: ');
    });
  });

  describe('NativeCliError', () => {
    it('uses the raw message with no prefix or suggestion separator', () => {
      const err = new NativeCliError('No API key configured.');
      const result = formatMcpError(err);

      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toBe('No API key configured.');
    });
  });

  describe('plain Error', () => {
    it('uses the raw message', () => {
      const result = formatMcpError(new Error('some runtime error'));

      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toBe('some runtime error');
    });
  });

  describe('non-Error values', () => {
    it.each([
      ['string', 'boom'],
      ['number', 42],
      ['object', { oops: true }],
      ['null', null],
      ['undefined', undefined],
    ])('coerces %s thrown values via String()', (_label, value) => {
      const result = formatMcpError(value);

      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toBe(String(value));
    });
  });

  describe('response shape invariants', () => {
    it('always returns exactly one text content block with isError true', () => {
      const cases: unknown[] = [
        new NativeApiError({ code: 101010 }),
        new NativeApiError({ message: 'no code' }),
        new NativeCliError('cli error'),
        new Error('plain'),
        'string error',
      ];

      for (const err of cases) {
        const result = formatMcpError(err);
        expect(result.isError).toBe(true);
        expect(result.content).toHaveLength(1);
        expect(result.content[0]!.type).toBe('text');
        expect(typeof result.content[0]!.text).toBe('string');
        expect(result.content[0]!.text.length).toBeGreaterThan(0);
      }
    });
  });
});

describe('resolveChain', () => {
  it('returns the provided chain when one is given', () => {
    expect(resolveChain('arbitrum')).toBe('arbitrum');
    expect(resolveChain('base')).toBe('base');
  });

  it('falls back to the default chain from config when no chain is provided', () => {
    // No config file written; resolveConfig falls back to DEFAULT_CHAIN.
    expect(resolveChain()).toBe('ethereum');
  });

  it('respects NATIVE_CHAIN env var as the fallback', () => {
    vi.stubEnv('NATIVE_CHAIN', 'bsc');
    expect(resolveChain()).toBe('bsc');
  });
});
