# nativefi-cli

> On-chain token liquidity from your terminal. Quotes, swaps, and cross-chain bridges -- for humans and AI agents. Now with MCP server for Claude, Cursor, and any AI agent.

[![npm version](https://img.shields.io/npm/v/nativefi-cli.svg)](https://www.npmjs.com/package/nativefi-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

nativefi-cli wraps the [Native](https://native.org) liquidity platform into a single command-line tool. It provides real-time orderbook data, token swap quotes, executable calldata for on-chain transactions, and cross-chain bridge operations across Ethereum, BSC, Arbitrum, and Base.

Every command supports `--json` output with metadata, making the CLI equally useful as a building block for automated trading agents and scripts.

---

## Quick Start

```bash
npm install -g native-cli

native config set api-key YOUR_API_KEY

native quote --from ETH --to USDC --amount 10 --address 0xYourWallet --chain arbitrum
```

That is it. You have a price quote for swapping 10 ETH to USDC on Arbitrum.

---

## Installation

**Prerequisites**: Node.js 18+

```bash
# npm
npm install -g native-cli

# pnpm
pnpm add -g native-cli
```

Verify the installation:

```bash
native --version
```

---

## Configuration

### Set your API key

You need a Native API key to use this CLI. Set it once and it persists across sessions:

```bash
native config set api-key YOUR_API_KEY
```

### Set a default chain

Avoid passing `--chain` on every command:

```bash
native config set default-chain arbitrum
```

### Set default slippage

```bash
native config set slippage 0.5
```

### View your configuration

```bash
# Show a single value
native config get api-key

# Show all configuration
native config list

# Show the config file path
native config path
# ~/.config/native/config.json
```

### Config precedence

Configuration is resolved in the following order (highest priority first):

| Priority | Source | Example |
|----------|--------|---------|
| 1 | Command-line flags | `--api-key sk-xxx` |
| 2 | Environment variables | `NATIVE_API_KEY=sk-xxx` |
| 3 | Config file | `~/.config/native/config.json` |
| 4 | Built-in defaults | chain: `ethereum`, slippage: `0.5` |

---

## Usage

### Get a price quote

```bash
native quote --from ETH --to USDC --amount 10 --address 0xYourWallet --chain arbitrum
```

```
  Pair:     ETH -> USDC
  Chain:    arbitrum
  Amount:   10 ETH
  Quote:    18,342.50 USDC
  Price:    1 ETH = 1,834.25 USDC
```

With `--json`:

```bash
native quote --from ETH --to USDC --amount 10 --address 0xYourWallet --chain arbitrum --json
```

```json
{
  "data": {
    "from": "ETH",
    "to": "USDC",
    "amount": "10",
    "quote": "18342.50",
    "price": "1834.25",
    "chain": "arbitrum"
  },
  "_meta": {
    "source": "api",
    "age_ms": 0,
    "fresh": true,
    "retries": 0,
    "latency_ms": 82
  }
}
```

### View the orderbook

```bash
native orderbook --pair ETH/USDC --chain arbitrum
```

```bash
# Show all pairs across all chains
native orderbook
```

### Execute a swap

```bash
native swap --from ETH --to USDC --amount 10 --address 0xYourWallet --chain arbitrum
```

Use `--dry-run` to preview without generating executable calldata:

```bash
native swap --from ETH --to USDC --amount 10 --address 0xYourWallet --dry-run
```

Set slippage tolerance (default: 0.5%):

```bash
native swap --from ETH --to USDC --amount 10 --address 0xYourWallet --slippage 1.0
```

### List supported tokens

```bash
native tokens --chain arbitrum
```

### Cross-chain bridge

Get a cross-chain quote:

```bash
native bridge quote --from ETH --to USDC --amount 10 --src-chain ethereum --dst-chain arbitrum
```

Execute a cross-chain swap:

```bash
native bridge swap \
  --from ETH --to USDC --amount 10 \
  --src-chain ethereum --dst-chain arbitrum \
  --address 0xYourWallet \
  --refund-to 0xYourWallet
```

Check transaction status:

```bash
native bridge status --id brg_abc123
```

View bridge history:

```bash
native bridge history --address 0xYourWallet --page-size 20
```

---

## Commands Reference

### native quote

Get an indicative (non-binding) price quote for a token swap.

```bash
native quote --from <token> --to <token> --amount <number> --address <0x...> [options]
```

| Flag | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `--from` | string | Yes | -- | Source token symbol (e.g., ETH, USDC) |
| `--to` | string | Yes | -- | Destination token symbol |
| `--amount` | number | Yes | -- | Amount of source token to swap (human-readable, e.g. 1 = 1 ETH) |
| `--address` | string | Yes | -- | Your wallet address (required by the API) |
| `--chain` | string | No | config default | Target chain |
| `--multihop` | flag | No | false | Allow multi-hop routing for better rates |
| `--json` | flag | No | false | Output structured JSON |

### native swap

Get a firm quote with executable transaction data (calldata). This is the command you use to actually execute a trade.

```bash
native swap --from <token> --to <token> --amount <number> --address <0x...> [options]
```

| Flag | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `--from` | string | Yes | -- | Source token symbol |
| `--to` | string | Yes | -- | Destination token symbol |
| `--amount` | number | Yes | -- | Amount of source token to swap |
| `--address` | string | Yes | -- | Wallet address that will execute the swap |
| `--chain` | string | No | config default | Target chain |
| `--slippage` | number | No | `0.5` | Slippage tolerance in percent |
| `--dry-run` | flag | No | false | Preview the swap without generating calldata |
| `--json` | flag | No | false | Output structured JSON |

### native orderbook

Show real-time orderbook depth for trading pairs.

```bash
native orderbook [options]
```

| Flag | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `--pair` | string | No | all pairs | Trading pair (e.g., ETH/USDC) |
| `--chain` | string | No | config default | Target chain |
| `--json` | flag | No | false | Output structured JSON |

### native tokens

List all supported tokens.

```bash
native tokens [options]
```

| Flag | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `--chain` | string | No | all chains | Filter by chain |
| `--json` | flag | No | false | Output structured JSON |

### native bridge quote

Get a cross-chain swap quote.

```bash
native bridge quote --from <token> --to <token> --amount <number> --src-chain <chain> --dst-chain <chain> [options]
```

| Flag | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `--from` | string | Yes | -- | Source token symbol |
| `--to` | string | Yes | -- | Destination token symbol |
| `--amount` | number | Yes | -- | Amount of source token |
| `--src-chain` | string | Yes | -- | Source chain |
| `--dst-chain` | string | Yes | -- | Destination chain |
| `--json` | flag | No | false | Output structured JSON |

### native bridge swap

Execute a cross-chain swap.

```bash
native bridge swap --from <token> --to <token> --amount <number> --src-chain <chain> --dst-chain <chain> --address <0x...> --refund-to <0x...> [options]
```

| Flag | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `--from` | string | Yes | -- | Source token symbol |
| `--to` | string | Yes | -- | Destination token symbol |
| `--amount` | number | Yes | -- | Amount of source token |
| `--src-chain` | string | Yes | -- | Source chain |
| `--dst-chain` | string | Yes | -- | Destination chain |
| `--address` | string | Yes | -- | Destination wallet address |
| `--refund-to` | string | Yes | -- | Refund address if bridge fails |
| `--slippage` | number | No | `0.5` | Slippage tolerance in percent |
| `--dry-run` | flag | No | false | Preview without executing |
| `--json` | flag | No | false | Output structured JSON |

### native bridge status

Check cross-chain transaction status.

```bash
native bridge status --id <bridge_quote_id> [options]
```

| Flag | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `--id` | string | Yes | -- | Bridge quote ID returned from `bridge swap` |
| `--json` | flag | No | false | Output structured JSON |

### native bridge history

View cross-chain transaction history for a wallet.

```bash
native bridge history --address <0x...> [options]
```

| Flag | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `--address` | string | Yes | -- | Wallet address |
| `--page-size` | number | No | `20` | Number of results per page |
| `--json` | flag | No | false | Output structured JSON |

### native config

Manage CLI configuration.

```bash
native config <subcommand> [args]
```

| Subcommand | Description |
|------------|-------------|
| `set <key> <value>` | Set a config value (`api-key`, `default-chain`, `slippage`) |
| `get <key>` | Read a single config value |
| `list` | Print all config values |
| `path` | Print the config file path |

### Global Flags

These flags work with every command:

| Flag | Type | Description |
|------|------|-------------|
| `--json` | flag | Output structured JSON (for scripts and AI agents) |
| `--no-color` | flag | Disable colored terminal output |
| `--skip-cache` | flag | Bypass local cache, always hit the API |
| `--chain <chain>` | string | Override the default chain for this invocation |
| `--api-key <key>` | string | Override the API key for this invocation |
| `--api-url <url>` | string | Override the API base URL |

---

## For AI Agents

native-cli is designed to be called by LLMs, agent frameworks, and automated scripts. This section covers everything an agent needs to integrate reliably.

### Use `--json` for all commands

Always pass `--json`. The structured output is stable and parseable. Without it, you get human-formatted tables and colors that are difficult to parse programmatically.

```bash
native quote --from ETH --to USDC --amount 10 --address 0xYourWallet --chain arbitrum --json
```

Every JSON response has the same envelope:

```json
{
  "data": { ... },
  "_meta": {
    "source": "cache" | "api",
    "age_ms": 2800,
    "fresh": true,
    "retries": 0,
    "latency_ms": 82
  }
}
```

### The `_meta` field

| Field | Type | Description |
|-------|------|-------------|
| `source` | `"cache"` or `"api"` | Whether the response came from local cache or a live API call |
| `age_ms` | number | Age of the data in milliseconds (0 if from API) |
| `fresh` | boolean | Whether the data is within its freshness window |
| `retries` | number | Number of retries needed to get this response |
| `latency_ms` | number | Round-trip time to the API in milliseconds |

Use `_meta.source` and `_meta.fresh` to decide whether to trust a cached result or force a refresh with `--skip-cache`.

### The `--dry-run` pattern

Before executing a swap, preview it:

```bash
# Step 1: Get indicative quote (--address is required)
native quote --from ETH --to USDC --amount 10 --address 0x... --chain arbitrum --json

# Step 2: Dry-run the swap to see firm pricing without generating calldata
native swap --from ETH --to USDC --amount 10 --address 0x... --dry-run --json

# Step 3: Execute when ready
native swap --from ETH --to USDC --amount 10 --address 0x... --json
```

This three-step pattern (quote, dry-run, execute) gives agents a safe way to preview costs and parameters before committing.

### Exit codes

Parse the exit code to determine what happened without parsing stderr:

| Code | Meaning | Agent action |
|------|---------|-------------|
| `0` | Success | Parse stdout JSON |
| `1` | General error | Log and retry with backoff |
| `2` | Usage error (bad flags, missing args) | Fix the command syntax |
| `10` | Insufficient liquidity | Try a smaller amount, different pair, or different chain |
| `11` | Rate limited | Wait and retry (check `Retry-After` if available) |
| `12` | Risk rejected | The swap was blocked by risk checks; do not retry |

### Example: agent integration (pseudo-code)

```python
import subprocess, json

result = subprocess.run(
    ["native", "quote", "--from", "ETH", "--to", "USDC",
     "--amount", "10", "--address", "0xYourWallet",
     "--chain", "arbitrum", "--json"],
    capture_output=True, text=True
)

if result.returncode == 0:
    data = json.loads(result.stdout)
    quote = data["data"]["quote"]
    is_fresh = data["_meta"]["fresh"]
    print(f"Quote: {quote} USDC (fresh: {is_fresh})")
elif result.returncode == 10:
    print("Insufficient liquidity -- try a smaller amount")
elif result.returncode == 11:
    print("Rate limited -- back off and retry")
else:
    print(f"Error (code {result.returncode}): {result.stderr}")
```

### Referencing native tokens

When swapping native chain tokens (ETH on Ethereum/Arbitrum, BNB on BSC), use the symbol directly:

```bash
native quote --from ETH --to USDC --amount 1 --address 0xYourWallet --json
```

If you need to reference native tokens by address (for example, when integrating with on-chain contracts), use either of these standard addresses:

- `0x0000000000000000000000000000000000000000`
- `0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE`

### Suppressing color

If you are parsing stdout as text instead of using `--json`, disable color codes:

```bash
native quote --from ETH --to USDC --amount 1 --address 0xYourWallet --no-color
```

Or set the `NO_COLOR` environment variable (respected by the CLI per the [NO_COLOR standard](https://no-color.org)):

```bash
NO_COLOR=1 native quote --from ETH --to USDC --amount 1 --address 0xYourWallet
```

---

## MCP Server

nativefi-cli includes a built-in [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server. This lets AI agents like Claude, Cursor, and any MCP-compatible client discover and call DeFi tools directly -- no shell commands, no output parsing.

### Setup

```bash
# Install once
npm install -g nativefi-cli

# Set your API key
native config set api-key YOUR_API_KEY
```

### Connect to Claude Code

```bash
claude mcp add nativefi -- native-mcp
```

That's it. Claude now has 8 DeFi tools available. Ask it anything:

> *"What's ETH trading at on Arbitrum?"*
> *"Compare 10 ETH to USDC prices across all chains"*
> *"Get me executable calldata to swap 5 ETH to USDC"*

### Connect to Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "nativefi": {
      "command": "native-mcp",
      "env": {
        "NATIVE_API_KEY": "YOUR_API_KEY"
      }
    }
  }
}
```

### Connect to Cursor

Add to `.cursor/mcp.json` in your project:

```json
{
  "mcpServers": {
    "nativefi": {
      "command": "native-mcp",
      "env": {
        "NATIVE_API_KEY": "YOUR_API_KEY"
      }
    }
  }
}
```

### Available Tools

The MCP server exposes 8 tools. All return structured JSON with `data` and `_meta` fields.

**Trading**

| Tool | Description |
|------|-------------|
| `native_get_quote` | Get an indicative (non-binding) price quote for a token swap |
| `native_get_swap_quote` | Get a firm quote with executable transaction calldata |
| `native_get_orderbook` | Show real-time orderbook depth for trading pairs |
| `native_list_tokens` | List all supported tokens, optionally filtered by chain |

**Cross-chain Bridge**

| Tool | Description |
|------|-------------|
| `native_bridge_quote` | Get an indicative cross-chain bridge quote |
| `native_bridge_swap` | Get a firm cross-chain swap quote with calldata |
| `native_bridge_status` | Check the status of a bridge transaction |
| `native_bridge_history` | View bridge transaction history for a wallet |

### Tool Parameters

**native_get_quote**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `from` | string | Yes | Source token symbol (e.g. ETH) or address (0x...) |
| `to` | string | Yes | Destination token symbol (e.g. USDC) or address |
| `amount` | string | Yes | Amount of source token (e.g. "1" for 1 ETH) |
| `address` | string | Yes | Wallet address (required by API) |
| `chain` | string | No | Chain: ethereum, bsc, arbitrum, base |
| `src_chain` | string | No | Source chain (for cross-chain quotes) |
| `dst_chain` | string | No | Destination chain (for cross-chain quotes) |
| `multihop` | boolean | No | Allow multihop routing for better rates |

**native_get_swap_quote**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `from` | string | Yes | Source token symbol or address |
| `to` | string | Yes | Destination token symbol or address |
| `amount` | string | Yes | Amount of source token |
| `address` | string | Yes | Sender/signer wallet address |
| `chain` | string | No | Chain name |
| `slippage` | number | No | Slippage tolerance in percent (e.g. 0.5) |

**native_get_orderbook**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `chain` | string | No | Chain to query |
| `pair` | string | No | Filter by trading pair (e.g. ETH/USDC) |

**native_list_tokens**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `chain` | string | No | Filter by chain |

**native_bridge_quote**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `from` | string | Yes | Source token symbol or address |
| `to` | string | Yes | Destination token symbol or address |
| `amount` | string | Yes | Amount of source token |
| `src_chain` | string | Yes | Source chain |
| `dst_chain` | string | Yes | Destination chain |

**native_bridge_swap**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `from` | string | Yes | Source token symbol or address |
| `to` | string | Yes | Destination token symbol or address |
| `amount` | string | Yes | Amount of source token |
| `src_chain` | string | Yes | Source chain |
| `dst_chain` | string | Yes | Destination chain |
| `address` | string | Yes | Sender wallet address |
| `refund_to` | string | Yes | Refund address if bridge fails |
| `slippage` | number | No | Slippage tolerance in percent |

**native_bridge_status**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `bridge_quote_id` | string | Yes | Bridge quote ID from bridge swap |

**native_bridge_history**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `address` | string | Yes | Wallet address |
| `page_size` | number | No | Results per page (default: 20) |
| `page_index` | number | No | Page index (default: 0) |

### Programmatic MCP Client

Use the MCP SDK to connect from your own agent:

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
  command: 'native-mcp',
  env: { NATIVE_API_KEY: 'your-key' },
});

const client = new Client({ name: 'my-agent', version: '1.0' });
await client.connect(transport);

// Get a quote
const result = await client.callTool('native_get_quote', {
  from: 'ETH', to: 'USDC', amount: '10',
  address: '0xYourWallet', chain: 'arbitrum',
});
console.log(result.content[0].text); // structured JSON
```

### MCP vs CLI

| | CLI (`native quote ...`) | MCP (`native_get_quote`) |
|---|---|---|
| Discovery | Manual -- read docs | Automatic -- agent queries `tools/list` |
| Parameters | Free-text flags | Typed JSON schema with validation |
| Output | stdout text or JSON | Structured JSON content blocks |
| Integration | `subprocess.run()` | Native function call |
| Best for | Humans, shell scripts | AI agents, automated workflows |

Both the CLI and MCP server share the same underlying modules (API client, cache, rate limiter, config). They are two interfaces to the same engine.

---

## Architecture

### Cache

native-cli uses a file-based cache stored at `~/.cache/native/`. Each endpoint has a TTL tuned to its data freshness requirements:

| Endpoint | TTL | Rationale |
|----------|-----|-----------|
| `orderbook` | 3 seconds | Orderbook data is highly volatile |
| `tokens` | 1 hour | Token list changes infrequently |
| `firm_quote` (swap) | Never cached | Firm quotes are time-sensitive and must always be live |

To bypass the cache for any command, pass `--skip-cache`:

```bash
native orderbook --pair ETH/USDC --skip-cache
```

### Rate Limiting

The CLI implements client-side rate limiting using a token bucket algorithm:

- **Rate**: 10 requests per second
- **Burst**: 20 requests

When the rate limit is reached, the CLI uses one of three strategies:

| Strategy | Behavior |
|----------|----------|
| `queue` (default) | Requests are queued and sent when a token becomes available |
| `reject` | Requests are immediately rejected with exit code `11` |
| `degrade` | Returns cached data if available, otherwise rejects |

### Supported Chains

| Chain | ID |
|-------|----|
| Ethereum | `ethereum` |
| BNB Smart Chain | `bsc` |
| Arbitrum One | `arbitrum` |
| Base | `base` |

---

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `NATIVE_API_KEY` | API key (overrides config file) | `sk-abc123` |
| `NATIVE_CHAIN` | Default chain (overrides config file) | `arbitrum` |
| `NATIVE_API_URL` | Override API base URL | `https://api.staging.native.org` |
| `NO_COLOR` | Disable colored output when set to any value | `1` |

Environment variables take precedence over the config file but are overridden by command-line flags. See [Config precedence](#config-precedence) above.

---

## Error Handling

### Exit codes

| Code | Name | Description |
|------|------|-------------|
| `0` | Success | Command completed successfully |
| `1` | General error | Unexpected failure (network error, API error, etc.) |
| `2` | Usage error | Invalid flags, missing required arguments, or unknown command |
| `10` | Insufficient liquidity | Not enough liquidity to fill the requested swap amount |
| `11` | Rate limited | Client-side or server-side rate limit reached |
| `12` | Risk rejected | The transaction was blocked by risk assessment checks |

### Common errors and solutions

**`Error: API key not configured`**
You have not set an API key. Run `native config set api-key YOUR_KEY` or pass `--api-key` on each invocation.

**`Error: Insufficient liquidity` (exit code 10)**
The requested amount exceeds available liquidity for that pair. Try a smaller amount or check the orderbook (`native orderbook --pair ETH/USDC`) to see available depth.

**`Error: Rate limited` (exit code 11)**
You are sending requests too quickly. The CLI queues requests by default, but if you see this error, wait briefly and retry. For high-throughput use cases, consider batching your requests.

**`Error: Risk rejected` (exit code 12)**
The swap was flagged by on-chain risk checks. This is not retryable. Review the token pair, wallet address, and amount.

---

## Development

### Prerequisites

- Node.js 18+
- pnpm (recommended) or npm

### Setup

```bash
git clone https://github.com/nativeorg/native-cli.git
cd native-cli
pnpm install
```

### Build

```bash
pnpm build
```

### Run in development

```bash
pnpm dev -- quote --from ETH --to USDC --amount 1 --json
```

### Run tests

```bash
# Run all tests
pnpm test

# Watch mode
pnpm test:watch
```

### Lint

```bash
pnpm lint
```

### Project structure

```
native-cli/
  bin/
    native.js          # CLI entry point
    native-mcp.js      # MCP server entry point
  src/
    index.ts           # CLI bootstrap (Commander)
    mcp-server.ts      # MCP server bootstrap (stdio transport)
    types.ts           # Shared TypeScript types and constants
    commands/          # CLI command handlers
    lib/               # Shared modules (API client, cache, rate limiter, config, errors)
    mcp/
      register-tools.ts
      helpers.ts
      tools/           # MCP tool handlers (quote, swap, orderbook, tokens, bridge)
  tests/
    commands/          # CLI command tests
    lib/               # Lib module tests
    mcp/tools/         # MCP tool tests
```

---

## License

MIT
