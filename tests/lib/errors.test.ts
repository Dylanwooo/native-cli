import { describe, it, expect } from 'vitest';
import {
  NativeApiError,
  NativeCliError,
  formatError,
  NON_RETRYABLE_CODES,
  RETRYABLE_CODES,
} from '../../src/lib/errors.js';
import { EXIT_CODES } from '../../src/types.js';

describe('NativeApiError', () => {
  describe('known error codes', () => {
    it('maps rate limit error code 201005 to human-readable message', () => {
      const err = new NativeApiError({ code: 201005 });
      expect(err.message).toBe('Rate limit exceeded');
      expect(err.exitCode).toBe(EXIT_CODES.RATE_LIMITED);
      expect(err.suggestion).toContain('Wait');
    });

    it('maps insufficient liquidity error code 101010', () => {
      const err = new NativeApiError({ code: 101010 });
      expect(err.message).toBe('Amount exceeds available liquidity');
      expect(err.exitCode).toBe(EXIT_CODES.INSUFFICIENT_LIQUIDITY);
      expect(err.suggestion).toContain('reducing the amount');
    });

    it('maps empty orderbook error code 171037', () => {
      const err = new NativeApiError({ code: 171037 });
      expect(err.message).toBe('Empty orderbook');
      expect(err.exitCode).toBe(EXIT_CODES.INSUFFICIENT_LIQUIDITY);
    });

    it('maps risk management error code 301016', () => {
      const err = new NativeApiError({ code: 301016 });
      expect(err.message).toBe('Risk management failure');
      expect(err.exitCode).toBe(EXIT_CODES.RISK_REJECTED);
    });

    it('maps risk management error code 405030', () => {
      const err = new NativeApiError({ code: 405030 });
      expect(err.message).toBe('Risk management failure');
      expect(err.exitCode).toBe(EXIT_CODES.RISK_REJECTED);
    });

    it('maps parameter parsing error code 131003', () => {
      const err = new NativeApiError({ code: 131003 });
      expect(err.message).toBe('Parameter parsing error');
      expect(err.exitCode).toBe(EXIT_CODES.USAGE_ERROR);
      expect(err.suggestion).toContain('--help');
    });

    it('maps token pair not supported error code 171015', () => {
      const err = new NativeApiError({ code: 171015 });
      expect(err.message).toBe('Token pair not supported');
      expect(err.exitCode).toBe(EXIT_CODES.GENERAL_ERROR);
    });

    it('maps AMM liquidity not available error code 171056', () => {
      const err = new NativeApiError({ code: 171056 });
      expect(err.message).toBe('AMM liquidity not available');
      expect(err.exitCode).toBe(EXIT_CODES.INSUFFICIENT_LIQUIDITY);
    });

    it('maps authentication error code 201001', () => {
      const err = new NativeApiError({ code: 201001 });
      expect(err.message).toBe('Authentication error');
      expect(err.exitCode).toBe(EXIT_CODES.GENERAL_ERROR);
    });

    it('maps permission denied error code 201006', () => {
      const err = new NativeApiError({ code: 201006 });
      expect(err.message).toBe('Permission denied');
      expect(err.exitCode).toBe(EXIT_CODES.GENERAL_ERROR);
    });

    it('maps not authorized error code 201009', () => {
      const err = new NativeApiError({ code: 201009 });
      expect(err.message).toBe('Not authorized for this endpoint');
      expect(err.exitCode).toBe(EXIT_CODES.GENERAL_ERROR);
    });
  });

  describe('unknown error codes', () => {
    it('uses body message for unknown error code', () => {
      const err = new NativeApiError({ code: 999999, message: 'Custom error' });
      expect(err.message).toBe('Custom error');
      expect(err.exitCode).toBe(EXIT_CODES.GENERAL_ERROR);
    });

    it('uses body error field when message is not available', () => {
      const err = new NativeApiError({ code: 999999, error: 'Some error text' });
      expect(err.message).toBe('Some error text');
    });

    it('uses fallback message when no fields available', () => {
      const err = new NativeApiError({}, 502);
      expect(err.message).toContain('API error');
      expect(err.message).toContain('502');
    });

    it('provides generic suggestion for unknown errors', () => {
      const err = new NativeApiError({ code: 999999 });
      expect(err.suggestion).toContain('unexpected error');
    });
  });

  describe('error properties', () => {
    it('does not expose rawBody publicly', () => {
      const body = { code: 201005, message: 'test', extra: 'data' };
      const err = new NativeApiError(body);
      // rawBody is private — should not be accessible at compile time
      // At runtime we verify it does not appear in format() output
      expect(err.format()).not.toContain('extra');
      expect(err.format()).not.toContain('data');
    });

    it('stores the error code', () => {
      const err = new NativeApiError({ code: 201005 });
      expect(err.code).toBe(201005);
    });

    it('has name NativeApiError', () => {
      const err = new NativeApiError({ code: 201005 });
      expect(err.name).toBe('NativeApiError');
    });
  });

  describe('format()', () => {
    it('includes error message', () => {
      const err = new NativeApiError({ code: 201005 });
      const formatted = err.format();
      expect(formatted).toContain('Error:');
      expect(formatted).toContain('Rate limit exceeded');
    });

    it('includes error code', () => {
      const err = new NativeApiError({ code: 201005 });
      const formatted = err.format();
      expect(formatted).toContain('Code: 201005');
    });

    it('includes suggestion', () => {
      const err = new NativeApiError({ code: 201005 });
      const formatted = err.format();
      expect(formatted).toContain('Suggestion:');
    });

    it('omits code line when code is undefined', () => {
      const err = new NativeApiError({ message: 'no code' });
      const formatted = err.format();
      expect(formatted).not.toContain('Code:');
    });
  });
});

