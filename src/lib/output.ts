import { createRequire } from 'node:module';
import { isatty } from 'node:tty';
import type { ApiMeta } from '../types.js';

const require = createRequire(import.meta.url);

// Lazy-load chalk to handle ESM import
let _chalk: typeof import('chalk').default | null = null;

async function getChalk(): Promise<typeof import('chalk').default> {
  if (!_chalk) {
    const mod = await import('chalk');
    _chalk = mod.default;
  }
  return _chalk;
}

function colorsEnabled(): boolean {
  if (process.env['NO_COLOR'] !== undefined) return false;
  return true;
}

export function isJsonMode(jsonFlag?: boolean): boolean {
  if (jsonFlag) return true;
  if (!isatty(1)) return true;
  return false;
}

export function isTTY(): boolean {
  return isatty(1);
}

// ─── Structured JSON Output ─────────────────────────────────────────

export function printJson(data: unknown, meta?: ApiMeta): void {
  const output = meta ? { ...asObject(data), _meta: meta } : data;
  process.stdout.write(JSON.stringify(output, null, 2) + '\n');
}

function asObject(data: unknown): Record<string, unknown> {
  if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }
  return { data };
}

// ─── Table Output ───────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Table = require('cli-table3');

export interface TableOptions {
  head: string[];
  rows: (string | number)[][];
  colWidths?: number[];
}

export async function printTable(opts: TableOptions): Promise<void> {
  const chalk = await getChalk();
  const useColor = colorsEnabled();

  const table = new Table({
    head: useColor ? opts.head.map((h) => chalk.bold.cyan(h)) : opts.head,
    ...(opts.colWidths ? { colWidths: opts.colWidths } : {}),
    style: {
      head: [],
      border: useColor ? ['grey'] : [],
    },
  });

  for (const row of opts.rows) {
    table.push(row.map(String));
  }

  process.stdout.write(table.toString() + '\n');
}

// ─── Styled Console Output ──────────────────────────────────────────

export async function printSuccess(msg: string): Promise<void> {
  const chalk = await getChalk();
  const useColor = colorsEnabled();
  process.stderr.write((useColor ? chalk.green('✓ ') : '  ') + msg + '\n');
}

export async function printWarning(msg: string): Promise<void> {
  const chalk = await getChalk();
  const useColor = colorsEnabled();
  process.stderr.write((useColor ? chalk.yellow('⚠ ') : '  ') + msg + '\n');
}

export async function printError(msg: string): Promise<void> {
  const chalk = await getChalk();
  const useColor = colorsEnabled();
  process.stderr.write((useColor ? chalk.red('✗ ') : '  ') + msg + '\n');
}

export async function printInfo(msg: string): Promise<void> {
  const chalk = await getChalk();
  const useColor = colorsEnabled();
  process.stderr.write((useColor ? chalk.blue('ℹ ') : '  ') + msg + '\n');
}

export function printStderr(msg: string): void {
  process.stderr.write(msg + '\n');
}

// ─── Key-Value Display ──────────────────────────────────────────────

export async function printKeyValue(pairs: [string, string | number | undefined][]): Promise<void> {
  const chalk = await getChalk();
  const useColor = colorsEnabled();

  const maxKeyLen = Math.max(...pairs.map(([k]) => k.length));
  for (const [key, value] of pairs) {
    const paddedKey = key.padEnd(maxKeyLen);
    const display = value !== undefined ? String(value) : '-';
    if (useColor) {
      process.stdout.write(`  ${chalk.bold(paddedKey)}  ${display}\n`);
    } else {
      process.stdout.write(`  ${paddedKey}  ${display}\n`);
    }
  }
}
