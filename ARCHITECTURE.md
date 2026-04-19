# Architecture

This document is the map of the codebase. Read it first when adding features or
fixing bugs. Kept intentionally short — update it only when the shape of the
system changes, not on every code change.

## Overview

`nativefi-cli` exposes the Native liquidity platform through two surfaces that
share a single core:

- **CLI** (`native`) — a human-facing command-line tool built on Commander.
- **MCP server** (`native-mcp`) — a Model Context Protocol server that lets AI
  agents call the same functionality as tools.

Both surfaces are thin shells. All real work — HTTP, caching, rate limiting,
config resolution, error mapping, token resolution — lives in `src/lib/`.

```
         ┌──────────────────┐      ┌──────────────────────┐
 User ──▶│  bin/native      │      │  bin/native-mcp      │◀── AI agent
         │  src/index.ts    │      │  src/mcp-server.ts   │
         └────────┬─────────┘      └──────────┬───────────┘
                  │                           │
                  ▼                           ▼
         ┌──────────────────┐      ┌──────────────────────┐
         │  src/commands/*  │      │  src/mcp/tools/*     │
         │  (thin shells)   │      │  (thin shells)       │
         └────────┬─────────┘      └──────────┬───────────┘
                  │                           │
                  └─────────────┬─────────────┘
                                ▼
                       ┌────────────────┐
                       │   src/lib/*    │  ← all real logic
                       └────────┬───────┘
                                ▼
                       Native API (HTTPS)
```

## Codemap

### Entry points

- `src/index.ts` — CLI entry. Declares global Commander flags, registers every
  `src/commands/*` module.
- `src/mcp-server.ts` — MCP entry. Constructs `McpServer`, calls
  `registerAllTools`.
- `bin/native.js` / `bin/native-mcp.js` — thin shebangs that execute the above.

### User-facing shells

- `src/commands/*.ts` — one file per CLI command (`quote`, `swap`, `orderbook`,
  `tokens`, `bridge`, `config`). Each exports `register<Name>Command(program)`.
  Shape: parse flags → resolve config → call `lib/` → format output.
- `src/mcp/tools/*.ts` — one file per MCP tool. Each exports
  `register<Name>Tool(server)`. Shape: validate Zod input → call `lib/` →
  return `formatResult` / `formatMcpError`.
- `src/mcp/register-tools.ts` — aggregates all MCP tool registrations.
- `src/mcp/helpers.ts` — MCP-specific formatting (`formatResult`,
  `formatMcpError`, `resolveChain`).
- `src/mcp/data/docs.ts`, `src/mcp/data/examples.ts` — bundled docs and code
  samples served by `native_search_docs` / `native_get_examples` (no network).

### Core (`src/lib/`)

- `api-client.ts` — **the only place that calls `fetch`.** Handles auth header,
  rate limiting, caching, retry with jitter, and the Native API's HTTP-200-
  with-error-body convention. Exports `apiRequest<T>(endpoint, params, opts)`.
- `config.ts` — resolves config with precedence `flags > env > file > defaults`.
  File lives at `$XDG_CONFIG_HOME/native/config.json` (mode 0600). Exports
  `resolveConfig()`, `getConfigValue()`, `setConfigValue()`.
- `cache.ts` — TTL-based on-disk cache at `$XDG_CACHE_HOME/native/*.json`. TTLs
  are declared once in `TTL_MAP`. Cache key = sha256(endpoint + sorted params).
- `rate-limiter.ts` — token bucket with three strategies (`queue`, `reject`,
  `degrade`).
- `errors.ts` — `NativeApiError` (wraps API response codes), `NativeCliError`
  (internal CLI errors), `ERROR_MAP` (code → human message + suggestion +
  exit code), `NON_RETRYABLE_CODES` / `RETRYABLE_CODES`.
- `token-resolver.ts` — turns symbols (`ETH`, `USDC`) into contract addresses by
  calling the `widget-tokens` endpoint. Addresses (`0x…`) pass through.
- `output.ts` — CLI-only formatting: tables, key/value pairs, colors, JSON
  mode. Respects `--json` and `NO_COLOR`.

### Shared types

