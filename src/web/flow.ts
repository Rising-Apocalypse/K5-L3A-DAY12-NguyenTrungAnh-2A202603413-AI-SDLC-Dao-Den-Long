// Screen flow of the web game as a pure state machine (no DOM): menu -> intro(n) -> playing(n) -> result(n, won)
// -> intro(n+1) ... and, after winning Night 3, the dawn screen with the total score.

export type Night = 1 | 2 | 3;
export type ScreenKind = 'menu' | 'intro' | 'playing' | 'result' | 'dawn';

export interface FlowState {
  screen: ScreenKind;
  night: Night;
  /** Result of the night that just ended (only meaningful on `result` and `dawn`). */
  won: boolean;
  lastScore: number;
  /** Winning score per night in this run. A replayed night counts once (its latest winning score). */
  wins: Partial<Record<Night, number>>;
  /** Bumped whenever a new game must be created (entering a night or replaying it). */
  epoch: number;
}

export type FlowAction =
  | { type: 'start' }
  | { type: 'select'; night: Night }
  | { type: 'begin' }
  | { type: 'finish'; won: boolean; score: number }
  | { type: 'next' }
  | { type: 'retry' }
  | { type: 'menu' };

export const LAST_NIGHT: Night = 3;

export function initialFlow(): FlowState {
  return { screen: 'menu', night: 1, won: false, lastScore: 0, wins: {}, epoch: 0 };
}

/** Sum of the final scores of the nights won in this run. */
export function totalScore(f: FlowState): number {
  return (f.wins[1] ?? 0) + (f.wins[2] ?? 0) + (f.wins[3] ?? 0);
}

/** Actions that do not apply to the current screen return the same state object. */
export function reduce(f: FlowState, a: FlowAction): FlowState {
  switch (a.type) {
    case 'start':
      if (f.screen !== 'menu') return f;
      return { ...f, screen: 'intro', night: 1, wins: {}, won: false, lastScore: 0, epoch: f.epoch + 1 };
    case 'select':
      if (f.screen !== 'menu') return f;
      return { ...f, screen: 'intro', night: a.night, wins: {}, won: false, lastScore: 0, epoch: f.epoch + 1 };
    case 'begin':
      return f.screen === 'intro' ? { ...f, screen: 'playing' } : f;
    case 'finish': {
      if (f.screen !== 'playing') return f;
      const wins = a.won ? { ...f.wins, [f.night]: a.score } : f.wins;
      const screen: ScreenKind = a.won && f.night === LAST_NIGHT ? 'dawn' : 'result';
      return { ...f, screen, won: a.won, lastScore: a.score, wins };
    }
    case 'next':
      if (f.screen !== 'result' || !f.won || f.night >= LAST_NIGHT) return f;
      return { ...f, screen: 'intro', night: (f.night + 1) as Night, epoch: f.epoch + 1 };
    case 'retry':
      // From the result screen after a loss or from the pause menu: the same night again, straight into play.
      if (f.screen !== 'result' && f.screen !== 'playing') return f;
      return { ...f, screen: 'playing', epoch: f.epoch + 1 };
    case 'menu':
      return { ...f, screen: 'menu', epoch: f.epoch + 1 };
  }
}
