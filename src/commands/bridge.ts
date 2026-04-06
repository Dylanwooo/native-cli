import type { Command } from 'commander';
import { apiRequest } from '../lib/api-client.js';
import { resolveConfig } from '../lib/config.js';
import {
  isJsonMode,
  printJson,
  printKeyValue,
  printInfo,
  printWarning,
  printSuccess,
  printTable,
} from '../lib/output.js';
import { formatError, NativeCliError } from '../lib/errors.js';
import type {
  GlobalOptions,
  BridgeIndicativeQuoteResponse,
  BridgeFirmQuoteResponse,
  BridgeTxStatusResponse,
  BridgeTxHistoryResponse,
} from '../types.js';
import { EXIT_CODES } from '../types.js';

export function registerBridgeCommand(program: Command): void {
  const bridge = program
    .command('bridge')
    .description('Cross-chain bridge operations');

  // ─── bridge quote ─────────────────────────────────────────────────

  bridge
    .command('quote')
    .description('Get an indicative cross-chain bridge quote')
    .requiredOption('--from <token>', 'Source token symbol or address')
    .requiredOption('--to <token>', 'Destination token symbol or address')
    .requiredOption('--amount <amount>', 'Amount of source token')
    .requiredOption('--src-chain <chain>', 'Source chain')
    .requiredOption('--dst-chain <chain>', 'Destination chain')
    .action(
      async (opts: {
        from: string;
        to: string;
        amount: string;
        srcChain: string;
        dstChain: string;
      }) => {
        const globalOpts = program.opts() as GlobalOptions;

        try {
          const params: Record<string, string> = {
            src_chain: opts.srcChain,
            dst_chain: opts.dstChain,
            token_in: opts.from,
            token_out: opts.to,
            amount: opts.amount,
          };

          const response = await apiRequest<BridgeIndicativeQuoteResponse>(
            'bridge/indicative-quote',
            params,
            {
              noCache: globalOpts.skipCache,
              maxAge: globalOpts.maxAge,
              staleOk: globalOpts.staleOk,
              cacheType: 'bridge_indicative_quote',
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
            ['From', `${opts.amount} ${opts.from} (${opts.srcChain})`],
            ['To', `${data.buyerTokenAmount ?? data.buyAmount ?? '-'} ${opts.to} (${opts.dstChain})`],
            ['Price', String(data.price ?? '-')],
            ['Estimated Time', (data as Record<string, unknown>).estimatedTime ? `${(data as Record<string, unknown>).estimatedTime}s` : '-'],
          ]);

          await printInfo(
            `Bridge indicative quote. Source: ${response._meta.source} (${response._meta.latency_ms}ms)`
          );
        } catch (err) {
          const { message, exitCode } = formatError(err);
          process.stderr.write(message + '\n');
          process.exitCode = exitCode;
        }
      }
    );

  // ─── bridge swap ──────────────────────────────────────────────────

  bridge
    .command('swap')
    .description('Get a firm cross-chain bridge swap quote with transaction calldata')
    .requiredOption('--from <token>', 'Source token symbol or address')
    .requiredOption('--to <token>', 'Destination token symbol or address')
    .requiredOption('--amount <amount>', 'Amount of source token')
    .requiredOption('--src-chain <chain>', 'Source chain')
    .requiredOption('--dst-chain <chain>', 'Destination chain')
    .requiredOption('--address <address>', 'Sender wallet address')
    .requiredOption('--refund-to <address>', 'Refund address if bridge fails')
    .option('--slippage <percent>', 'Slippage tolerance in percent')
    .option('--dry-run', 'Show what would happen without executing')
    .action(
      async (opts: {
        from: string;
        to: string;
        amount: string;
        srcChain: string;
        dstChain: string;
        address: string;
        refundTo: string;
        slippage?: string;
        dryRun?: boolean;
      }) => {
        const globalOpts = program.opts() as GlobalOptions;

        try {
          const config = resolveConfig({
            apiKeyFile: globalOpts.apiKeyFile,
            apiUrl: globalOpts.apiUrl,
            slippage: opts.slippage !== undefined ? parseFloat(opts.slippage) : undefined,
          });

          if (!opts.address.startsWith('0x') || opts.address.length !== 42) {
            throw new NativeCliError('Invalid sender address format.', EXIT_CODES.USAGE_ERROR);
          }
          if (!opts.refundTo.startsWith('0x') || opts.refundTo.length !== 42) {
            throw new NativeCliError('Invalid refund address format.', EXIT_CODES.USAGE_ERROR);
          }

          const params: Record<string, string> = {
            from_address: opts.address,
            refund_to: opts.refundTo,
            src_chain: opts.srcChain,
            dst_chain: opts.dstChain,
            token_in: opts.from,
            token_out: opts.to,
            amount: opts.amount,
            slippage: String(config.slippage),
          };

          if (opts.dryRun) {
            // Dry-run: use indicative quote only -- never call firm-quote
            await printWarning('DRY RUN — indicative quote (not executable)');

            const indicativeParams: Record<string, string> = {
              src_chain: opts.srcChain,
              dst_chain: opts.dstChain,
              token_in: opts.from,
              token_out: opts.to,
              amount: opts.amount,
            };

            const response = await apiRequest<BridgeIndicativeQuoteResponse>(
              'bridge/indicative-quote',
              indicativeParams,
              {
                noCache: true,
                cacheType: 'bridge_indicative_quote',
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
              ['From', `${opts.amount} ${opts.from} (${opts.srcChain})`],
              ['To', `${data.buyerTokenAmount ?? data.buyAmount ?? '-'} ${opts.to} (${opts.dstChain})`],
              ['Price', String(data.price ?? '-')],
              ['Slippage', `${config.slippage}%`],
              ['Refund To', opts.refundTo],
            ]);

            await printWarning('DRY RUN — indicative quote (not executable)');
          } else {
            // Normal mode: get firm quote
            const response = await apiRequest<BridgeFirmQuoteResponse>(
              'bridge/firm-quote',
              params,
              {
                noCache: true, // NEVER cache firm quotes
                cacheType: 'bridge_firm_quote',
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
              ['From', `${opts.amount} ${opts.from} (${opts.srcChain})`],
              ['To', `${(data.buyerTokenAmount ?? data.buyAmount ?? '-') as string} ${opts.to} (${opts.dstChain})`],
              ['Bridge Quote ID', String(data.bridge_quote_id ?? '-')],
              ['Slippage', `${config.slippage}%`],
              ['Refund To', opts.refundTo],
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
              ]);
            }

            await printSuccess('Bridge firm quote retrieved. Submit the transaction to execute.');
          }
        } catch (err) {
          const { message, exitCode } = formatError(err);
          process.stderr.write(message + '\n');
          process.exitCode = exitCode;
        }
      }
    );

  // ─── bridge status ────────────────────────────────────────────────

  bridge
    .command('status')
    .description('Check the status of a bridge transaction')
    .requiredOption('--id <bridge_quote_id>', 'Bridge quote ID to check')
    .action(async (opts: { id: string }) => {
      const globalOpts = program.opts() as GlobalOptions;

      try {
        const params: Record<string, string> = {
          bridge_quote_id: opts.id,
        };

        const response = await apiRequest<BridgeTxStatusResponse>(
          'bridge/tx-status',
          params,
          {
            noCache: globalOpts.skipCache,
            maxAge: globalOpts.maxAge,
            staleOk: globalOpts.staleOk,
            cacheType: 'bridge_tx_status',
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

        const data = response.data;
        await printKeyValue([
          ['Bridge Quote ID', data.bridge_quote_id],
          ['Status', data.status],
          ['Source TX', data.src_tx_hash ?? '-'],
          ['Destination TX', data.dst_tx_hash ?? '-'],
        ]);
      } catch (err) {
        const { message, exitCode } = formatError(err);
        process.stderr.write(message + '\n');
        process.exitCode = exitCode;
      }
    });

  // ─── bridge history ───────────────────────────────────────────────

  bridge
    .command('history')
    .description('View bridge transaction history for an address')
    .requiredOption('--address <address>', 'Wallet address')
    .option('--page-size <size>', 'Number of results per page', '20')
    .option('--page-index <index>', 'Page index', '0')
    .action(
      async (opts: {
        address: string;
        pageSize?: string;
        pageIndex?: string;
      }) => {
        const globalOpts = program.opts() as GlobalOptions;

        try {
          const params: Record<string, string> = {
            address: opts.address,
            page_size: opts.pageSize ?? '20',
            page_index: opts.pageIndex ?? '0',
          };

          const response = await apiRequest<BridgeTxHistoryResponse>(
            'bridge/tx-history',
            params,
            {
              noCache: globalOpts.skipCache,
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

          const entries = response.data.data ?? [];
          if (entries.length === 0) {
            await printInfo('No bridge transactions found.');
            return;
          }

          await printTable({
            head: ['Quote ID', 'Status', 'Route', 'Amount', 'Created'],
            rows: entries.map((e) => [
              e.bridge_quote_id ? `${e.bridge_quote_id.slice(0, 12)}...` : '-',
              e.status ?? '-',
              `${e.src_chain ?? '?'} -> ${e.dst_chain ?? '?'}`,
              `${e.amount ?? '-'} ${e.token_in ?? ''}`,
              e.created_at ?? '-',
            ]),
          });

          await printInfo(
            `${entries.length} transactions. Total: ${response.data.total ?? 'unknown'}`
          );
        } catch (err) {
          const { message, exitCode } = formatError(err);
          process.stderr.write(message + '\n');
          process.exitCode = exitCode;
        }
      }
    );
}
