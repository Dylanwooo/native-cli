import type { Command } from 'commander';
import { apiRequest } from '../lib/api-client.js';
import { resolveConfig } from '../lib/config.js';
import { isJsonMode, printJson, printTable, printInfo } from '../lib/output.js';
import { formatError } from '../lib/errors.js';
import type { GlobalOptions, TokenInfo, WidgetTokensResponse } from '../types.js';

export function registerTokensCommand(program: Command): void {
  program
    .command('tokens')
    .description('List all supported tokens')
    .option('--chain <chain>', 'Filter by chain')
    .action(async (opts: { chain?: string }) => {
      const globalOpts = program.opts() as GlobalOptions;

      try {
        const config = resolveConfig({
          apiKeyFile: globalOpts.apiKeyFile,
          apiUrl: globalOpts.apiUrl,
          chain: opts.chain ?? globalOpts.chain,
        });
        const chain = config.chain;
        const params: Record<string, string> = { chain };

        const response = await apiRequest<WidgetTokensResponse | TokenInfo[]>(
          'widget-tokens',
          params,
          {
            noCache: globalOpts.skipCache,
            maxAge: globalOpts.maxAge,
            staleOk: globalOpts.staleOk,
            cacheType: 'tokens',
            requiresAuth: false,
            configOverrides: {
              apiKeyFile: globalOpts.apiKeyFile,
              apiUrl: globalOpts.apiUrl,
              chain,
            },
          }
        );

        const data = response.data;

        // The API may return { chain: TokenInfo[] } or TokenInfo[]
        let tokens: TokenInfo[] = [];
        if (Array.isArray(data)) {
          tokens = data;
        } else if (typeof data === 'object' && data !== null) {
          const tokenMap = data as Record<string, TokenInfo[]>;
          if (chain && tokenMap[chain]) {
            tokens = tokenMap[chain].map((t) => ({ ...t, chain }));
          } else {
            // Flatten all chains
            for (const [chainName, chainTokens] of Object.entries(tokenMap)) {
              if (Array.isArray(chainTokens)) {
                tokens.push(
                  ...chainTokens.map((t) => ({ ...t, chain: chainName }))
                );
              }
            }
          }
        }

        if (isJsonMode(globalOpts.json)) {
          printJson({ tokens }, response._meta);
          return;
        }

        if (tokens.length === 0) {
          await printInfo('No tokens found.');
          return;
        }

        await printTable({
          head: ['Symbol', 'Name', 'Chain', 'Address', 'Decimals'],
          rows: tokens.map((t) => [
            t.symbol ?? '-',
            t.name ?? '-',
            t.chain ?? chain ?? '-',
            t.address ? `${t.address.slice(0, 6)}...${t.address.slice(-4)}` : '-',
            t.decimals ?? '-',
          ]),
        });

        await printInfo(`${tokens.length} tokens found. Source: ${response._meta.source}`);
      } catch (err) {
        const { message, exitCode } = formatError(err);
        process.stderr.write(message + '\n');
        process.exitCode = exitCode;
      }
    });
}
