import type { ApiMeta } from '../types.js';
import { NativeApiError, NativeCliError } from '../lib/errors.js';
import { resolveConfig } from '../lib/config.js';

/**
 * Format a successful API result as MCP content blocks.
 */
export function formatResult(data: unknown, meta: ApiMeta): { content: Array<{ type: 'text'; text: string }> } {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({ data, _meta: meta }, null, 2),
      },
    ],
  };
}

/**
 * Format an error as an MCP error response.
 */
export function formatMcpError(err: unknown): { content: Array<{ type: 'text'; text: string }>; isError: true } {
  let message: string;

  if (err instanceof NativeApiError) {
    message = `${err.message}\n\nSuggestion: ${err.suggestion}`;
    if (err.code !== undefined) {
      message = `[API Error ${err.code}] ${message}`;
    }
  } else if (err instanceof NativeCliError) {
    message = err.message;
  } else if (err instanceof Error) {
    message = err.message;
  } else {
    message = String(err);
  }

  return {
    content: [{ type: 'text' as const, text: message }],
    isError: true,
  };
}

/**
 * Resolve chain from tool input, falling back to user config.
 */
export function resolveChain(chain?: string): string {
  if (chain) return chain;
  const config = resolveConfig();
  return config.chain;
}
