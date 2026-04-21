import { Command } from 'commander';
import { registerOrderbookCommand } from './commands/orderbook.js';
import { registerQuoteCommand } from './commands/quote.js';
import { registerSwapCommand } from './commands/swap.js';
import { registerTokensCommand } from './commands/tokens.js';
import { registerBridgeCommand } from './commands/bridge.js';
import { registerConfigCommand } from './commands/config.js';
import { VERSION } from './lib/version.js';

export function main(): void {
  const program = new Command();

  program
    .name('native')
    .description('CLI tool for the Native liquidity platform')
    .version(VERSION)
    .option('--json', 'Output as JSON')
    .option('--no-color', 'Disable colored output')
    .option('--skip-cache', 'Skip cache for this request')
    .option('--chain <chain>', 'Override default chain')
    .option('--api-url <url>', 'Override API URL')
    .option('--api-key-file <path>', 'Read API key from a file')
    .option('--max-age <ms>', 'Maximum cache age in milliseconds', parseInt)
    .option('--stale-ok', 'Accept stale cached data');

  // Register all commands
  registerOrderbookCommand(program);
  registerQuoteCommand(program);
  registerSwapCommand(program);
  registerTokensCommand(program);
  registerBridgeCommand(program);
  registerConfigCommand(program);

  // Handle NO_COLOR env var
  if (process.env['NO_COLOR'] !== undefined) {
    process.env['FORCE_COLOR'] = '0';
  }

  program.parse(process.argv);
}

// Auto-run when executed directly
main();
