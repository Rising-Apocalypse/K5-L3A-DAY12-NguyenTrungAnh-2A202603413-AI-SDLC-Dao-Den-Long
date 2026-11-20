// Leaderboard storage adapter: the launcher API (GET/POST /api/leaderboard) when it answers, else localStorage.
import { addEntry, parseBoard, type Entry } from '../leaderboard/board';
import type { StorageLike } from './settings';

export const LEADERBOARD_KEY = 'dao-den-long.leaderboard.v1';
export const API_URL = '/api/leaderboard';
export const API_TIMEOUT_MS = 1500;

export type Backend = 'api' | 'local';
type FetchFn = (input: string, init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<{
  ok: boolean;
  json(): Promise<unknown>;
}>;

export interface StoreDeps {
  fetchFn?: FetchFn | null;
  storage?: StorageLike | null;
  timeoutMs?: number;
}

export interface LeaderboardStore {
  load(): Promise<Entry[]>;
  add(e: Entry): Promise<Entry[]>;
  /** Which backend answered last; null before the first call. */
  backend(): Backend | null;
}

export function createLeaderboardStore(deps: StoreDeps): LeaderboardStore {
  const fetchFn = deps.fetchFn ?? null;
  const storage = deps.storage ?? null;
  const timeoutMs = deps.timeoutMs ?? API_TIMEOUT_MS;
  let backend: Backend | null = null;
  let memory: Entry[] = []; // last resort when localStorage is unusable

  async function callApi(init?: { method: string; body: string }): Promise<Entry[]> {
    if (!fetchFn) throw new Error('no fetch');
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        ctl?.abort();
        reject(new Error('timeout'));
      }, timeoutMs);
    });
    try {
      const job = (async () => {
        const res = await fetchFn(API_URL, init ? { ...init, headers: { 'content-type': 'application/json' }, signal: ctl?.signal } : { signal: ctl?.signal });
        if (!res.ok) throw new Error('http error');
        const json = (await res.json()) as { entries?: unknown } | null;
        if (!json || !Array.isArray(json.entries)) throw new Error('not the leaderboard API');
        return parseBoard(json);
      })();
      return await Promise.race([job, timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

  function readLocal(): Entry[] {
    try {
      const text = storage?.getItem(LEADERBOARD_KEY);
      if (text) return parseBoard(JSON.parse(text));
    } catch {
      /* fall through to memory */
    }
    return memory;
  }
  function writeLocal(entries: Entry[]): void {
    memory = entries;
    try {
      storage?.setItem(LEADERBOARD_KEY, JSON.stringify({ entries }));
    } catch {
      /* kept in memory */
    }
  }

  return {
    backend: () => backend,
    async load() {
      if (backend !== 'local') {
        try {
          const entries = await callApi();
          backend = 'api';
          return entries;
        } catch {
          backend = 'local';
        }
      }
      return readLocal();
    },
    async add(e) {
      if (backend !== 'local') {
        try {
          const entries = await callApi({ method: 'POST', body: JSON.stringify(e) });
          backend = 'api';
          return entries;
        } catch {
          backend = 'local';
        }
      }
      const entries = addEntry(readLocal(), e);
      writeLocal(entries);
      return entries;
    },
  };
}
