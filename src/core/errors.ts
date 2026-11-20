/** Malformed inputs/scenario content. The headless CLI maps this to exit code 2. */
export class FormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FormatError';
  }
}

/** Bad command line or unreadable file. The headless CLI maps this to exit code 1. */
export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UsageError';
  }
}
