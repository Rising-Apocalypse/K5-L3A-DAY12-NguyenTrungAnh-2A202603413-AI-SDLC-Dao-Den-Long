import { UsageError } from '../core/errors';

export interface SoakArgs {
  seed: number;
  nights: number;
  out: string;
  verbose: boolean;
}

export const USAGE = 'usage: soak --seed <int> --nights <int >= 1> --out <file.json> [--verbose]';

function parseInteger(flag: string, text: string): number {
  if (!/^-?\d+$/.test(text)) throw new UsageError(`${flag} expects an integer, got "${text}"`);
  const n = Number(text);
  if (!Number.isSafeInteger(n)) throw new UsageError(`${flag} is out of range: "${text}"`);
  return n;
}

const VALUE_FLAGS = ['--seed', '--nights', '--out'];

/** Parse `process.argv.slice(2)`; flags may come in any order. `--verbose` takes no value. */
export function parseSoakArgs(argv: readonly string[]): SoakArgs {
  const raw = new Map<string, string>();
  let verbose = false;
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]!;
    if (flag === '--verbose') {
      verbose = true;
      continue;
    }
    if (!VALUE_FLAGS.includes(flag)) throw new UsageError(`unknown argument "${flag}"\n${USAGE}`);
    if (raw.has(flag)) throw new UsageError(`${flag} given twice`);
    const value = argv[i + 1];
    if (value === undefined) throw new UsageError(`${flag} needs a value`);
    raw.set(flag, value);
    i++;
  }
  const need = (flag: string): string => {
    const v = raw.get(flag);
    if (v === undefined) throw new UsageError(`missing required ${flag}\n${USAGE}`);
    return v;
  };
  const seed = parseInteger('--seed', need('--seed'));
  const nights = parseInteger('--nights', need('--nights'));
  if (nights < 1) throw new UsageError('--nights must be >= 1');
  const out = need('--out');
  if (out === '') throw new UsageError('--out must not be empty');
  return { seed, nights, out, verbose };
}
