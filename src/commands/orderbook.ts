import type { Command } from 'commander';
import { apiRequest } from '../lib/api-client.js';
import { resolveConfig } from '../lib/config.js';
import { isJsonMode, printJson, printTable, printInfo } from '../lib/output.js';
import { formatError } from '../lib/errors.js';
import type { GlobalOptions, OrderbookEntry } from '../types.js';

export function registerOrderbookCommand(program: Command): void {
  program
    .command('orderbook')
    .description('Show orderbook depth for supported pairs')
    .option('--pair <pair>', 'Filter by trading pair (e.g. ETH/USDC)')
    .option('--chain <chain>', 'Filter by chain')
    .action(async (opts: { pair?: string; chain?: string }) => {
      const globalOpts = program.opts() as GlobalOptions;

      try {
        const config = resolveConfig({
          apiKeyFile: globalOpts.apiKeyFile,
          apiUrl: globalOpts.apiUrl,
          chain: opts.chain ?? globalOpts.chain,
        });
        const chain = config.chain;
        const params: Record<string, string> = { chain };

        const response = await apiRequest<OrderbookEntry[]>(
          'orderbook',
          params,
          {
            noCache: globalOpts.skipCache,
            maxAge: globalOpts.maxAge,
            staleOk: globalOpts.staleOk,
            cacheType: 'orderbook',
            requiresAuth: false,
            configOverrides: {
              apiKeyFile: globalOpts.apiKeyFile,
              apiUrl: globalOpts.apiUrl,
              chain,
            },
          }
        );

        let entries = Array.isArray(response.data) ? response.data : [];

        // Filter by pair if specified
        if (opts.pair) {
          const [base, quote] = opts.pair.toUpperCase().split('/');
          entries = entries.filter(
            (e) =>
              e.base_symbol?.toUpperCase() === base &&
              (!quote || e.quote_symbol?.toUpperCase() === quote)
          );
        }

        if (isJsonMode(globalOpts.json)) {
          printJson({ orderbook: entries }, response._meta);
          return;
        }

        if (entries.length === 0) {
          await printInfo('No orderbook entries found.');
          return;
        }

        // Summary table
        // API returns levels as [quantity, price] arrays
        const rows = entries.map((entry) => {
          const levels = entry.levels ?? [];
          const first = levels[0];
          // Handle both array [qty, price] and object {price, liquidity} formats
          const bestPrice = Array.isArray(first) ? first[1] : first?.price ?? 0;
          const totalQty = levels.reduce((sum, l) => {
            const qty = Array.isArray(l) ? l[0] : l.liquidity ?? 0;
            return sum + (typeof qty === 'number' ? qty : 0);
          }, 0);
          return [
            `${entry.base_symbol}/${entry.quote_symbol}`,
            typeof bestPrice === 'number' ? bestPrice.toFixed(6) : String(bestPrice),
            typeof totalQty === 'number' ? totalQty.toFixed(4) : String(totalQty),
            levels.length,
            entry.minimum_in_base ?? entry.min_amount ?? '-',
          ];
        });

        await printTable({
          head: ['Pair', 'Best Price', 'Total Liquidity', 'Levels', 'Min Amount'],
          rows,
        });

        await printInfo(
          `${entries.length} pairs. Source: ${response._meta.source} (${response._meta.latency_ms}ms)`
        );
      } catch (err) {
        const { message, exitCode } = formatError(err);
        process.stderr.write(message + '\n');
        process.exitCode = exitCode;
      }
    });
}
