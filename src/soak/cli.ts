import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createGame, type Game } from '../core/sim';
import { Rng } from '../core/rng';
import { TUNING } from '../core/tuning';
import type { InputState } from '../core/types';
import { parseSoakArgs } from './args';

const DURATION_KEYS = ['night1_duration_s', 'night2_duration_s', 'night3_duration_s'] as const;
const mb = (bytes: number): number => Math.round((bytes / 1048576) * 10) / 10;
const collect = (): void => {
  (globalThis as { gc?: () => void }).gc?.();
};

/** Steps of the warm-up game that runs before the first night. */
const WARMUP_STEPS = 1800;

type NightResult = 'won' | 'lost' | 'timeout' | 'crash';

/** One night with seeded random inputs (Ticket-04 section 2). Returns the result and the steps run. */
function playNight(game: Game, seed: number, maxSteps: number): { result: NightResult; ticks: number } {
  const rng = new Rng(seed, 'soak');
  const input: InputState = { move: [0, 0], jump: false, interact: false, pulse: false, dash: false, pause: false, camYawDeg: 0 };
  let steps = 0;
  while (steps < maxSteps && game.state.state === 'playing') {
    if (steps % 30 === 0) {
      const angle = rng.range(0, 2 * Math.PI);
      input.move = [Math.cos(angle), Math.sin(angle)];
    }
    input.jump = rng.next() < 0.05;
    input.dash = rng.next() < 0.03;
    input.pulse = rng.next() < 0.02;
    input.interact = rng.next() < 0.1;
    game.step(input);
    steps++;
  }
  const s = game.state.state;
  return { result: s === 'won' ? 'won' : s === 'lost' ? 'lost' : 'timeout', ticks: steps };
}

function run(argv: string[]): void {
  const args = parseSoakArgs(argv);
  const startedAt = Date.now();
  // Untimed, discarded warm-up (not a night): lets the JIT and the heap reach their working size, so mem_start_mb is
  // not a cold-process number (see docs/notes/assumptions.md, Phase 4).
  for (const n of [1, 2, 3] as const) playNight(createGame({ seed: args.seed, night: n }), args.seed, WARMUP_STEPS);
  const results: NightResult[] = [];
  let crashes = 0;
  let memStart: number | null = null;

  for (let i = 1; i <= args.nights; i++) {
    const night = (((i - 1) % 3) + 1) as 1 | 2 | 3;
    const seed = args.seed + i;
    let game: Game | null = null;
    let outcome: { result: NightResult; ticks: number };
    try {
      game = createGame({ seed, night });
      if (memStart === null) {
        collect();
        memStart = mb(process.memoryUsage().rss);
      }
      outcome = playNight(game, seed, Math.round(TUNING[DURATION_KEYS[night - 1]!] * 60));
    } catch (e) {
      crashes += 1;
      outcome = { result: 'crash', ticks: 0 };
      process.stderr.write(`night ${i} crashed: ${e instanceof Error ? e.message : String(e)}\n`);
    }
    game = null;
    results.push(outcome.result);
    if (args.verbose) process.stdout.write(`${night} ${seed} ${outcome.result} ${outcome.ticks}\n`);
  }

  collect();
  const memEnd = mb(process.memoryUsage().rss);
  if (memStart === null) memStart = memEnd;
  const durationS = Math.round((Date.now() - startedAt) / 100) / 10;
  const doc = {
    contract_version: '1.3',
    nights: args.nights,
    crashes,
    results,
    mem_start_mb: memStart,
    mem_end_mb: memEnd,
    duration_s: durationS,
  };
  mkdirSync(dirname(args.out), { recursive: true });
  writeFileSync(args.out, JSON.stringify(doc, null, 2) + '\n');

  const memOk = memEnd <= 1.2 * memStart;
  process.stdout.write(
    `soak: ${args.nights} nights, ${crashes} crashes, mem ${memStart} -> ${memEnd} MB, ${durationS}s | ` +
      `crashes = 0: ${crashes === 0 ? 'PASS' : 'FAIL'}, mem_end <= 1.2 x mem_start: ${memOk ? 'PASS' : 'FAIL'}\n`,
  );
}

try {
  run(process.argv.slice(2));
} catch (e) {
  process.stderr.write(`error: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exitCode = 1;
}
