import { describe, expect, it } from 'vitest';
import type { Entry } from '../../src/leaderboard/board';
import { initialFlow, reduce, type FlowState } from '../../src/web/flow';
import { API_URL, createLeaderboardStore, LEADERBOARD_KEY } from '../../src/web/leaderboardStore';
import { formatWhen, makeRunEntry, nightsWon, SubmitGuard } from '../../src/web/runentry';
import type { StorageLike } from '../../src/web/settings';

const mem = (initial: Record<string, string> = {}): StorageLike & { data: Record<string, string> } => {
  const data = { ...initial };
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) };
};
const entry = (name: string, score: number, at = '2026-11-20T10:00:00+07:00'): Entry => ({ name, score, nights_won: 1, achieved_at: at, seed: 1 });

describe('leaderboard store: localStorage fallback', () => {
  it('no fetch: empty board, add keeps sorted top 10 under dao-den-long.leaderboard.v1', async () => {
    expect(LEADERBOARD_KEY).toBe('dao-den-long.leaderboard.v1');
    const storage = mem();
    const store = createLeaderboardStore({ storage });
    expect(await store.load()).toEqual([]);
    expect(store.backend()).toBe('local');
    await store.add(entry('Anh', 100));
    await store.add(entry('Binh', 300));
    const after = await store.add(entry('Chau', 200));
    expect(after.map((e) => e.name)).toEqual(['Binh', 'Chau', 'Anh']);
    expect(JSON.parse(storage.data[LEADERBOARD_KEY]!).entries).toHaveLength(3);
    // survives a "restart": a new store over the same storage
    expect((await createLeaderboardStore({ storage }).load()).map((e) => e.name)).toEqual(['Binh', 'Chau', 'Anh']);
  });

  it('keeps only 10, ties: earlier first', async () => {
    const store = createLeaderboardStore({ storage: mem() });
    for (let i = 0; i < 12; i++) await store.add(entry(`Player${i}`, 50, `2026-11-20T10:${String(i).padStart(2, '0')}:00+07:00`));
    const board = await store.load();
    expect(board).toHaveLength(10);
    expect(board[0]!.name).toBe('Player0');
  });

  it('corrupt storage reads as empty; a throwing storage still works for the session (memory)', async () => {
    expect(await createLeaderboardStore({ storage: mem({ [LEADERBOARD_KEY]: '{bad' }) }).load()).toEqual([]);
    const throwing: StorageLike = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); } };
    const store = createLeaderboardStore({ storage: throwing });
    const list = await store.add(entry('Anh', 10));
    expect(list).toHaveLength(1);
    expect(await store.load()).toHaveLength(1);
    const none = createLeaderboardStore({});
    expect((await none.add(entry('Anh', 10))).length).toBe(1);
  });
});

describe('leaderboard store: launcher API', () => {
  it('uses the API and remembers it', async () => {
    const calls: string[] = [];
    const fetchFn = async (url: string, init?: { method?: string; body?: string }) => {
      calls.push(`${init?.method ?? 'GET'} ${url}`);
      const entries = init?.body ? [JSON.parse(init.body)] : [entry('Anh', 5)];
      return { ok: true, json: async () => ({ entries }) };
    };
    const storage = mem();
    const store = createLeaderboardStore({ fetchFn, storage });
    expect((await store.load()).map((e) => e.name)).toEqual(['Anh']);
    expect(store.backend()).toBe('api');
    expect((await store.add(entry('Binh', 9))).map((e) => e.name)).toEqual(['Binh']);
    expect(calls).toEqual([`GET ${API_URL}`, `POST ${API_URL}`]);
    expect(storage.data[LEADERBOARD_KEY]).toBeUndefined();
  });

  it.each([
    ['network error', async () => { throw new Error('offline'); }],
    ['404', async () => ({ ok: false, json: async () => ({}) })],
    ['static host returning html', async () => ({ ok: true, json: async () => { throw new Error('not json'); } })],
    ['wrong json shape', async () => ({ ok: true, json: async () => ({ hello: 1 }) })],
  ])('%s falls back to localStorage and stops asking', async (_n, fetchFn) => {
    let n = 0;
    const counted = async (u: string, i?: unknown) => {
      n++;
      return (fetchFn as (u: string, i?: unknown) => Promise<{ ok: boolean; json(): Promise<unknown> }>)(u, i);
    };
    const store = createLeaderboardStore({ fetchFn: counted, storage: mem() });
    expect(await store.load()).toEqual([]);
    expect(store.backend()).toBe('local');
    await store.add(entry('Anh', 1));
    expect(n).toBe(1);
  });

  it('a hanging API times out and falls back', async () => {
    const fetchFn = () => new Promise<never>(() => {});
    const store = createLeaderboardStore({ fetchFn, storage: mem(), timeoutMs: 20 });
    expect(await store.load()).toEqual([]);
    expect(store.backend()).toBe('local');
  });
});

