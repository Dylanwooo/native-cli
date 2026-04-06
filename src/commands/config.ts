import type { Command } from 'commander';
import { createInterface } from 'node:readline';
import {
  getConfigValue,
  setConfigValue,
  listConfig,
  configPath,
  VALID_CONFIG_KEYS,
} from '../lib/config.js';
import { printJson, printKeyValue, printError, printWarning, printSuccess, isJsonMode } from '../lib/output.js';

export function registerConfigCommand(program: Command): void {
  const config = program
    .command('config')
    .description('Manage CLI configuration');

  config
    .command('set <key> <value>')
    .description(`Set a config value. Valid keys: ${VALID_CONFIG_KEYS.join(', ')}`)
    .action(async (key: string, value: string) => {
      if (key === 'api-key' || key === 'api_key') {
        await printWarning(
          'Setting API key via command arguments exposes it in shell history.\n' +
          '  Consider using: native config set-api-key (interactive, no shell history)'
        );
      }
      const ok = setConfigValue(key, value);
      if (!ok) {
        await printError(`Invalid config key or value: ${key}=${value}`);
        await printError(`Valid keys: ${VALID_CONFIG_KEYS.join(', ')}`);
        process.exitCode = 2;
        return;
      }
      if (isJsonMode(program.opts().json as boolean | undefined)) {
        printJson({ key, value, status: 'set' });
      } else {
        await printKeyValue([[key, value]]);
      }
    });

  config
    .command('set-api-key')
    .description('Set API key interactively (avoids shell history exposure)')
    .action(async () => {
      const rl = createInterface({
        input: process.stdin,
        output: process.stderr,
        terminal: true,
      });

      try {
        const key = await new Promise<string>((resolve, reject) => {
          // Disable echo by writing the prompt manually and using raw mode if available
          const stdin = process.stdin;
          const isRawCapable = typeof stdin.setRawMode === 'function';
          let input = '';

          if (isRawCapable) {
            process.stderr.write('Enter API key: ');
            stdin.setRawMode(true);
            stdin.resume();
            stdin.setEncoding('utf8');

            const onData = (ch: string): void => {
              if (ch === '\n' || ch === '\r' || ch === '\u0004') {
                stdin.setRawMode(false);
                stdin.pause();
                stdin.removeListener('data', onData);
                process.stderr.write('\n');
                resolve(input);
              } else if (ch === '\u0003') {
                // Ctrl+C
                stdin.setRawMode(false);
                stdin.pause();
                stdin.removeListener('data', onData);
                process.stderr.write('\n');
                reject(new Error('Aborted'));
              } else if (ch === '\u007F' || ch === '\b') {
                // Backspace
                if (input.length > 0) {
                  input = input.slice(0, -1);
                }
              } else {
                input += ch;
              }
            };

            stdin.on('data', onData);
          } else {
            // Fallback: use readline (echo may be visible)
            rl.question('Enter API key: ', (answer) => {
              resolve(answer);
            });
          }
        });

        if (!key || key.trim().length === 0) {
          await printError('No API key provided.');
          process.exitCode = 2;
          return;
        }

        const ok = setConfigValue('api-key', key.trim());
        if (!ok) {
          await printError('Failed to set API key.');
          process.exitCode = 1;
          return;
        }

        if (isJsonMode(program.opts().json as boolean | undefined)) {
          printJson({ key: 'api-key', status: 'set' });
        } else {
          await printSuccess('API key saved.');
        }
      } finally {
        rl.close();
      }
    });

  config
    .command('get <key>')
    .description('Get a config value')
    .action(async (key: string) => {
      const value = getConfigValue(key);
      if (isJsonMode(program.opts().json as boolean | undefined)) {
        printJson({ key, value: value ?? null });
      } else if (value !== undefined) {
        await printKeyValue([[key, value]]);
      } else {
        await printError(`Key not set: ${key}`);
      }
    });

  config
    .command('list')
    .description('List all config values')
    .action(async () => {
      const all = listConfig();
      if (isJsonMode(program.opts().json as boolean | undefined)) {
        printJson(all);
      } else {
        const entries = Object.entries(all);
        if (entries.length === 0) {
          process.stderr.write('No configuration set. Using defaults.\n');
        } else {
          await printKeyValue(entries.map(([k, v]) => [k, v as string | number]));
        }
      }
    });

  config
    .command('path')
    .description('Show config file path')
    .action(() => {
      const p = configPath();
      if (isJsonMode(program.opts().json as boolean | undefined)) {
        printJson({ path: p });
      } else {
        process.stdout.write(p + '\n');
      }
    });
}
