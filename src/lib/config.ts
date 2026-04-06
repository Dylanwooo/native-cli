import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { NativeConfig, RateLimitStrategy } from '../types.js';
import { DEFAULT_API_URL, DEFAULT_CHAIN, DEFAULT_SLIPPAGE } from '../types.js';

function getConfigDir(): string {
  const xdgConfig = process.env['XDG_CONFIG_HOME'];
  const base = xdgConfig || join(homedir(), '.config');
  return join(base, 'native');
}

function getConfigPath(): string {
  return join(getConfigDir(), 'config.json');
}

export function configPath(): string {
  return getConfigPath();
}

function ensureConfigDir(): void {
  const dir = getConfigDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
}

function readConfigFile(): NativeConfig {
  const path = getConfigPath();
  if (!existsSync(path)) {
    return {};
  }
  try {
    const raw = readFileSync(path, 'utf-8');
    return JSON.parse(raw) as NativeConfig;
  } catch {
    return {};
  }
}

function writeConfigFile(config: NativeConfig): void {
  ensureConfigDir();
  const path = getConfigPath();
  writeFileSync(path, JSON.stringify(config, null, 2) + '\n', { encoding: 'utf-8', mode: 0o600 });
}

// ─── Config key mapping ─────────────────────────────────────────────

const CONFIG_KEY_MAP: Record<string, keyof NativeConfig> = {
  'api-key': 'api_key',
  'api_key': 'api_key',
  'api-url': 'api_url',
  'api_url': 'api_url',
  'default-chain': 'default_chain',
  'default_chain': 'default_chain',
  'slippage': 'slippage',
  'rate-limit-rps': 'rate_limit_rps',
  'rate_limit_rps': 'rate_limit_rps',
  'rate-limit-burst': 'rate_limit_burst',
  'rate_limit_burst': 'rate_limit_burst',
  'rate-limit-strategy': 'rate_limit_strategy',
  'rate_limit_strategy': 'rate_limit_strategy',
  'request-timeout': 'request_timeout',
  'request_timeout': 'request_timeout',
};

function normalizeKey(key: string): keyof NativeConfig | undefined {
  return CONFIG_KEY_MAP[key];
}

function coerceValue(key: keyof NativeConfig, value: string): string | number | undefined {
  switch (key) {
    case 'slippage':
    case 'rate_limit_rps':
    case 'rate_limit_burst':
    case 'request_timeout': {
      const n = Number(value);
      if (Number.isNaN(n)) return undefined;
      return n;
    }
    case 'rate_limit_strategy': {
      if (['queue', 'reject', 'degrade'].includes(value)) return value;
      return undefined;
    }
    default:
      return value;
  }
}

// ─── Public API ─────────────────────────────────────────────────────

export function getConfigValue(key: string): string | number | undefined {
  const normalized = normalizeKey(key);
  if (!normalized) return undefined;
  const config = readConfigFile();
  return config[normalized] as string | number | undefined;
}

export function setConfigValue(key: string, value: string): boolean {
  const normalized = normalizeKey(key);
  if (!normalized) return false;

  const coerced = coerceValue(normalized, value);
  if (coerced === undefined) return false;

  const config = readConfigFile();
  (config as Record<string, unknown>)[normalized] = coerced;
  writeConfigFile(config);
  return true;
}

export function listConfig(): NativeConfig {
  return readConfigFile();
}

/**
 * Resolve a config value with precedence: flags > env vars > config file > defaults
 */
export interface ResolvedConfig {
  apiKey: string | undefined;
  apiUrl: string;
  chain: string;
  slippage: number;
  rateLimitRps: number;
  rateLimitBurst: number;
  rateLimitStrategy: RateLimitStrategy;
  requestTimeout: number;
}

export function resolveConfig(flags?: {
  apiKey?: string;
  apiKeyFile?: string;
  apiUrl?: string;
  chain?: string;
  slippage?: number;
}): ResolvedConfig {
  const file = readConfigFile();

  // Resolve API key: flags.apiKey > apiKeyFile > env var > config file
  let apiKey: string | undefined = flags?.apiKey;
  if (apiKey === undefined && flags?.apiKeyFile) {
    apiKey = readApiKeyFile(flags.apiKeyFile);
  }

  return {
    apiKey:
      apiKey ??
      process.env['NATIVE_API_KEY'] ??
      file.api_key ??
      undefined,
    apiUrl:
      flags?.apiUrl ??
      process.env['NATIVE_API_URL'] ??
      file.api_url ??
      DEFAULT_API_URL,
    chain:
      flags?.chain ??
      process.env['NATIVE_CHAIN'] ??
      file.default_chain ??
      DEFAULT_CHAIN,
    slippage:
      flags?.slippage ??
      (file.slippage !== undefined ? file.slippage : DEFAULT_SLIPPAGE),
    rateLimitRps: file.rate_limit_rps ?? 10,
    rateLimitBurst: file.rate_limit_burst ?? 20,
    rateLimitStrategy: file.rate_limit_strategy ?? 'queue',
    requestTimeout: file.request_timeout ?? 30_000,
  };
}

/**
 * Read an API key from a file path. Returns the trimmed contents.
 * Throws if the file cannot be read.
 */
export function readApiKeyFile(filePath: string): string {
  const content = readFileSync(filePath, 'utf-8').trim();
  if (content.length === 0) {
    throw new Error(`API key file is empty: ${filePath}`);
  }
  return content;
}

/** Canonical key names (kebab-case preferred, with slippage as-is) */
export const VALID_CONFIG_KEYS = [
  ...Object.keys(CONFIG_KEY_MAP).filter((k) => k.includes('-')),
  'slippage',
];
