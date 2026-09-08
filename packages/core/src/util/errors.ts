export type Severity = 'error' | 'warning';

export interface Diagnostic {
  severity: Severity;
  /** Stable machine-readable code, e.g. `data/unknown-field`. */
  code: string;
  message: string;
  /** Project-relative file the diagnostic points at, when known. */
  file?: string;
  /** Card id, when the diagnostic is about one row. */
  card?: string;
  cardType?: string;
  hint?: string;
}

export class DeckError extends Error {
  readonly code: string;
  readonly diagnostics: Diagnostic[];

  constructor(message: string, options: { code?: string; diagnostics?: Diagnostic[]; cause?: unknown } = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'DeckError';
    this.code = options.code ?? 'deck/error';
    this.diagnostics = options.diagnostics ?? [];
  }
}

export function diag(
  severity: Severity,
  code: string,
  message: string,
  extra: Omit<Diagnostic, 'severity' | 'code' | 'message'> = {},
): Diagnostic {
  return { severity, code, message, ...extra };
}

export function hasErrors(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some((d) => d.severity === 'error');
}