- `src/types.ts` — **every** shared type, plus constants (`SUPPORTED_CHAINS`,
  `DEFAULT_API_URL`, `EXIT_CODES`, `CacheEndpointType` union). Request/response
  shapes for the Native API live here.

## Invariants

These are load-bearing. Break them and things silently go wrong.

1. **All HTTP goes through `apiRequest()`.** Never call `fetch` directly from
   `commands/`, `mcp/tools/`, or anywhere else — you'd bypass rate limiting,
   caching, retry, auth, and the HTTP-200-with-error handling.
2. **`commands/` and `mcp/tools/` never import each other.** They are parallel
   shells over the same `lib/`. Shared helpers go in `lib/` or `mcp/helpers.ts`.
3. **Firm quotes must never be cached.** `firm_quote` and `bridge_firm_quote`
   have TTL `0` in `cache.ts`. They include on-chain calldata and are
   single-use. Do not add them to the positive-TTL list.
4. **Symbol → address resolution always goes through `resolveToken()`.** Do not
   sprinkle symbol lookups across commands/tools.
5. **Errors are typed.** Throw `NativeCliError` for user-facing CLI issues,
   `NativeApiError` (constructed by `api-client.ts`) for API responses. CLI
   layer formats via `formatError()`; MCP layer formats via `formatMcpError()`.
6. **Exit codes live in `EXIT_CODES` (`src/types.ts`)** — do not invent new
   numeric exits at call sites.
7. **Output helpers in `lib/output.ts` are CLI-only.** MCP tools must return
   content blocks via `formatResult` / `formatMcpError` instead.

## How to add things

### A new CLI command

1. Create `src/commands/<name>.ts`, export
   `register<Name>Command(program: Command)`.
2. Call `resolveConfig()` and `apiRequest()` from `lib/`.
3. Support `--json` via `isJsonMode(globalOpts.json)` and use `lib/output.ts`
   for non-JSON output.
4. Register it in `src/index.ts`.
5. Add a test under `tests/`.

### A new MCP tool

1. Create `src/mcp/tools/<name>.ts`, export
   `register<Name>Tool(server: McpServer)`.
2. Define inputs with Zod; add `.describe(...)` on every field — the
   description is what the AI sees.
3. Wrap the body in `try/catch`; return `formatResult(data, meta)` on success,
   `formatMcpError(err)` on failure.
4. Register it in `src/mcp/register-tools.ts`.
5. If it shadows a CLI feature, reuse the same `lib/` call — do not re-
   implement.

### A new Native API endpoint

1. Add request/response types to `src/types.ts`.
2. Call it via `apiRequest<ResponseType>(endpoint, params, opts)`.
3. If it is cacheable: add the name to `CacheEndpointType` in `types.ts` and a
   TTL in `TTL_MAP` in `cache.ts`. Pass `{ cacheType: '<name>' }` to
   `apiRequest`. **Anything carrying calldata or a one-shot token → TTL 0.**
4. If it is public (no API key): pass `{ requiresAuth: false }`.

### A new API error code

1. Add an entry to `ERROR_MAP` in `src/lib/errors.ts` with `message`,
   `suggestion`, and `exitCode`.
2. Add the code to `NON_RETRYABLE_CODES` (default) or `RETRYABLE_CODES`.

### A new config key

1. Add the field to `NativeConfig` in `src/types.ts`.
2. Add aliases to `CONFIG_KEY_MAP` in `src/lib/config.ts` and coercion in
   `coerceValue`.
3. Surface it in `ResolvedConfig` / `resolveConfig()` with the
   `flags > env > file > default` precedence.

## Gotchas

- **The Native API sometimes returns errors with HTTP 200** and a body like
  `{ code: 131004, message: "...", success: false }`. `api-client.ts` converts
  these into `NativeApiError`. Do not second-guess that conversion at call
  sites.
- **`ETH` / `BNB` are placeholders**, not real ERC-20s. `token-resolver.ts`
  maps both to `0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE`.
- **MCP tool descriptions are part of the contract** — an AI agent picks tools
  by description. Editing them is an API change, not a doc change.
- **API keys must stay out of logs.** Never print `config.apiKey` or log request
  headers. `lib/output.ts` is the only sanctioned printer.
