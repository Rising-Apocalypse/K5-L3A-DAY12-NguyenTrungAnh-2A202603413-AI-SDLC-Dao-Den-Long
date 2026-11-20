import { UsageError } from '../core/errors';

export interface PlayArgs {
  noOpen: boolean;
  exportTo?: string;
  leaderboardFile?: string;
  webDir?: string;
  port: number;
}

export const USAGE =
  'usage: play [--no-open] [--port <int>] [--leaderboard-file <file.json>] [--export-leaderboard <out.json>]';

export const DEFAULT_PORT = 4173;

/** Parse `process.argv.slice(2)`. `--no-open` takes no value; every other flag takes one. */
export function parsePlayArgs(argv: readonly string[]): PlayArgs {
  const args: PlayArgs = { noOpen: false, port: DEFAULT_PORT };
  const seen = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]!;
    if (seen.has(flag)) throw new UsageError(`${flag} given twice`);
    seen.add(flag);
    if (flag === '--no-open') {
      args.noOpen = true;
      continue;
    }
    if (!['--export-leaderboard', '--leaderboard-file', '--web-dir', '--port'].includes(flag)) {
      throw new UsageError(`unknown argument "${flag}"\n${USAGE}`);
    }
    const value = argv[++i];
    if (value === undefined || value === '') throw new UsageError(`${flag} needs a value`);
    if (flag === '--export-leaderboard') args.exportTo = value;
    else if (flag === '--leaderboard-file') args.leaderboardFile = value;
    else if (flag === '--web-dir') args.webDir = value;
    else {
      if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 65535) throw new UsageError(`--port expects 1-65535, got "${value}"`);
      args.port = Number(value);
    }
  }
  return args;
}
