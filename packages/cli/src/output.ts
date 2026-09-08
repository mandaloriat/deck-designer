import { hasErrors, type Diagnostic } from '@deck-designer/core';

export const EXIT = {
  ok: 0,
  error: 1,
  validation: 2,
  usage: 3,
} as const;

export interface GlobalOptions {
  json: boolean;
  quiet: boolean;
  color: boolean;
}

export interface CommandResult {
  data?: unknown;
  diagnostics?: Diagnostic[];
  /** Overrides the exit code derived from diagnostics. */
  exitCode?: number;
}

const CODES = {
  reset: '\u001b[0m',
  red: '\u001b[31m',
  yellow: '\u001b[33m',
  green: '\u001b[32m',
  dim: '\u001b[2m',
  bold: '\u001b[1m',
};

export class Reporter {
  constructor(private readonly options: GlobalOptions) {}

  get json(): boolean {
    return this.options.json;
  }

  private paint(code: keyof typeof CODES, text: string): string {
    return this.options.color ? `${CODES[code]}${text}${CODES.reset}` : text;
  }

  /** Progress goes to stderr so `--json` keeps stdout a clean, pipeable payload. */
  step(message: string): void {
    if (this.options.quiet || this.options.json) return;
    process.stderr.write(`${this.paint('dim', '-')} ${message}\n`);
  }

  info(message: string): void {
    if (this.options.quiet || this.options.json) return;
    process.stdout.write(`${message}\n`);
  }

  table(rows: readonly string[][]): void {
    if (this.options.quiet || this.options.json || rows.length === 0) return;
    const widths: number[] = [];
    for (const row of rows) {
      row.forEach((cell, i) => {
        widths[i] = Math.max(widths[i] ?? 0, cell.length);
      });
    }
    for (const [index, row] of rows.entries()) {
      const line = row.map((cell, i) => cell.padEnd(widths[i] ?? 0)).join('  ').trimEnd();
      process.stdout.write(`${index === 0 ? this.paint('bold', line) : line}\n`);
    }
  }

  diagnostics(diagnostics: readonly Diagnostic[]): void {
    if (this.options.json) return;
    for (const d of diagnostics) {
      const label = d.severity === 'error' ? this.paint('red', 'error') : this.paint('yellow', 'warning');
      const where = [d.file, d.cardType && `type=${d.cardType}`, d.card && `card=${d.card}`]
        .filter(Boolean)
        .join(' ');
      process.stderr.write(`${label} ${this.paint('dim', `[${d.code}]`)} ${d.message}\n`);
      if (where) process.stderr.write(`      ${this.paint('dim', where)}\n`);
      if (d.hint) process.stderr.write(`      ${this.paint('dim', `hint: ${d.hint}`)}\n`);
    }
  }

  finish(command: string, result: CommandResult): number {
    const diagnostics = result.diagnostics ?? [];
    const failed = hasErrors(diagnostics);
    const exitCode = result.exitCode ?? (failed ? EXIT.validation : EXIT.ok);

    if (this.options.json) {
      process.stdout.write(
        `${JSON.stringify(
          { ok: exitCode === EXIT.ok, command, data: result.data ?? null, diagnostics },
          null,
          2,
        )}\n`,
      );
    } else {
      this.diagnostics(diagnostics);
      const errors = diagnostics.filter((d) => d.severity === 'error').length;
      const warnings = diagnostics.length - errors;
      if (!this.options.quiet && diagnostics.length > 0) {
        process.stderr.write(`${this.paint('dim', `${errors} error(s), ${warnings} warning(s)`)}\n`);
      }
    }
    return exitCode;
  }

  failure(command: string, error: unknown): number {
    const message = error instanceof Error ? error.message : String(error);
    const diagnostics =
      error && typeof error === 'object' && 'diagnostics' in error
        ? ((error as { diagnostics: Diagnostic[] }).diagnostics ?? [])
        : [];
    const code =
      error && typeof error === 'object' && 'code' in error
        ? String((error as { code: unknown }).code)
        : 'deck/error';

    if (this.options.json) {
      process.stdout.write(
        `${JSON.stringify({ ok: false, command, data: null, error: { code, message }, diagnostics }, null, 2)}\n`,
      );
    } else {
      process.stderr.write(`${this.paint('red', 'error')} ${message}\n`);
      this.diagnostics(diagnostics);
    }
    return EXIT.error;
  }
}
