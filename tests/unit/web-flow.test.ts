import { describe, expect, it } from 'vitest';
import { initialFlow, reduce, totalScore, type FlowAction, type FlowState } from '../../src/web/flow';

const run = (actions: FlowAction[], from: FlowState = initialFlow()): FlowState => actions.reduce(reduce, from);

describe('web flow state machine', () => {
  it('starts at the menu; Bắt đầu goes to the Night 1 intro, then play', () => {
    const f0 = initialFlow();
    expect(f0.screen).toBe('menu');
    const f1 = run([{ type: 'start' }]);
    expect([f1.screen, f1.night]).toEqual(['intro', 1]);
    expect(f1.epoch).toBeGreaterThan(f0.epoch);
    expect(run([{ type: 'start' }, { type: 'begin' }]).screen).toBe('playing');
  });

  it('Chọn Đêm jumps to the intro of that night', () => {
    const f = run([{ type: 'select', night: 3 }]);
    expect([f.screen, f.night]).toEqual(['intro', 3]);
  });

  it('wins Night 1 and 2 lead to the next intro; winning Night 3 leads to dawn', () => {
    let f = run([{ type: 'start' }, { type: 'begin' }, { type: 'finish', won: true, score: 1000 }]);
    expect([f.screen, f.won]).toEqual(['result', true]);
    f = run([{ type: 'next' }, { type: 'begin' }, { type: 'finish', won: true, score: 1500 }], f);
    expect([f.screen, f.night]).toEqual(['result', 2]);
    f = run([{ type: 'next' }], f);
    expect([f.screen, f.night]).toEqual(['intro', 3]);
    f = run([{ type: 'begin' }, { type: 'finish', won: true, score: 2000 }], f);
    expect(f.screen).toBe('dawn');
    expect(totalScore(f)).toBe(4500);
  });

  it('a loss offers a retry of the same night and does not add to the total', () => {
    let f = run([{ type: 'start' }, { type: 'begin' }, { type: 'finish', won: false, score: 300 }]);
    expect([f.screen, f.won, f.night]).toEqual(['result', false, 1]);
    expect(totalScore(f)).toBe(0);
    const epoch = f.epoch;
    f = run([{ type: 'next' }], f); // no next night after a loss
    expect(f.screen).toBe('result');
    f = run([{ type: 'retry' }], f);
    expect([f.screen, f.night]).toEqual(['playing', 1]);
    expect(f.epoch).toBeGreaterThan(epoch);
  });

  it('a replayed night counts once, with its winning score', () => {
    let f = run([{ type: 'start' }, { type: 'begin' }, { type: 'finish', won: true, score: 1000 }]);
    f = run([{ type: 'retry' }, { type: 'finish', won: true, score: 1200 }], f);
    expect(f.wins).toEqual({ 1: 1200 });
    expect(totalScore(f)).toBe(1200);
    f = run([{ type: 'retry' }, { type: 'finish', won: false, score: 5 }], f); // a later loss does not erase the win
    expect(totalScore(f)).toBe(1200);
  });

  it('retry from the pause menu restarts the night; menu returns to the menu; a new run resets the total', () => {
    let f = run([{ type: 'start' }, { type: 'begin' }, { type: 'finish', won: true, score: 700 }, { type: 'next' }, { type: 'begin' }]);
    const e = f.epoch;
    f = run([{ type: 'retry' }], f);
    expect([f.screen, f.night]).toEqual(['playing', 2]);
    expect(f.epoch).toBeGreaterThan(e);
    f = run([{ type: 'menu' }], f);
    expect(f.screen).toBe('menu');
    f = run([{ type: 'start' }], f);
    expect(totalScore(f)).toBe(0);
  });

  it('actions that do not fit the screen are ignored (same object back)', () => {
    const f = initialFlow();
    expect(reduce(f, { type: 'begin' })).toBe(f);
    expect(reduce(f, { type: 'finish', won: true, score: 1 })).toBe(f);
    expect(reduce(f, { type: 'next' })).toBe(f);
    expect(reduce(f, { type: 'retry' })).toBe(f);
    const intro = reduce(f, { type: 'start' });
    expect(reduce(intro, { type: 'start' })).toBe(intro);
  });
});
