import type { Command } from 'commander';
import { apiRequest } from '../lib/api-client.js';
import { resolveConfig } from '../lib/config.js';
import { resolveToken } from '../lib/token-resolver.js';
import { isJsonMode, printJson, printKeyValue, printInfo, printWarning, printSuccess } from '../lib/output.js';
import { formatError, NativeCliError } from '../lib/errors.js';
import type { GlobalOptions, FirmQuoteResponse, IndicativeQuoteResponse } from '../types.js';
import { EXIT_CODES, FIRM_QUOTE_VERSION } from '../types.js';

export function registerSwapCommand(program: Command): void {
  program
    .command('swap')
    .description('Get a firm (executable) swap quote with transaction calldata')
    .requiredOption('--from <token>', 'Source token symbol (e.g. ETH) or address (0x...)')
    .requiredOption('--to <token>', 'Destination token symbol (e.g. USDC) or address (0x...)')
    .requiredOption('--amount <amount>', 'Amount of source token (e.g. 1 for 1 ETH)')
    .requiredOption('--address <address>', 'Sender/signer wallet address')
    .option('--chain <chain>', 'Chain for the swap')
    .option('--slippage <percent>', 'Slippage tolerance in percent (e.g. 0.5)')
    .option('--dry-run', 'Show what would happen without executing')
    .action(
      async (opts: {
        from: string;
        to: string;
        amount: string;
        address: string;
        chain?: string;
        slippage?: string;
        dryRun?: boolean;
      }) => {
        const globalOpts = program.opts() as GlobalOptions;

        try {
          const config = resolveConfig({
            apiKeyFile: globalOpts.apiKeyFile,
            apiUrl: globalOpts.apiUrl,
            chain: opts.chain ?? globalOpts.chain,
            slippage: opts.slippage !== undefined ? parseFloat(opts.slippage) : undefined,
          });

          if (!opts.address.startsWith('0x') || opts.address.length !== 42) {
            throw new NativeCliError(
              'Invalid address format. Expected a 42-character hex address starting with 0x.',
              EXIT_CODES.USAGE_ERROR
            );
          }

          const coOpts = { apiKeyFile: globalOpts.apiKeyFile, apiUrl: globalOpts.apiUrl };
          const tokenIn = await resolveToken(opts.from, config.chain, coOpts);
          const tokenOut = await resolveToken(opts.to, config.chain, coOpts);

          const params: Record<string, string> = {
            from_address: opts.address,
            src_chain: config.chain,
            dst_chain: config.chain,
            token_in: tokenIn,
            token_out: tokenOut,
            amount: opts.amount,
            slippage: String(config.slippage),
            version: String(FIRM_QUOTE_VERSION),
          };

          if (opts.dryRun) {
            // Dry-run: use indicative quote only -- never call firm-quote
            await printWarning('DRY RUN — indicative quote (not executable)');

            const indicativeParams: Record<string, string> = {
              from_address: opts.address,
              src_chain: config.chain,
              dst_chain: config.chain,
              token_in: tokenIn,
              token_out: tokenOut,
              amount: opts.amount,
            };

            const response = await apiRequest<IndicativeQuoteResponse>(
              'indicative-quote',
              indicativeParams,
              {
                noCache: true,
                cacheType: 'indicative_quote',
                configOverrides: {
                  apiKeyFile: globalOpts.apiKeyFile,
                  apiUrl: globalOpts.apiUrl,
                },
              }
            );

            if (isJsonMode(globalOpts.json)) {
              printJson(
                { ...response.data, dry_run: true },
                response._meta
              );
              return;
            }

            const data = response.data as Record<string, unknown>;
            await printKeyValue([
              ['From', `${opts.amount} ${opts.from}`],
              ['To', `${data.buyerTokenAmount ?? data.buyAmount ?? '-'} ${opts.to}`],
              ['Price', String(data.price ?? '-')],
              ['Chain', config.chain],
              ['Slippage', `${config.slippage}%`],
              ['Address', opts.address],
            ]);

            await printWarning('DRY RUN — indicative quote (not executable)');
            await printInfo(`Source: ${response._meta.source} (${response._meta.latency_ms}ms)`);
          } else {
            // Normal mode: get firm quote
            const response = await apiRequest<FirmQuoteResponse>(
              'firm-quote',
              params,
              {
                noCache: true, // NEVER cache firm quotes
                cacheType: 'firm_quote',
                configOverrides: {
                  apiKeyFile: globalOpts.apiKeyFile,
                  apiUrl: globalOpts.apiUrl,
                },
              }
            );

            if (isJsonMode(globalOpts.json)) {
              printJson(
                { ...response.data, dry_run: false },
                response._meta
              );
              return;
            }

            const data = response.data as Record<string, unknown>;
            await printKeyValue([
              ['From', `${opts.amount} ${opts.from}`],
              ['To', `${data.buyerTokenAmount ?? data.buyAmount ?? '-'} ${opts.to}`],
              ['Price', String(data.price ?? '-')],
              ['Chain', config.chain],
              ['Slippage', `${config.slippage}%`],
              ['Address', opts.address],
            ]);

            const txRequest = data.txRequest as Record<string, string> | undefined;
            if (txRequest) {
              const txTarget = txRequest.target ?? txRequest.to ?? '-';
              const txCalldata = txRequest.calldata ?? txRequest.data ?? '';
              process.stdout.write('\n');
              await printKeyValue([
                ['TX Target', txTarget],
                ['TX Value', txRequest.value ?? '0'],
                ['TX Calldata', txCalldata ? `${txCalldata.slice(0, 20)}...` : '-'],
                ['TX Gas', txRequest.gas ?? 'estimate required'],
              ]);
            }

            await printSuccess('Firm quote retrieved. Submit the transaction above to your wallet to execute.');
            await printInfo(`Source: ${response._meta.source} (${response._meta.latency_ms}ms)`);
          }
        } catch (err) {
          const { message, exitCode } = formatError(err);
          process.stderr.write(message + '\n');
          process.exitCode = exitCode;
        }
      }
    );
}
