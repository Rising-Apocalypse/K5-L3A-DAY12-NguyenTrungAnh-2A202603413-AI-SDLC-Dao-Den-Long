// Run end -> leaderboard entry, the once-per-run guard and the table's date format. Pure.
import { isoWithOffset, type Entry } from '../leaderboard/board';
import { totalScore, type FlowState } from './flow';

/** Number of distinct nights won in this run (a replayed night counts once): 0..3. */
export const nightsWon = (f: Pick<FlowState, 'wins'>): number => Object.keys(f.wins).length;

/** The entry for a finished run: total of nights won, distinct nights won, now (local time + offset), the run seed. */
export function makeRunEntry(f: FlowState, name: string, seed: number, now: Date, offsetMinutes?: number): Entry {
  return {
    name,
    score: totalScore(f),
    nights_won: nightsWon(f),
    achieved_at: isoWithOffset(now, offsetMinutes),
    seed,
  };
}

/** Lets each run end save once: `begin(id)` is true the first time and false for the same id until `release(id)`. */
export class SubmitGuard {
  private readonly done = new Set<string>();
  private pending: string | null = null;

  /** Reserve `id` for a save. False when it is already saved or a save is under way. */
  begin(id: string): boolean {
    if (this.pending !== null || this.done.has(id)) return false;
    this.pending = id;
    return true;
  }
  /** The save worked: `id` stays used. */
  commit(id: string): void {
    if (this.pending === id) this.pending = null;
    this.done.add(id);
  }
  /** The save failed or was cancelled: `id` can be tried again. */
  release(id: string): void {
    if (this.pending === id) this.pending = null;
  }
  saved(id: string): boolean {
    return this.done.has(id);
  }
}

/** `dd/MM/yyyy HH:mm` from the wall-clock part of an ISO 8601 string (the local time the run ended); unparsable text is returned as is. */
export function formatWhen(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : iso;
}
