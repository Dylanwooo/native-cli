import { EXIT_CODES, type ApiErrorBody } from '../types.js';

interface ErrorMapping {
  message: string;
  suggestion: string;
  exitCode: number;
}

const ERROR_MAP: Record<number, ErrorMapping> = {
  201005: {
    message: 'Rate limit exceeded',
    suggestion: 'Wait a moment and try again, or reduce request frequency.',
    exitCode: EXIT_CODES.RATE_LIMITED,
  },
  101010: {
    message: 'Amount exceeds available liquidity',
    suggestion: 'Try reducing the amount or check orderbook depth with `native orderbook`.',
    exitCode: EXIT_CODES.INSUFFICIENT_LIQUIDITY,
  },
  171037: {
    message: 'Empty orderbook',
    suggestion: 'No liquidity available for this pair. Check supported pairs with `native orderbook`.',
    exitCode: EXIT_CODES.INSUFFICIENT_LIQUIDITY,
  },
  301016: {
    message: 'Risk management failure',
    suggestion: 'The transaction was rejected by risk controls. Contact support if this persists.',
    exitCode: EXIT_CODES.RISK_REJECTED,
  },
  405030: {
    message: 'Risk management failure',
    suggestion: 'The transaction was rejected by risk controls. Contact support if this persists.',
    exitCode: EXIT_CODES.RISK_REJECTED,
  },
  131003: {
    message: 'Parameter parsing error',
    suggestion: 'Check your input parameters. Use --help to see valid options.',
    exitCode: EXIT_CODES.USAGE_ERROR,
  },
  131004: {
    message: 'Invalid parameter',
    suggestion:
      'Check that token addresses are valid (0x...), amount is a number,\n' +
      'and chain is one of: ethereum, bsc, arbitrum, base.\n' +
      'Use token contract addresses, not symbols (e.g. 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2 for WETH).',
    exitCode: EXIT_CODES.USAGE_ERROR,
  },
  131005: {
    message: 'Invalid chain parameter',
    suggestion:
      'Use a supported chain name: ethereum, bsc, arbitrum, base.\n' +
      'Set a default: native config set default-chain ethereum',
    exitCode: EXIT_CODES.USAGE_ERROR,
  },
  201009: {
    message: 'Not authorized for this endpoint',
    suggestion:
      'Your API key does not have access to this feature.\n' +
      'Contact Native support to request access, or check your API key:\n' +
      '  native config get api-key',
    exitCode: EXIT_CODES.GENERAL_ERROR,
  },
  171015: {
    message: 'Token pair not supported',
    suggestion:
      'This token pair is not available. Check supported pairs with `native orderbook`\n' +
      'or verify the token addresses are correct.',
    exitCode: EXIT_CODES.GENERAL_ERROR,
  },
  171056: {
    message: 'AMM liquidity not available',
    suggestion:
      'No AMM liquidity is available for this pair/amount.\n' +
      'Try a smaller amount or a different token pair.',
    exitCode: EXIT_CODES.INSUFFICIENT_LIQUIDITY,
  },
  201001: {
    message: 'Authentication error',
    suggestion:
      'There was an issue authenticating your request.\n' +
      'Check your API key: native config get api-key\n' +
      'Or set a new one: native config set api-key YOUR_KEY',
    exitCode: EXIT_CODES.GENERAL_ERROR,
  },
  201006: {
    message: 'Permission denied',
    suggestion:
      'Your API key does not have the required permissions for this operation.\n' +
      'Contact Native support to upgrade your access level.',
    exitCode: EXIT_CODES.GENERAL_ERROR,
  },
};

/** Error codes that should NOT be retried */
export const NON_RETRYABLE_CODES = new Set([101010, 171037, 301016, 405030, 131003, 131004, 131005, 201009, 171015, 171056, 201001, 201006]);

/** Error codes that SHOULD be retried (rate limit) */
export const RETRYABLE_CODES = new Set([201005]);

export class NativeApiError extends Error {
  public readonly code: number | undefined;
  public readonly exitCode: number;
  public readonly suggestion: string;
  private readonly rawBody: ApiErrorBody;

  constructor(body: ApiErrorBody, httpStatus?: number) {
    const code = body.code;
    const mapping = code !== undefined ? ERROR_MAP[code] : undefined;

    const msg = mapping?.message ?? body.message ?? body.error ?? `API error (HTTP ${httpStatus ?? 'unknown'})`;
    super(msg);

    this.name = 'NativeApiError';
    this.code = code;
    this.exitCode = mapping?.exitCode ?? EXIT_CODES.GENERAL_ERROR;
    this.suggestion = mapping?.suggestion ?? 'An unexpected error occurred. Check your parameters and try again.';
    this.rawBody = body;
  }

  format(): string {
    const lines: string[] = [];
    lines.push(`Error: ${this.message}`);
    if (this.code !== undefined) {
      lines.push(`Code: ${this.code}`);
    }
    lines.push(`Suggestion: ${this.suggestion}`);
    return lines.join('\n');
  }
}

export class NativeCliError extends Error {
  public readonly exitCode: number;

  constructor(message: string, exitCode: number = EXIT_CODES.GENERAL_ERROR) {
    super(message);
    this.name = 'NativeCliError';
    this.exitCode = exitCode;
  }
}

export function formatError(err: unknown): { message: string; exitCode: number } {
  if (err instanceof NativeApiError) {
    return { message: err.format(), exitCode: err.exitCode };
  }
  if (err instanceof NativeCliError) {
    return { message: `Error: ${err.message}`, exitCode: err.exitCode };
  }
  if (err instanceof Error) {
    return { message: `Error: ${err.message}`, exitCode: EXIT_CODES.GENERAL_ERROR };
  }
  return { message: `Error: ${String(err)}`, exitCode: EXIT_CODES.GENERAL_ERROR };
}
