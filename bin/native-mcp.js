#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const entryPoint = join(__dirname, '..', 'src', 'mcp-server.ts');
const tsxBin = join(__dirname, '..', 'node_modules', '.bin', 'tsx');

const result = spawnSync(tsxBin, [entryPoint, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: process.env,
});

process.exitCode = result.status ?? 1;
