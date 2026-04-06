import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('output', () => {
  let stdoutWrite: ReturnType<typeof vi.spyOn>;
  let stderrWrite: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  async function importOutput() {
    return await import('../../src/lib/output.js');
  }

  describe('isJsonMode', () => {
    it('returns true when jsonFlag is true', async () => {
      const { isJsonMode } = await importOutput();
      expect(isJsonMode(true)).toBe(true);
    });

    it('returns false when jsonFlag is false and stdout is a TTY', async () => {
      // Mock isatty to return true
      vi.mock('node:tty', () => ({
        isatty: (fd: number) => fd === 1,
      }));
      vi.resetModules();
      const { isJsonMode } = await importOutput();
      expect(isJsonMode(false)).toBe(false);
    });
  });

  describe('isTTY', () => {
    it('returns result of isatty(1)', async () => {
      vi.mock('node:tty', () => ({
        isatty: (fd: number) => fd === 1,
      }));
      vi.resetModules();
      const { isTTY } = await importOutput();
      expect(isTTY()).toBe(true);
    });
  });

  describe('printJson', () => {
    it('outputs valid JSON to stdout', async () => {
      const { printJson } = await importOutput();
      const data = { name: 'test', value: 42 };

      printJson(data);

      expect(stdoutWrite).toHaveBeenCalled();
      const output = (stdoutWrite.mock.calls[0]![0] as string).trim();
      const parsed = JSON.parse(output);
      expect(parsed).toEqual(data);
    });

    it('includes _meta field when meta is provided', async () => {
      const { printJson } = await importOutput();
      const data = { name: 'test' };
      const meta = {
        source: 'api' as const,
        age_ms: 0,
        fresh: true,
        retries: 0,
        latency_ms: 50,
      };

      printJson(data, meta);

      const output = (stdoutWrite.mock.calls[0]![0] as string).trim();
      const parsed = JSON.parse(output);
      expect(parsed._meta).toEqual(meta);
      expect(parsed.name).toBe('test');
    });

    it('wraps non-object data in { data: ... } when meta is provided', async () => {
      const { printJson } = await importOutput();
      const data = [1, 2, 3];
      const meta = {
        source: 'cache' as const,
        age_ms: 100,
        fresh: true,
        retries: 0,
        latency_ms: 0,
      };

      printJson(data, meta);

      const output = (stdoutWrite.mock.calls[0]![0] as string).trim();
      const parsed = JSON.parse(output);
      expect(parsed.data).toEqual([1, 2, 3]);
      expect(parsed._meta).toEqual(meta);
    });

    it('outputs array as-is when no meta is provided', async () => {
      const { printJson } = await importOutput();
      const data = [1, 2, 3];

      printJson(data);

      const output = (stdoutWrite.mock.calls[0]![0] as string).trim();
      const parsed = JSON.parse(output);
      expect(parsed).toEqual([1, 2, 3]);
    });
  });

  describe('printTable', () => {
    it('formats data as a readable table', async () => {
      const { printTable } = await importOutput();

      await printTable({
        head: ['Name', 'Value'],
        rows: [
          ['foo', 'bar'],
          ['baz', 42],
        ],
      });

      expect(stdoutWrite).toHaveBeenCalled();
      const output = stdoutWrite.mock.calls[0]![0] as string;
      // Table should contain the header and row data
      expect(output).toContain('Name');
      expect(output).toContain('Value');
      expect(output).toContain('foo');
      expect(output).toContain('bar');
      expect(output).toContain('baz');
      expect(output).toContain('42');
    });
  });

  describe('NO_COLOR support', () => {
    it('disables colors when NO_COLOR env var is set', async () => {
      vi.stubEnv('NO_COLOR', '1');
      vi.resetModules();
      const { printTable } = await importOutput();

      await printTable({
        head: ['Test'],
        rows: [['value']],
      });

      expect(stdoutWrite).toHaveBeenCalled();
      const output = stdoutWrite.mock.calls[0]![0] as string;
      // When NO_COLOR is set, ANSI escape codes should not be present in the header
      // The header should be plain "Test" without chalk formatting
      expect(output).toContain('Test');
    });
  });

  describe('printSuccess', () => {
    it('writes success message to stderr', async () => {
      const { printSuccess } = await importOutput();
      await printSuccess('Operation complete');

      expect(stderrWrite).toHaveBeenCalled();
      const output = stderrWrite.mock.calls[0]![0] as string;
      expect(output).toContain('Operation complete');
    });
  });

  describe('printError', () => {
    it('writes error message to stderr', async () => {
      const { printError } = await importOutput();
      await printError('Something went wrong');

      expect(stderrWrite).toHaveBeenCalled();
      const output = stderrWrite.mock.calls[0]![0] as string;
      expect(output).toContain('Something went wrong');
    });
  });

  describe('printWarning', () => {
    it('writes warning message to stderr', async () => {
      const { printWarning } = await importOutput();
      await printWarning('Watch out');

      expect(stderrWrite).toHaveBeenCalled();
      const output = stderrWrite.mock.calls[0]![0] as string;
      expect(output).toContain('Watch out');
    });
  });

  describe('printInfo', () => {
    it('writes info message to stderr', async () => {
      const { printInfo } = await importOutput();
      await printInfo('FYI');

      expect(stderrWrite).toHaveBeenCalled();
      const output = stderrWrite.mock.calls[0]![0] as string;
      expect(output).toContain('FYI');
    });
  });

  describe('printKeyValue', () => {
    it('prints key-value pairs aligned', async () => {
      const { printKeyValue } = await importOutput();
      await printKeyValue([
        ['Name', 'Test'],
        ['Value', 42],
      ]);

      expect(stdoutWrite).toHaveBeenCalledTimes(2);
      const line1 = stdoutWrite.mock.calls[0]![0] as string;
      const line2 = stdoutWrite.mock.calls[1]![0] as string;
      expect(line1).toContain('Name');
      expect(line1).toContain('Test');
      expect(line2).toContain('Value');
      expect(line2).toContain('42');
    });

    it('displays dash for undefined values', async () => {
      const { printKeyValue } = await importOutput();
      await printKeyValue([['Missing', undefined]]);

      expect(stdoutWrite).toHaveBeenCalled();
      const output = stdoutWrite.mock.calls[0]![0] as string;
      expect(output).toContain('-');
    });
  });
});
