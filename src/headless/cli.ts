import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { FormatError, UsageError } from '../core/errors';
import { parseInputsFile } from '../core/input';
import { parseScenario } from '../core/scenario';
import { createGame } from '../core/sim';
import { parseArgs } from './args';

/** Read and JSON-parse a file. Missing/unreadable -> UsageError (exit 1); invalid JSON -> FormatError (exit 2). */
function readJson(kind: string, path: string): unknown {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (e) {
    throw new UsageError(`cannot read ${kind} file "${path}": ${(e as Error).message}`);
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new FormatError(`${kind} file "${path}" is not valid JSON: ${(e as Error).message}`);
  }
}

function run(argv: string[]): void {
  const args = parseArgs(argv);
  const scenario = args.scenario !== undefined ? parseScenario(readJson('scenario', args.scenario)) : undefined;
  // No inputs file -> an empty timeline, i.e. the player stands still.
  const timeline = parseInputsFile(args.inputs !== undefined ? readJson('inputs', args.inputs) : { frames: [] });
  const game = createGame({ seed: args.seed, scenario });

  const lines: string[] = [JSON.stringify(game.snapshot())];
  let steps = 0;
  for (let k = 0; k < args.ticks; k++) {
    const events = game.step(timeline.at(k));
    steps = k + 1;
    for (const e of events) {
      lines.push(JSON.stringify({ type: 'event', tick: steps, name: e.name, data: e.data }));
    }
    if (steps % args.snapshotEvery === 0) lines.push(JSON.stringify(game.snapshot()));
    if (game.state.state !== 'playing') break;
  }
  lines.push(JSON.stringify({ type: 'end', ticks: steps, state: game.state.state, score: game.state.score }));

  mkdirSync(dirname(args.out), { recursive: true });
  writeFileSync(args.out, lines.join('\n') + '\n');
}

try {
  run(process.argv.slice(2));
} catch (e) {
  if (e instanceof FormatError) {
    process.stderr.write(`error (malformed input): ${e.message}\n`);
    process.exitCode = 2;
  } else {
    process.stderr.write(`error: ${e instanceof Error ? e.message : String(e)}\n`);
    process.exitCode = 1;
  }
}
