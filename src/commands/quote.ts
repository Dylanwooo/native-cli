import type { Command } from 'commander';
import { apiRequest } from '../lib/api-client.js';
import { resolveConfig } from '../lib/config.js';
import { resolveToken } from '../lib/token-resolver.js';
import { isJsonMode, printJson, printKeyValue, printInfo } from '../lib/output.js';
import { formatError } from '../lib/errors.js';
import { NativeCliError } from '../lib/errors.js';
import type { GlobalOptions, IndicativeQuoteResponse } from '../types.js';
import { EXIT_CODES } from '../types.js';

export function registerQuoteCommand(program: Command): void {
  program
    .command('quote')
    .description('Get an indicative (non-binding) price quote')
    .requiredOption('--from <token>', 'Source token symbol (e.g. ETH) or address (0x...)')
    .requiredOption('--to <token>', 'Destination token symbol (e.g. USDC) or address (0x...)')
    .requiredOption('--amount <amount>', 'Amount of source token (e.g. 1 for 1 ETH)')
    .requiredOption('--address <address>', 'Your wallet address (from_address, required by API)')
    .option('--chain <chain>', 'Chain for same-chain swap')
    .option('--src-chain <chain>', 'Source chain (for cross-chain)')
    .option('--dst-chain <chain>', 'Destination chain (for cross-chain)')
    .option('--multihop', 'Allow multihop routing')
    .action(
      async (opts: {
        from: string;
        to: string;
        amount: string;
        address: string;
        chain?: string;
        srcChain?: string;
        dstChain?: string;
        multihop?: boolean;
      }) => {
        const globalOpts = program.opts() as GlobalOptions;

        try {
          const config = resolveConfig({
            apiKeyFile: globalOpts.apiKeyFile,
            apiUrl: globalOpts.apiUrl,
            chain: opts.chain ?? globalOpts.chain,
          });

          const srcChain = opts.srcChain ?? config.chain;
          const dstChain = opts.dstChain ?? config.chain;

          if (!opts.from || !opts.to || !opts.amount) {
            throw new NativeCliError(
              'Missing required options: --from, --to, --amount',
              EXIT_CODES.USAGE_ERROR
            );
          }

          const coOpts = { apiKeyFile: globalOpts.apiKeyFile, apiUrl: globalOpts.apiUrl };
          const tokenIn = await resolveToken(opts.from, srcChain, coOpts);
          const tokenOut = await resolveToken(opts.to, dstChain, coOpts);

          const params: Record<string, string> = {
            from_address: opts.address,
            src_chain: srcChain,
            dst_chain: dstChain,
            token_in: tokenIn,
            token_out: tokenOut,
            amount: opts.amount,
          };

          if (opts.multihop) {
            params['allow_multihop'] = 'true';
          }

          const response = await apiRequest<IndicativeQuoteResponse>(
            'indicative-quote',
            params,
            {
              noCache: globalOpts.skipCache,
              maxAge: globalOpts.maxAge,
              staleOk: globalOpts.staleOk,
              cacheType: 'indicative_quote',
              configOverrides: {
                apiKeyFile: globalOpts.apiKeyFile,
                apiUrl: globalOpts.apiUrl,
              },
            }
          );

          if (isJsonMode(globalOpts.json)) {
            printJson(response.data, response._meta);
            return;
          }

          const data = response.data as Record<string, unknown>;
          await printKeyValue([
            ['From', `${opts.amount} ${opts.from}`],
            ['To', `${data.buyerTokenAmount ?? data.buyAmount ?? '-'} ${opts.to}`],
            ['Price', String(data.price ?? '-')],
            ['Sell Amount', String(data.sellerTokenAmount ?? data.sellAmount ?? '-')],
            ['Buy Amount', String(data.buyerTokenAmount ?? data.buyAmount ?? '-')],
            ['Route', srcChain === dstChain ? 'Same chain' : `${srcChain} -> ${dstChain}`],
            ['Multihop', opts.multihop ? 'Enabled' : 'Disabled'],
          ]);

          await printInfo(
            `Indicative quote (non-binding). Source: ${response._meta.source} (${response._meta.latency_ms}ms)`
          );
        } catch (err) {
          const { message, exitCode } = formatError(err);
          process.stderr.write(message + '\n');
          process.exitCode = exitCode;
        }
      }
    );
}
