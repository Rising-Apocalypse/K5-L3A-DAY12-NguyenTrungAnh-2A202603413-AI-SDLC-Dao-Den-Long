import { describe, expect, it } from 'vitest';
import { FormatError } from '../../src/core/errors';
import { parseScenario } from '../../src/core/scenario';
import { createGame } from '../../src/core/sim';

describe('scenario drifters (Nights 2-3)', () => {
  it('parses id, state and stolen; a bare { pos } stays just { pos }', () => {
    const s = parseScenario({
      drifters: [{ pos: [1, 2, 3] }, { pos: [4, 5, 6], id: 'D7', state: 'flee', stolen: 3 }, { pos: [0, 0, 0], state: 'chase' }],
    });
    expect(s.drifters).toEqual([{ pos: [1, 2, 3] }, { pos: [4, 5, 6], id: 'D7', state: 'flee', stolen: 3 }, { pos: [0, 0, 0], state: 'chase' }]);
  });

  it.each([
    ['duplicate id', { drifters: [{ pos: [0, 0, 0], id: 'D1' }, { pos: [1, 0, 0], id: 'D1' }] }],
    ['empty id', { drifters: [{ pos: [0, 0, 0], id: '' }] }],
    ['unknown state', { drifters: [{ pos: [0, 0, 0], state: 'sleep' }] }],
    ['negative stolen', { drifters: [{ pos: [0, 0, 0], stolen: -1 }] }],
    ['fractional stolen', { drifters: [{ pos: [0, 0, 0], stolen: 1.5 }] }],
  ])('rejects %s with a FormatError', (_name, doc) => {
    expect(() => parseScenario(doc)).toThrow(FormatError);
  });

  it('the game numbers drifters without an id with the lowest unused D<n>, flee gets 240 ticks, flee/stolen are kept', () => {
    const game = createGame({
      seed: 1,
      night: 2,
      scenario: parseScenario({ drifters: [{ pos: [0, 0, 0] }, { pos: [1, 0, 0], id: 'D1', state: 'flee', stolen: 2 }, { pos: [2, 0, 0] }] }),
    });
    expect(game.state.drifters.map((d) => [d.id, d.state, d.stolen, d.fleeTicks])).toEqual([
      ['D2', 'idle', 0, 0],
      ['D1', 'flee', 2, 240],
      ['D3', 'idle', 0, 0],
    ]);
    expect(game.snapshot().drifters.map((d) => d.id)).toEqual(['D1', 'D2', 'D3']); // snapshot is in ascending id order
  });

  it('a scenario naming lantern L6 or L7 is valid on Night 2 / 3 and unknown on Night 1', () => {
    expect(() => createGame({ seed: 1, night: 2, scenario: parseScenario({ lanterns: [{ id: 'L6', lit: true }] }) })).not.toThrow();
    expect(() => createGame({ seed: 1, night: 3, scenario: parseScenario({ lanterns: [{ id: 'L7', lit: true }] }) })).not.toThrow();
    expect(() => createGame({ seed: 1, night: 2, scenario: parseScenario({ lanterns: [{ id: 'L7' }] }) })).toThrow(FormatError);
    expect(() => createGame({ seed: 1, scenario: parseScenario({ lanterns: [{ id: 'L6' }] }) })).toThrow(FormatError);
  });
});