describe('run end -> entry', () => {
  it('fields: score = total of nights won, nights_won, ISO date with offset, seed', () => {
    let f = reduce(initialFlow(), { type: 'start' });
    f = reduce(f, { type: 'begin' });
    f = reduce(f, { type: 'finish', won: true, score: 100 });
    f = reduce(f, { type: 'next' });
    f = reduce(f, { type: 'begin' });
    f = reduce(f, { type: 'finish', won: false, score: 40 });
    const e = makeRunEntry(f, 'Mây_01', 7, new Date(Date.UTC(2026, 10, 20, 14, 5, 7)), 420);
    expect(e).toEqual({ name: 'Mây_01', score: 100, nights_won: 1, achieved_at: '2026-11-20T21:05:07+07:00', seed: 7 });
  });

  it('a lost first night: score 0, nights_won 0', () => {
    let f = reduce(initialFlow(), { type: 'start' });
    f = reduce(f, { type: 'begin' });
    f = reduce(f, { type: 'finish', won: false, score: 12 });
    expect(makeRunEntry(f, 'Anh', 1, new Date(0), 0)).toMatchObject({ score: 0, nights_won: 0, achieved_at: '1970-01-01T00:00:00+00:00' });
  });

  it('a replayed night counts once (latest winning score), all three nights = 3', () => {
    // night 1 won (50), night 2 lost then replayed and won (60 then 70 replaced), night 3 won (80)
    let f = reduce(initialFlow(), { type: 'start' });
    const run = (won: boolean, score: number) => {
      f = reduce(f, { type: 'begin' });
      f = reduce(f, { type: 'finish', won, score });
    };
    run(true, 50);
    f = reduce(f, { type: 'next' });
    run(false, 5);
    f = reduce(f, { type: 'retry' });
    f = { ...f, screen: 'playing' };
    f = reduce(f, { type: 'finish', won: true, score: 60 });
    f = reduce(f, { type: 'next' });
    run(true, 80);
    expect(f.screen).toBe('dawn');
    expect(nightsWon(f)).toBe(3);
    expect(makeRunEntry(f, 'Anh', 1, new Date(0), 0).score).toBe(190);
    // replay night 3 from the dawn flow state: same night won again, still 3 nights
    const again = { ...f, wins: { ...f.wins, 3: 99 } };
    expect(nightsWon(again)).toBe(3);
  });
});

describe('SubmitGuard', () => {
  it('saves once per run end; a failed save can be retried; a new run end is a new id', () => {
    const g = new SubmitGuard();
    expect(g.begin('1')).toBe(true);
    expect(g.begin('1')).toBe(false); // double click while pending
    g.release('1');
    expect(g.begin('1')).toBe(true);
    g.commit('1');
    expect(g.saved('1')).toBe(true);
    expect(g.begin('1')).toBe(false); // already saved
    expect(g.begin('2')).toBe(true);
    expect(g.begin('3')).toBe(false); // another save still pending
    g.commit('2');
    expect(g.begin('3')).toBe(true);
  });
});

describe('formatWhen', () => {
  it('dd/MM/yyyy HH:mm from the stored local time', () => {
    expect(formatWhen('2026-11-20T21:05:07+07:00')).toBe('20/11/2026 21:05');
    expect(formatWhen('garbage')).toBe('garbage');
  });
});
