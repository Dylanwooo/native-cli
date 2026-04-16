// ─── Embedded documentation for native_search_docs tool ─────────────
// No API key required — all content is bundled in the package.

export interface DocEntry {
  id: string;
  title: string;
  category: string;
  keywords: string[];
  content: string;
}

export const docs: DocEntry[] = [
  {
    id: 'workflow',
    title: 'Recommended Workflow',
    category: 'getting-started',
    keywords: ['workflow', 'how', 'start', 'steps', 'guide', 'order', 'first', 'begin', 'tutorial'],
    content: `# Recommended Workflow

## For swaps
1. Call \`native_search_docs\` if unsure about any parameter or feature
2. Call \`native_list_tokens\` to resolve token symbols to addresses
3. Call \`native_get_quote\` for a non-binding price preview
4. Call \`native_get_swap_quote\` to get executable transaction calldata
5. Sign and submit the transaction using the returned \`txRequest\`

## For cross-chain bridges
1. Call \`native_bridge_quote\` to get estimated output and time
2. Call \`native_bridge_swap\` to get transaction calldata (requires \`refund_to\` address)
3. Sign and submit the transaction
4. Poll \`native_bridge_status\` with the \`bridge_quote_id\` until status is "completed"
5. Use \`native_bridge_history\` to review past bridge transactions

## Error handling
If any tool call fails, call \`native_search_docs\` with the error message or code
to find troubleshooting guidance and suggested fixes.`,
  },
  {
    id: 'overview',
    title: 'What is Native?',
    category: 'getting-started',
    keywords: ['native', 'overview', 'introduction', 'what', 'about', 'protocol', 'defi', 'liquidity'],
    content: `# Native Protocol

Native is a programmable liquidity protocol that aggregates on-chain and off-chain liquidity
for token swaps and cross-chain bridges. It provides:

- **Token Swaps**: Best-rate execution across multiple liquidity sources
- **Cross-chain Bridges**: Transfer tokens between supported chains
- **Orderbook Data**: Real-time liquidity depth for trading pairs
- **Multi-chain Support**: Ethereum, BSC, Arbitrum, Base

Native exposes its capabilities through a REST API, a CLI tool (\`nativefi-cli\`),
and an MCP server for AI agent integration.`,
  },
  {
    id: 'authentication',
    title: 'Authentication & API Keys',
    category: 'getting-started',
    keywords: ['auth', 'authentication', 'api', 'key', 'apikey', 'setup', 'configure', 'token', 'credential'],
    content: `# Authentication

Most Native API endpoints require an API key. You can configure it in three ways
(highest priority first):

1. **CLI flag**: \`native --api-key YOUR_KEY quote ...\`
2. **Environment variable**: \`export NATIVE_API_KEY=YOUR_KEY\`
3. **Config file**: \`native config set api-key YOUR_KEY\`

The API key is sent as an \`apiKey\` HTTP header.

**No-auth endpoints**: The \`widget-tokens\` endpoint (token listing) does not require
an API key. All other endpoints (quotes, swaps, bridges, orderbook) require authentication.

**Security**: The config file is stored at \`~/.config/native/config.json\` with 0600
permissions (owner-only read/write).`,
  },
  {
    id: 'chains',
    title: 'Supported Chains',
    category: 'reference',
    keywords: ['chain', 'chains', 'network', 'ethereum', 'bsc', 'arbitrum', 'base', 'supported', 'evm'],
    content: `# Supported Chains

Native currently supports 4 EVM chains:

| Chain      | Chain ID | Native Token |
|------------|----------|--------------|
| ethereum   | 1        | ETH          |
| bsc        | 56       | BNB          |
| arbitrum   | 42161    | ETH          |
| base       | 8453     | ETH          |

Use chain names (lowercase) in CLI commands and MCP tool parameters.
Default chain is \`ethereum\` and can be changed via \`native config set default-chain <chain>\`.

**Native token addresses** (used for ETH/BNB swaps):
- \`0x0000000000000000000000000000000000000000\`
- \`0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE\``,
  },
  {
    id: 'swap-quote',
    title: 'Token Swap Quotes',
    category: 'swaps',
    keywords: ['swap', 'quote', 'price', 'indicative', 'rate', 'exchange', 'token', 'trade', 'buy', 'sell'],
    content: `# Token Swap Quotes

Native provides two types of quotes:

## Indicative Quote (non-binding)
Returns a price estimate without executable transaction data. Use for price display and comparison.

- **MCP tool**: \`native_get_quote\`
- **CLI**: \`native quote --from ETH --to USDC --amount 1 --address 0x...\`
- **API**: \`GET /indicative-quote?from_address=...&token_in=...&token_out=...&amount=...&src_chain=...&dst_chain=...\`
- **Cached**: 5 seconds

## Firm Quote (binding, with calldata)
Returns executable transaction data (target, calldata, value) ready to be signed and submitted.

- **MCP tool**: \`native_get_swap_quote\`
- **CLI**: \`native swap --from ETH --to USDC --amount 1 --address 0x...\`
- **API**: \`GET /firm-quote?from_address=...&token_in=...&token_out=...&amount=...&slippage=...\`
- **Never cached** (time-sensitive)

Both support symbol names (ETH, USDC) or contract addresses (0x...).
Slippage defaults to 0.5% and is configurable.`,
  },
  {
    id: 'bridge',
    title: 'Cross-chain Bridges',
    category: 'bridges',
    keywords: ['bridge', 'cross-chain', 'crosschain', 'transfer', 'chain', 'bridge-quote', 'bridge-swap'],
    content: `# Cross-chain Bridges

Bridge tokens between supported chains (ethereum, bsc, arbitrum, base).

## Workflow
1. **Get a quote**: \`native_bridge_quote\` → estimated output amount and time
2. **Execute the bridge**: \`native_bridge_swap\` → transaction calldata to sign
3. **Track status**: \`native_bridge_status\` → poll until completed
4. **View history**: \`native_bridge_history\` → past transactions for a wallet

## Key Parameters
- \`src_chain\` / \`dst_chain\`: Source and destination chains
- \`token_in\` / \`token_out\`: Token symbols or addresses
- \`refund_to\`: Address to receive funds if bridge fails (required for firm quotes)
- \`bridge_quote_id\`: Returned by bridge swap, used for status tracking

## CLI Examples
\`\`\`bash
native bridge quote --from ETH --to USDC --amount 1 --src-chain ethereum --dst-chain arbitrum
native bridge swap --from ETH --to USDC --amount 1 --src-chain ethereum --dst-chain base --address 0x... --refund-to 0x...
native bridge status --id <bridge_quote_id>
native bridge history --address 0x...
\`\`\``,
  },
  {
    id: 'orderbook',
    title: 'Orderbook Data',
    category: 'data',
    keywords: ['orderbook', 'order', 'book', 'liquidity', 'depth', 'bid', 'ask', 'level', 'price', 'market'],
    content: `# Orderbook Data

Query real-time liquidity depth for trading pairs.

- **MCP tool**: \`native_get_orderbook\`
- **CLI**: \`native orderbook --pair ETH/USDC\`
- **Cached**: 3 seconds (highly time-sensitive)

## Response Format
Returns bid/ask levels as \`[quantity, price]\` arrays:
\`\`\`json
{
  "base_symbol": "ETH",
  "quote_symbol": "USDC",
  "levels": [[0.5, 3200.50], [1.0, 3200.00], [2.0, 3199.50]]
}
\`\`\`

## Parameters
- \`pair\`: Trading pair in \`BASE/QUOTE\` format (e.g. ETH/USDC)
- \`chain\`: Chain to query (defaults to configured chain)`,
  },
  {
    id: 'configuration',
    title: 'CLI Configuration',
    category: 'reference',
    keywords: ['config', 'configuration', 'settings', 'options', 'defaults', 'slippage', 'timeout', 'rate-limit'],
    content: `# CLI Configuration

Configuration is stored at \`~/.config/native/config.json\`.

## Commands
\`\`\`bash
native config set <key> <value>   # Set a config value
native config get <key>            # Get a config value
native config list                 # List all config values
native config path                 # Show config file path
\`\`\`

## Available Settings
| Key                 | Default                                      | Description                  |
|---------------------|----------------------------------------------|------------------------------|
| api-key             | —                                            | API key for authentication   |
| api-url             | https://v2.api.native.org/swap-api-v2/v1     | API base URL                 |
| default-chain       | ethereum                                     | Default chain for commands   |
| slippage            | 0.5                                          | Default slippage (%)         |
| rate-limit-rps      | 10                                           | Requests per second          |
| rate-limit-burst    | 20                                           | Burst capacity               |
| rate-limit-strategy | queue                                        | queue / reject / degrade     |
| request-timeout     | 30000                                        | Request timeout (ms)         |

## Priority Order
CLI flags > Environment variables > Config file > Defaults`,
  },
  {
    id: 'errors',
    title: 'Error Codes & Troubleshooting',
    category: 'reference',
    keywords: ['error', 'errors', 'troubleshoot', 'debug', 'fix', 'code', 'problem', 'issue', 'fail'],
    content: `# Error Codes

## API Error Codes
| Code   | Meaning                  | Suggestion                                    |
|--------|--------------------------|-----------------------------------------------|
| 201005 | Rate limited             | Wait and retry, or reduce request frequency   |
| 101010 | Insufficient liquidity   | Try a smaller amount or different pair         |
| 101008 | Risk check rejected      | Token may be flagged; verify token address     |
| 101007 | Invalid token            | Check token address or symbol spelling         |
| 101006 | Chain not supported      | Use: ethereum, bsc, arbitrum, base             |

## CLI Exit Codes
| Code | Meaning              |
|------|----------------------|
| 0    | Success              |
| 1    | General error        |
| 2    | Usage/config error   |
| 10   | Insufficient liquidity |
| 11   | Rate limited         |
| 12   | Risk rejected        |

## Common Issues
- **"No API key configured"**: Run \`native config set api-key YOUR_KEY\`
- **Network timeout**: Check connectivity, or increase timeout: \`native config set request-timeout 60000\`
- **Stale data**: Use \`--skip-cache\` flag to bypass cache`,
  },
  {
    id: 'mcp-setup',
    title: 'MCP Server Setup for AI Agents',
    category: 'ai-integration',
    keywords: ['mcp', 'ai', 'agent', 'claude', 'cursor', 'setup', 'install', 'integration', 'server', 'llm'],
    content: `# MCP Server Setup

The Native MCP server exposes DeFi tools to AI agents via the Model Context Protocol.

## Installation

### Claude Desktop
Add to \`~/Library/Application Support/Claude/claude_desktop_config.json\`:
\`\`\`json
{
  "mcpServers": {
    "nativefi": {
      "command": "npx",
      "args": ["-y", "nativefi-cli", "mcp"],
      "env": { "NATIVE_API_KEY": "your-api-key" }
    }
  }
}
\`\`\`

### Claude Code
\`\`\`bash
claude mcp add nativefi -- npx -y nativefi-cli mcp
\`\`\`

### Cursor
Add to \`.cursor/mcp.json\`:
\`\`\`json
{
  "mcpServers": {
    "nativefi": {
      "command": "npx",
      "args": ["-y", "nativefi-cli", "mcp"],
      "env": { "NATIVE_API_KEY": "your-api-key" }
    }
  }
}
\`\`\`

## Available Tools (10 total)
**No auth required**: \`native_search_docs\`, \`native_get_examples\`, \`native_list_tokens\`
**Auth required**: \`native_get_quote\`, \`native_get_swap_quote\`, \`native_get_orderbook\`,
\`native_bridge_quote\`, \`native_bridge_swap\`, \`native_bridge_status\`, \`native_bridge_history\``,
  },
  {
    id: 'caching',
    title: 'Caching Behavior',
    category: 'reference',
    keywords: ['cache', 'caching', 'ttl', 'stale', 'fresh', 'performance', 'speed'],
    content: `# Caching

Native CLI uses file-based caching at \`~/.cache/native/\` to reduce API calls
and improve response times.

## TTLs by Endpoint
| Endpoint Type          | TTL       |
|------------------------|-----------|
| tokens                 | 1 hour    |
| orderbook              | 3 seconds |
| indicative_quote       | 5 seconds |
| bridge_indicative_quote| 5 seconds |
| bridge_tx_status       | 10 seconds|
| firm_quote             | Never (0) |
| bridge_firm_quote      | Never (0) |

## Cache Control
- \`--skip-cache\`: Bypass cache entirely
- \`--max-age <ms>\`: Custom max age for cached data
- \`--stale-ok\`: Accept expired cache entries (useful during rate limiting)

## How It Works
- Cache keys: SHA256 hash of endpoint + sorted query parameters
- Metadata: Every response includes \`_meta.source\` ("api" or "cache"),
  \`_meta.age_ms\`, and \`_meta.fresh\` for transparency`,
  },
];
