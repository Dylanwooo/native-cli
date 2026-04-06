import type {
  ApiResponse,
  ApiMeta,
  CacheEndpointType,
  ApiErrorBody,
} from '../types.js';
import { resolveConfig, type ResolvedConfig } from './config.js';
import { RateLimiter } from './rate-limiter.js';
import { readCache, writeCache, shouldCache } from './cache.js';
import { NativeApiError, NativeCliError, NON_RETRYABLE_CODES, RETRYABLE_CODES } from './errors.js';
import { EXIT_CODES } from '../types.js';

const MAX_RETRIES = 3;

let _rateLimiter: RateLimiter | null = null;

function getRateLimiter(config: ResolvedConfig): RateLimiter {
  if (!_rateLimiter) {
    _rateLimiter = new RateLimiter(
      config.rateLimitRps,
      config.rateLimitBurst,
      config.rateLimitStrategy
    );
  }
  return _rateLimiter;
}

function buildUrl(baseUrl: string, endpoint: string, params: Record<string, string>): string {
  const url = new URL(endpoint, baseUrl.endsWith('/') ? baseUrl : baseUrl + '/');
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jitter(base: number): number {
  return base + Math.random() * base * 0.5;
}

export interface RequestOptions {
  /** Skip cache read */
  noCache?: boolean;
  /** Custom max age for cache (ms) */
  maxAge?: number;
  /** Accept stale cached data */
  staleOk?: boolean;
  /** Cache endpoint type for TTL resolution */
  cacheType?: CacheEndpointType;
  /** Whether this endpoint requires authentication (default: true) */
  requiresAuth?: boolean;
  /** Override flags for config resolution */
  configOverrides?: {
    apiKey?: string;
    apiKeyFile?: string;
    apiUrl?: string;
    chain?: string;
  };
}

export async function apiRequest<T>(
  endpoint: string,
  params: Record<string, string>,
  opts?: RequestOptions
): Promise<ApiResponse<T>> {
  const config = resolveConfig(opts?.configOverrides);
  const rateLimiter = getRateLimiter(config);
  const cacheType = opts?.cacheType;
  const requiresAuth = opts?.requiresAuth !== false; // default true

  // ── 0. Check for API key ────────────────────────────────────────
  if (requiresAuth && !config.apiKey) {
    throw new NativeCliError(
      'No API key configured. Set one with:\n' +
      '  native config set api-key YOUR_KEY\n' +
      '  or: export NATIVE_API_KEY=YOUR_KEY\n' +
      '  or: native config set-api-key (interactive)',
      EXIT_CODES.USAGE_ERROR
    );
  }

  // ── 1. Check cache ──────────────────────────────────────────────
  if (!opts?.noCache && cacheType && shouldCache(cacheType)) {
    const cached = readCache<T>(endpoint, params, {
      maxAge: opts?.maxAge,
      staleOk: opts?.staleOk,
    });
    if (cached) {
      const meta: ApiMeta = {
        source: 'cache',
        age_ms: cached.age_ms,
        fresh: cached.fresh,
        retries: 0,
        latency_ms: 0,
        rate_limit_remaining: rateLimiter.remaining,
      };
      return { data: cached.data, _meta: meta };
    }
  }

  // ── 2. Rate limit ──────────────────────────────────────────────
  const acquired = await rateLimiter.acquire();
  if (!acquired) {
    // Strategy is reject or degrade
    if (config.rateLimitStrategy === 'degrade' && cacheType && shouldCache(cacheType)) {
      const stale = readCache<T>(endpoint, params, { staleOk: true });
      if (stale) {
        const meta: ApiMeta = {
          source: 'cache',
          age_ms: stale.age_ms,
          fresh: false,
          retries: 0,
          latency_ms: 0,
          rate_limit_remaining: 0,
        };
        return { data: stale.data, _meta: meta };
      }
    }
    throw new NativeCliError('Rate limit exceeded. Try again shortly.', EXIT_CODES.RATE_LIMITED);
  }

  // ── 3. HTTP request with retry ─────────────────────────────────
  const url = buildUrl(config.apiUrl, endpoint, params);
  const headers: Record<string, string> = {
    'Accept': 'application/json',
  };
  if (config.apiKey) {
    headers['apiKey'] = config.apiKey;
  }

  let lastError: Error | null = null;
  let retries = 0;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const start = Date.now();

    try {
      const response = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(config.requestTimeout),
      });
      const latency_ms = Date.now() - start;

      if (response.ok) {
        const data = (await response.json()) as T;

        // Native API sometimes returns errors with HTTP 200 + { code, message }
        const maybeError = data as Record<string, unknown>;
        if (typeof maybeError.code === 'number' && typeof maybeError.message === 'string' && !maybeError.success) {
          const apiError = new NativeApiError(maybeError as ApiErrorBody, response.status);
          throw apiError;
        }

        // Write to cache
        if (cacheType && shouldCache(cacheType)) {
          writeCache(endpoint, params, data, cacheType);
        }

        const meta: ApiMeta = {
          source: 'api',
          age_ms: 0,
          fresh: true,
          retries,
          latency_ms,
          rate_limit_remaining: rateLimiter.remaining,
        };

        return { data, _meta: meta };
      }

      // ── Handle errors ────────────────────────────────────────
      let body: ApiErrorBody;
      try {
        body = (await response.json()) as ApiErrorBody;
      } catch {
        body = { message: `HTTP ${response.status}: ${response.statusText}` };
      }

      const apiError = new NativeApiError(body, response.status);

      // Don't retry business errors
      if (apiError.code !== undefined && NON_RETRYABLE_CODES.has(apiError.code)) {
        throw apiError;
      }

      // Retry on 5xx or retryable codes
      const isRetryable =
        response.status >= 500 ||
        (apiError.code !== undefined && RETRYABLE_CODES.has(apiError.code));

      if (!isRetryable || attempt === MAX_RETRIES) {
        throw apiError;
      }

      lastError = apiError;
      retries++;
      const backoff = jitter(Math.pow(2, attempt) * 500);
      await sleep(backoff);
    } catch (err) {
      if (err instanceof NativeApiError || err instanceof NativeCliError) {
        throw err;
      }
      // Network error
      if (attempt === MAX_RETRIES) {
        const cause = (err as Error).message ?? String(err);
        const lines = [
          `Network error: could not reach the Native API after ${MAX_RETRIES + 1} attempts.`,
          ``,
          `  URL:   ${url}`,
          `  Cause: ${cause}`,
          ``,
          `Possible fixes:`,
          `  • Check your internet connection`,
          `  • Verify the API URL: native config get api-url`,
          `  • Override the URL: native --api-url https://... orderbook`,
          `  • If behind a proxy, set HTTPS_PROXY env var`,
        ];
        throw new NativeCliError(lines.join('\n'), EXIT_CODES.GENERAL_ERROR);
      }
      lastError = err as Error;
      retries++;
      const backoff = jitter(Math.pow(2, attempt) * 500);
      await sleep(backoff);
    }
  }

  // Should not reach here, but just in case
  throw lastError ?? new NativeCliError('Unexpected error in API client');
}
