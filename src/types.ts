// ─── Native API Types ───────────────────────────────────────────────

export interface OrderbookLevel {
  price: number;
  liquidity: number;
}

export interface OrderbookEntry {
  base_symbol: string;
  quote_symbol: string;
  base_address?: string;
  quote_address?: string;
  minimum_in_base?: number;
  side?: string;
  // API returns levels as [quantity, price] arrays
  levels: Array<[number, number] | OrderbookLevel>;
  /** @deprecated API uses base_address, not base_token */
  base_token?: string;
  /** @deprecated API uses quote_address, not quote_token */
  quote_token?: string;
  /** @deprecated API uses minimum_in_base, not min_amount */
  min_amount?: string;
}

export interface IndicativeQuoteParams {
  from_address: string;
  src_chain: string;
  dst_chain: string;
  token_in: string;
  token_out: string;
  amount: string;
  slippage?: string;
  allow_multihop?: boolean;
}

export interface IndicativeQuoteResponse {
  success?: boolean;
  buyerToken?: string;
  sellerToken?: string;
  buyerTokenAmount?: string;
  buyerTokenAmountWei?: string;
  sellerTokenAmount?: string;
  sellerTokenAmountWei?: string;
  price?: string;
  routes?: unknown;
  source?: string;
  widgetFeeUsd?: string;
  /** @deprecated Use buyerTokenAmount instead */
  buyAmount?: string;
  /** @deprecated Use sellerTokenAmount instead */
  sellAmount?: string;
  [key: string]: unknown;
}

export interface FirmQuoteParams {
  from_address: string;
  src_chain: string;
  dst_chain: string;
  token_in: string;
  token_out: string;
  amount: string;
  slippage?: string;
  version?: number;
}

export interface TxRequest {
  target: string;
  calldata: string;
  value: string;
  function?: string;
  gas?: string;
  gasPrice?: string;
  /** @deprecated API returns `target`, not `to`. Kept for backward compat with older responses. */
  to?: string;
  /** @deprecated API returns `calldata`, not `data`. Kept for backward compat with older responses. */
  data?: string;
}

export interface FirmQuoteResponse {
  success?: boolean;
  orders?: unknown[];
  price?: string;
  buyerTokenAmount?: string;
  txRequest?: TxRequest;
  /** @deprecated Use buyerTokenAmount instead */
  buyAmount?: string;
  /** @deprecated Use sellerTokenAmount instead */
  sellAmount?: string;
  [key: string]: unknown;
}

export interface TokenInfo {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  chain?: string;
  logoURI?: string;
  [key: string]: unknown;
}

export interface WidgetTokensResponse {
  [chain: string]: TokenInfo[];
}

export interface BlacklistEntry {
  address: string;
  reason?: string;
  [key: string]: unknown;
}

export interface BlacklistResponse {
  data: BlacklistEntry[];
  total?: number;
  page_size?: number;
  page_index?: number;
}

// ─── Bridge Types ───────────────────────────────────────────────────

export interface BridgeIndicativeQuoteParams {
  src_chain: string;
  dst_chain: string;
  token_in: string;
  token_out: string;
  amount: string;
  slippage?: string;
}

export interface BridgeIndicativeQuoteResponse {
  success?: boolean;
  buyerTokenAmount?: string;
  sellerTokenAmount?: string;
  price?: string;
  estimatedTime?: number;
  route?: unknown;
  /** @deprecated Use buyerTokenAmount instead */
  buyAmount?: string;
  /** @deprecated Use sellerTokenAmount instead */
  sellAmount?: string;
  [key: string]: unknown;
}

export interface BridgeFirmQuoteParams {
  from_address: string;
  refund_to: string;
  src_chain: string;
  dst_chain: string;
  token_in: string;
  token_out: string;
  amount: string;
  slippage?: string;
}

export interface BridgeFirmQuoteResponse {
  txRequest?: TxRequest;
  buyerTokenAmount?: string;
  bridge_quote_id?: string;
  /** @deprecated Use buyerTokenAmount instead */
  buyAmount?: string;
  /** @deprecated Use sellerTokenAmount instead */
  sellAmount?: string;
  [key: string]: unknown;
}

export interface BridgeTxStatusResponse {
  status: string;
  bridge_quote_id: string;
  src_tx_hash?: string;
  dst_tx_hash?: string;
  [key: string]: unknown;
}

export interface BridgeTxHistoryEntry {
  bridge_quote_id: string;
  status: string;
  src_chain: string;
  dst_chain: string;
  token_in: string;
  token_out: string;
  amount: string;
  created_at?: string;
  [key: string]: unknown;
}

export interface BridgeTxHistoryResponse {
  data: BridgeTxHistoryEntry[];
  total?: number;
}

// ─── API Client Types ───────────────────────────────────────────────

export interface ApiMeta {
  source: 'api' | 'cache';
  age_ms: number;
  fresh: boolean;
  retries: number;
  latency_ms: number;
  rate_limit_remaining?: number;
}

export interface ApiResponse<T> {
  data: T;
  _meta: ApiMeta;
}

export interface ApiErrorBody {
  code?: number;
  message?: string;
  error?: string;
  [key: string]: unknown;
}

// ─── Cache Types ────────────────────────────────────────────────────

export interface CacheEntry<T = unknown> {
  data: T;
  timestamp: number;
  ttl: number;
}

export type CacheEndpointType =
  | 'tokens'
  | 'orderbook'
  | 'indicative_quote'
  | 'blacklist'
  | 'bridge_tx_status'
  | 'firm_quote'
  | 'bridge_firm_quote'
  | 'bridge_indicative_quote';

// ─── Config Types ───────────────────────────────────────────────────

export interface NativeConfig {
  api_key?: string;
  api_url?: string;
  default_chain?: string;
  slippage?: number;
  rate_limit_rps?: number;
  rate_limit_burst?: number;
  rate_limit_strategy?: RateLimitStrategy;
  request_timeout?: number;
}

export type RateLimitStrategy = 'queue' | 'reject' | 'degrade';

// ─── CLI Options ────────────────────────────────────────────────────

export interface GlobalOptions {
  json?: boolean;
  noColor?: boolean;
  skipCache?: boolean;
  chain?: string;
  apiUrl?: string;
  apiKeyFile?: string;
  maxAge?: number;
  staleOk?: boolean;
}

// ─── Constants ──────────────────────────────────────────────────────

export const SUPPORTED_CHAINS = ['ethereum', 'bsc', 'arbitrum', 'base'] as const;
export type SupportedChain = (typeof SUPPORTED_CHAINS)[number];

export const NATIVE_TOKEN_ADDRESSES = [
  '0x0000000000000000000000000000000000000000',
  '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
] as const;

export const DEFAULT_API_URL = 'https://v2.api.native.org/swap-api-v2/v1';
export const DEFAULT_CHAIN = 'ethereum';
export const DEFAULT_SLIPPAGE = 0.5;
export const FIRM_QUOTE_VERSION = 4;

export const EXIT_CODES = {
  SUCCESS: 0,
  GENERAL_ERROR: 1,
  USAGE_ERROR: 2,
  INSUFFICIENT_LIQUIDITY: 10,
  RATE_LIMITED: 11,
  RISK_REJECTED: 12,
} as const;