describe('NativeCliError', () => {
  it('has name NativeCliError', () => {
    const err = new NativeCliError('test error');
    expect(err.name).toBe('NativeCliError');
  });

  it('uses default exit code of GENERAL_ERROR', () => {
    const err = new NativeCliError('test');
    expect(err.exitCode).toBe(EXIT_CODES.GENERAL_ERROR);
  });

  it('accepts custom exit code', () => {
    const err = new NativeCliError('usage error', EXIT_CODES.USAGE_ERROR);
    expect(err.exitCode).toBe(EXIT_CODES.USAGE_ERROR);
  });

  it('stores the message', () => {
    const err = new NativeCliError('something broke');
    expect(err.message).toBe('something broke');
  });
});

describe('formatError', () => {
  it('formats NativeApiError with format()', () => {
    const err = new NativeApiError({ code: 201005 });
    const result = formatError(err);
    expect(result.message).toContain('Rate limit exceeded');
    expect(result.exitCode).toBe(EXIT_CODES.RATE_LIMITED);
  });

  it('formats NativeCliError', () => {
    const err = new NativeCliError('CLI error', EXIT_CODES.USAGE_ERROR);
    const result = formatError(err);
    expect(result.message).toContain('CLI error');
    expect(result.exitCode).toBe(EXIT_CODES.USAGE_ERROR);
  });

  it('formats generic Error', () => {
    const err = new Error('generic problem');
    const result = formatError(err);
    expect(result.message).toContain('generic problem');
    expect(result.exitCode).toBe(EXIT_CODES.GENERAL_ERROR);
  });

  it('formats non-Error values', () => {
    const result = formatError('string error');
    expect(result.message).toContain('string error');
    expect(result.exitCode).toBe(EXIT_CODES.GENERAL_ERROR);
  });
});

describe('error code sets', () => {
  it('NON_RETRYABLE_CODES contains business error codes', () => {
    expect(NON_RETRYABLE_CODES.has(101010)).toBe(true);
    expect(NON_RETRYABLE_CODES.has(171037)).toBe(true);
    expect(NON_RETRYABLE_CODES.has(301016)).toBe(true);
    expect(NON_RETRYABLE_CODES.has(405030)).toBe(true);
    expect(NON_RETRYABLE_CODES.has(131003)).toBe(true);
    expect(NON_RETRYABLE_CODES.has(131004)).toBe(true);
    expect(NON_RETRYABLE_CODES.has(131005)).toBe(true);
    expect(NON_RETRYABLE_CODES.has(201009)).toBe(true);
    expect(NON_RETRYABLE_CODES.has(171015)).toBe(true);
    expect(NON_RETRYABLE_CODES.has(171056)).toBe(true);
    expect(NON_RETRYABLE_CODES.has(201001)).toBe(true);
    expect(NON_RETRYABLE_CODES.has(201006)).toBe(true);
  });

  it('RETRYABLE_CODES contains rate limit code', () => {
    expect(RETRYABLE_CODES.has(201005)).toBe(true);
  });

  it('NON_RETRYABLE and RETRYABLE sets do not overlap', () => {
    for (const code of RETRYABLE_CODES) {
      expect(NON_RETRYABLE_CODES.has(code)).toBe(false);
    }
  });
});
