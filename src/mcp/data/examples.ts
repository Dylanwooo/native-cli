// ─── Embedded code examples for native_get_examples tool ────────────
// No API key required — all content is bundled in the package.

export interface ExampleEntry {
  id: string;
  title: string;
  description: string;
  language: 'typescript' | 'bash' | 'json' | 'python';
  tags: string[];
  code: string;
}

export const examples: ExampleEntry[] = [
  {
    id: 'swap-quote-ts',
    title: 'Get a swap quote (TypeScript)',
    description: 'Fetch an indicative price quote for a token swap using the Native API directly.',
    language: 'typescript',
    tags: ['swap', 'quote', 'typescript', 'api', 'price'],
    code: `import fetch from 'node-fetch';

const API_URL = 'https://v2.api.native.org/swap-api-v2/v1';
const API_KEY = process.env.NATIVE_API_KEY!;

async function getQuote() {
  const params = new URLSearchParams({
    from_address: '0xYourWalletAddress',
    src_chain: 'ethereum',
    dst_chain: 'ethereum',
    token_in: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', // ETH
    token_out: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC
    amount: '1000000000000000000', // 1 ETH in wei
  });

  const res = await fetch(\`\${API_URL}/indicative-quote?\${params}\`, {
    headers: { apiKey: API_KEY },
  });

  const data = await res.json();
  console.log('Quote:', data);
  // data.buyerTokenAmount = USDC amount you'll receive
  // data.price = exchange rate
}

getQuote();`,
  },
  {
    id: 'execute-swap-ts',
    title: 'Execute a swap with calldata (TypeScript)',
    description: 'Get a firm quote with transaction calldata, then sign and send using ethers.js.',
    language: 'typescript',
    tags: ['swap', 'execute', 'firm', 'calldata', 'typescript', 'ethers', 'transaction'],
    code: `import { ethers } from 'ethers';
import fetch from 'node-fetch';

const API_URL = 'https://v2.api.native.org/swap-api-v2/v1';
const API_KEY = process.env.NATIVE_API_KEY!;

async function executeSwap() {
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);

  // 1. Get firm quote with calldata
  const params = new URLSearchParams({
    from_address: wallet.address,
    src_chain: 'ethereum',
    dst_chain: 'ethereum',
    token_in: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    token_out: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    amount: '1000000000000000000',
    slippage: '0.5',
    version: '4',
  });

  const res = await fetch(\`\${API_URL}/firm-quote?\${params}\`, {
    headers: { apiKey: API_KEY },
  });
  const quote = await res.json();

  // 2. Sign and send the transaction
  const tx = await wallet.sendTransaction({
    to: quote.txRequest.target,
    data: quote.txRequest.calldata,
    value: quote.txRequest.value,
    gasLimit: quote.txRequest.gas,
  });

  console.log('Tx hash:', tx.hash);
  const receipt = await tx.wait();
  console.log('Confirmed in block:', receipt?.blockNumber);
}

executeSwap();`,
  },
  {
    id: 'bridge-flow-ts',
    title: 'Cross-chain bridge flow (TypeScript)',
    description: 'Complete bridge workflow: quote → swap → poll status until complete.',
    language: 'typescript',
    tags: ['bridge', 'cross-chain', 'typescript', 'complete', 'workflow'],
    code: `import fetch from 'node-fetch';

const API_URL = 'https://v2.api.native.org/swap-api-v2/v1';
const API_KEY = process.env.NATIVE_API_KEY!;
const WALLET = '0xYourWalletAddress';

async function api(endpoint: string, params: Record<string, string>) {
  const qs = new URLSearchParams(params);
  const res = await fetch(\`\${API_URL}/\${endpoint}?\${qs}\`, {
    headers: { apiKey: API_KEY },
  });
  return res.json();
}

async function bridgeETHtoBase() {
  // 1. Get indicative quote
  const quote = await api('bridge/indicative-quote', {
    src_chain: 'ethereum',
    dst_chain: 'base',
    token_in: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    token_out: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    amount: '1000000000000000000',
  });
  console.log('Bridge quote:', quote);

  // 2. Get firm quote with calldata
  const swap = await api('bridge/firm-quote', {
    from_address: WALLET,
    refund_to: WALLET,
    src_chain: 'ethereum',
    dst_chain: 'base',
    token_in: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    token_out: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    amount: '1000000000000000000',
    slippage: '0.5',
  });

  // 3. Sign and send swap.txRequest (see execute-swap example)
  // ...

  // 4. Poll status
  const bridgeId = swap.bridge_quote_id;
  let status = 'pending';
  while (status !== 'completed' && status !== 'failed') {
    await new Promise(r => setTimeout(r, 10000));
    const result = await api('bridge/tx-status', { bridge_quote_id: bridgeId });
    status = result.status;
    console.log('Bridge status:', status);
  }
}

bridgeETHtoBase();`,
  },
  {
    id: 'orderbook-ts',
    title: 'Query orderbook depth (TypeScript)',
    description: 'Fetch real-time orderbook liquidity for a trading pair.',
    language: 'typescript',
    tags: ['orderbook', 'liquidity', 'depth', 'typescript', 'market', 'data'],
    code: `import fetch from 'node-fetch';

const API_URL = 'https://v2.api.native.org/swap-api-v2/v1';
const API_KEY = process.env.NATIVE_API_KEY!;

async function getOrderbook() {
  const params = new URLSearchParams({
    chain: 'ethereum',
    pair: 'ETH/USDC',
  });

  const res = await fetch(\`\${API_URL}/orderbook?\${params}\`, {
    headers: { apiKey: API_KEY },
  });
  const data = await res.json();

  // Each level is [quantity, price]
  for (const entry of data) {
    console.log(\`\${entry.base_symbol}/\${entry.quote_symbol} (\${entry.side})\`);
    for (const [qty, price] of entry.levels.slice(0, 5)) {
      console.log(\`  \${qty} @ \${price}\`);
    }
  }
}

getOrderbook();`,
  },
  {
    id: 'cli-quickstart',
    title: 'CLI quickstart',
    description: 'Common CLI commands to get started with Native.',
    language: 'bash',
    tags: ['cli', 'quickstart', 'getting-started', 'commands', 'bash'],
    code: `# Install globally
npm install -g nativefi-cli

# Configure API key
native config set api-key YOUR_API_KEY

# Set default chain (optional, defaults to ethereum)
native config set default-chain arbitrum

# Get a swap quote
native quote --from ETH --to USDC --amount 1 --address 0xYourWallet

# Get a firm quote with calldata
native swap --from ETH --to USDC --amount 1 --address 0xYourWallet

# Query orderbook
native orderbook --pair ETH/USDC

# List all tokens on a chain
native tokens --chain ethereum

# Cross-chain bridge
native bridge quote --from ETH --to ETH --amount 1 \\
  --src-chain ethereum --dst-chain base

# JSON output (for scripting)
native quote --from ETH --to USDC --amount 1 --address 0x... --json`,
  },
  {
    id: 'mcp-claude-desktop',
    title: 'MCP setup for Claude Desktop',
    description: 'Configure Native MCP server in Claude Desktop for AI-powered DeFi.',
    language: 'json',
    tags: ['mcp', 'claude', 'desktop', 'ai', 'setup', 'configuration'],
    code: `// Add to: ~/Library/Application Support/Claude/claude_desktop_config.json
{
  "mcpServers": {
    "nativefi": {
      "command": "npx",
      "args": ["-y", "nativefi-cli", "mcp"],
      "env": {
        "NATIVE_API_KEY": "your-api-key-here"
      }
    }
  }
}

// After restart, Claude can:
// - Search Native docs (no key needed)
// - Browse code examples (no key needed)
// - List supported tokens (no key needed)
// - Get swap quotes (key required)
// - Execute swaps with calldata (key required)
// - Bridge tokens cross-chain (key required)
// - Query orderbook depth (key required)`,
  },
  {
    id: 'mcp-cursor',
    title: 'MCP setup for Cursor',
    description: 'Configure Native MCP server in Cursor IDE.',
    language: 'json',
    tags: ['mcp', 'cursor', 'ide', 'ai', 'setup', 'configuration'],
    code: `// Add to: .cursor/mcp.json in your project root
{
  "mcpServers": {
    "nativefi": {
      "command": "npx",
      "args": ["-y", "nativefi-cli", "mcp"],
      "env": {
        "NATIVE_API_KEY": "your-api-key-here"
      }
    }
  }
}`,
  },
  {
    id: 'python-quote',
    title: 'Get a swap quote (Python)',
    description: 'Fetch an indicative swap quote using Python requests.',
    language: 'python',
    tags: ['swap', 'quote', 'python', 'api', 'price'],
    code: `import os
import requests

API_URL = "https://v2.api.native.org/swap-api-v2/v1"
API_KEY = os.environ["NATIVE_API_KEY"]

def get_quote():
    resp = requests.get(
        f"{API_URL}/indicative-quote",
        headers={"apiKey": API_KEY},
        params={
            "from_address": "0xYourWalletAddress",
            "src_chain": "ethereum",
            "dst_chain": "ethereum",
            "token_in": "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",  # ETH
            "token_out": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",  # USDC
            "amount": "1000000000000000000",  # 1 ETH in wei
        },
    )
    data = resp.json()
    print(f"Price: {data.get('price')}")
    print(f"You receive: {data.get('buyerTokenAmount')} USDC")
    return data

get_quote()`,
  },
];
