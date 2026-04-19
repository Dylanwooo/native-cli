# Instructions for AI agents working in this repo

**Read [ARCHITECTURE.md](./ARCHITECTURE.md) before editing any code.** It
contains the codemap, load-bearing invariants, and step-by-step recipes for
adding new CLI commands, MCP tools, API endpoints, error codes, and config
keys. Skimming it saves a lot of wrong turns.

## Quick rules

- **All HTTP goes through `apiRequest()` in `src/lib/api-client.ts`.** Never
  call `fetch` directly from `commands/` or `mcp/tools/`.
- **`src/commands/` and `src/mcp/tools/` never import each other.** Shared
  logic belongs in `src/lib/`.
- **Firm quotes (`firm_quote`, `bridge_firm_quote`) must never be cached.**
  TTL stays `0` in `src/lib/cache.ts`.
- **Symbols → addresses always via `resolveToken()`** in
  `src/lib/token-resolver.ts`.
- **Errors are typed.** Throw `NativeCliError` or `NativeApiError`; format via
  `formatError()` (CLI) or `formatMcpError()` (MCP). Exit codes live in
  `EXIT_CODES` in `src/types.ts`.
- **Publishing to npm is done by the user** (requires 2FA OTP). Do not run
  `npm publish`.

## Tests

```
pnpm test        # vitest run
pnpm lint        # tsc --noEmit
```

Run both before declaring a change done.
