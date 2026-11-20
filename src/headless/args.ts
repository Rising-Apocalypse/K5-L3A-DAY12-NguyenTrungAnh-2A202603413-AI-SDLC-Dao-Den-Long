import { UsageError } from '../core/errors';

export interface CliArgs {
  seed: number;
  night: 1 | 2 | 3;
  ticks: number;
  out: string;
  scenario?: string;
  inputs?: string;
  snapshotEvery: number;
}

export const USAGE =
  'usage: headless --seed <int> --night <1|2|3> --ticks <int> --out <file.jsonl> ' +
  '[--scenario <file.json>] [--inputs <file.json>] [--snapshot-every <int>]';

function parseInteger(flag: string, text: string): number {
  if (!/^-?\d+$/.test(text)) throw new UsageError(`${flag} expects an integer, got "${text}"`);
  const n = Number(text);
  if (!Number.isSafeInteger(n)) throw new UsageError(`${flag} is out of range: "${text}"`);
  return n;
}

const FLAGS = ['--seed', '--night', '--ticks', '--out', '--scenario', '--inputs', '--snapshot-every'];

/** Parse `process.argv.slice(2)`. Every flag takes exactly one value (so `--seed -5` is fine). */
export function parseArgs(argv: readonly string[]): CliArgs {
  const raw = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i]!;
    if (!FLAGS.includes(flag)) throw new UsageError(`unknown argument "${flag}"\n${USAGE}`);
    if (raw.has(flag)) throw new UsageError(`${flag} given twice`);
    const value = argv[i + 1];
    if (value === undefined) throw new UsageError(`${flag} needs a value`);
    raw.set(flag, value);
  }

  const need = (flag: string): string => {
    const v = raw.get(flag);
    if (v === undefined) throw new UsageError(`missing required ${flag}\n${USAGE}`);
    return v;
  };

  const seed = parseInteger('--seed', need('--seed'));
  const night = parseInteger('--night', need('--night'));
  if (night !== 1 && night !== 2 && night !== 3) throw new UsageError(`--night ${night} is not supported (only 1, 2 or 3)`);
  const ticks = parseInteger('--ticks', need('--ticks'));
  if (ticks < 0) throw new UsageError('--ticks must be >= 0');
  const out = need('--out');
  if (out === '') throw new UsageError('--out must not be empty');

  const snapshotEvery = raw.has('--snapshot-every') ? parseInteger('--snapshot-every', raw.get('--snapshot-every')!) : 10;
  if (snapshotEvery < 1) throw new UsageError('--snapshot-every must be >= 1');

  return { seed, night, ticks, out, scenario: raw.get('--scenario'), inputs: raw.get('--inputs'), snapshotEvery };
}
