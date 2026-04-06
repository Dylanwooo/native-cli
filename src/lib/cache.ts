import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import type { CacheEntry, CacheEndpointType } from '../types.js';

// ─── TTLs in milliseconds ───────────────────────────────────────────

const TTL_MAP: Record<CacheEndpointType, number> = {
  tokens: 60 * 60 * 1000,           // 1 hour
  orderbook: 3 * 1000,              // 3 seconds
  indicative_quote: 5 * 1000,       // 5 seconds
  blacklist: 5 * 60 * 1000,         // 5 minutes
  bridge_tx_status: 10 * 1000,      // 10 seconds
  bridge_indicative_quote: 5 * 1000, // 5 seconds
  firm_quote: 0,                     // NEVER cache
  bridge_firm_quote: 0,              // NEVER cache
};

function getCacheDir(): string {
  const xdgCache = process.env['XDG_CACHE_HOME'];
  const base = xdgCache || join(homedir(), '.cache');
  return join(base, 'native');
}

function ensureCacheDir(): void {
  const dir = getCacheDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
}

function cacheKey(endpoint: string, params: Record<string, unknown>): string {
  const sorted = JSON.stringify(params, Object.keys(params).sort());
  const input = `${endpoint}:${sorted}`;
  return createHash('sha256').update(input).digest('hex');
}

function cachePath(key: string): string {
  return join(getCacheDir(), `${key}.json`);
}

// ─── Public API ─────────────────────────────────────────────────────

export function getTTL(endpointType: CacheEndpointType): number {
  return TTL_MAP[endpointType];
}

export function shouldCache(endpointType: CacheEndpointType): boolean {
  return TTL_MAP[endpointType] > 0;
}

export function readCache<T>(
  endpoint: string,
  params: Record<string, unknown>,
  opts?: { maxAge?: number; staleOk?: boolean }
): { data: T; age_ms: number; fresh: boolean } | null {
  const key = cacheKey(endpoint, params);
  const path = cachePath(key);

  if (!existsSync(path)) return null;

  try {
    const raw = readFileSync(path, 'utf-8');
    const entry = JSON.parse(raw) as CacheEntry<T>;
    const age_ms = Date.now() - entry.timestamp;
    const maxAge = opts?.maxAge ?? entry.ttl;
    const fresh = age_ms <= maxAge;

    if (!fresh && !opts?.staleOk) return null;

    return {
      data: entry.data,
      age_ms,
      fresh,
    };
  } catch {
    return null;
  }
}

export function writeCache<T>(
  endpoint: string,
  params: Record<string, unknown>,
  data: T,
  endpointType: CacheEndpointType
): void {
  const ttl = getTTL(endpointType);
  if (ttl <= 0) return;

  ensureCacheDir();

  const key = cacheKey(endpoint, params);
  const path = cachePath(key);
  const entry: CacheEntry<T> = {
    data,
    timestamp: Date.now(),
    ttl,
  };

  try {
    writeFileSync(path, JSON.stringify(entry), { encoding: 'utf-8', mode: 0o600 });
  } catch {
    // Cache write failure is non-fatal
  }
}
