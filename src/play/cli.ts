import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { UsageError } from '../core/errors';
import { parsePlayArgs } from './args';
import { createPlayServer, listenFrom } from './server';
import { readBoard } from './store';

/** dist/play.js lives in <root>/dist; the web build is <root>/dist/web and the data folder is <root>/data. */
const HERE = dirname(fileURLToPath(import.meta.url));
const PORT_TRIES = 11; // 4173 .. 4183

function openBrowser(url: string): void {
  const [cmd, args] =
    process.platform === 'darwin' ? ['open', [url]] : process.platform === 'win32' ? ['cmd', ['/c', 'start', '""', url]] : ['xdg-open', [url]];
  try {
    const child = spawn(cmd!, args as string[], { stdio: 'ignore', detached: true });
    child.on('error', () => process.stdout.write(`could not open a browser automatically, open ${url} yourself\n`));
    child.unref();
  } catch {
    process.stdout.write(`could not open a browser automatically, open ${url} yourself\n`);
  }
}

async function run(argv: string[]): Promise<void> {
  const args = parsePlayArgs(argv);
  const boardFile = resolve(args.leaderboardFile ?? join(HERE, '..', 'data', 'leaderboard.json'));

  if (args.exportTo !== undefined) {
    const entries = readBoard(boardFile); // already sorted, top 10; missing file = empty
    try {
      mkdirSync(dirname(resolve(args.exportTo)), { recursive: true });
      writeFileSync(args.exportTo, JSON.stringify({ entries }, null, 2) + '\n');
    } catch (e) {
      throw new UsageError(`cannot write "${args.exportTo}": ${(e as Error).message}`);
    }
    process.stdout.write(`exported ${entries.length} leaderboard entries to ${args.exportTo}\n`);
    return;
  }

  const webDir = resolve(args.webDir ?? join(HERE, 'web'));
  if (!existsSync(join(webDir, 'index.html'))) throw new UsageError(`${join(webDir, 'index.html')} not found: run npm run build first`);

  const server = createPlayServer(webDir, boardFile);
  const port = await listenFrom(server, args.port, PORT_TRIES);
  const url = `http://127.0.0.1:${port}/`;
  process.stdout.write(`Dao Den Long is running at ${url}\nLeaderboard file: ${boardFile}\nPress Ctrl+C to stop.\n`);
  if (!args.noOpen) openBrowser(url);
}

run(process.argv.slice(2)).catch((e) => {
  process.stderr.write(`error: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
