import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FormatError } from '../../src/core/errors';
import { parseScenario } from '../../src/core/scenario';

// The sample scenario from Test Contract section D.
const CONTRACT_SAMPLE = {
  player: { pos: [0, 0, 0], carried: 0, flames: 3 },
  random_motes: false,
  random_shades: false,
  motes: [[0, 0, 5]],
  shades: [{ pos: [10, 0, 0] }],
  lanterns: [{ id: 'L1', pos: [0, 0, 25], deposited: 0 }],
  time_left_s: 300,
};

describe('parseScenario', () => {
  it('parses the contract sample', () => {
    expect(parseScenario(CONTRACT_SAMPLE)).toEqual({
      player: { pos: [0, 0, 0], carried: 0, flames: 3 },
      randomMotes: false,
      randomShades: false,
      motes: [[0, 0, 5]],
      shades: [{ pos: [10, 0, 0] }],
      lanterns: [{ id: 'L1', pos: [0, 0, 25], deposited: 0 }],
      timeLeftS: 300,
    });
  });

  it('parses every fixture scenario file', () => {
    for (const name of ['contract-sample', 'walk-north-60', 'empty-world']) {
      const json = JSON.parse(readFileSync(`tests/scenarios/${name}/scenario.json`, 'utf8'));
      expect(() => parseScenario(json), name).not.toThrow();
    }
  });

  it('accepts an empty object (everything defaults) and ignores unknown keys', () => {
    expect(parseScenario({})).toEqual({});
    expect(parseScenario({ note: 'hello', future_field: [1, 2, 3] })).toEqual({});
  });

  it('keeps optional shade ids, lantern lit flags and empty lists', () => {
    const s = parseScenario({
      motes: [],
      shades: [{ pos: [1, 2, 3], id: 'S7' }],
      lanterns: [{ id: 'L5', lit: true, deposited: 4 }],
    });
    expect(s.motes).toEqual([]);
    expect(s.shades).toEqual([{ pos: [1, 2, 3], id: 'S7' }]);
    expect(s.lanterns).toEqual([{ id: 'L5', lit: true, deposited: 4 }]);
  });

  it.each([
    ['top level is an array', []],
    ['top level is a string', 'scenario'],
    ['top level is null', null],
    ['player not an object', { player: 5 }],
    ['player.pos has 2 numbers', { player: { pos: [0, 0] } }],
    ['player.pos has a string', { player: { pos: [0, 'a', 0] } }],
    ['player.pos has NaN', { player: { pos: [0, Number.NaN, 0] } }],
    ['player.carried negative', { player: { carried: -1 } }],
    ['player.carried fractional', { player: { carried: 1.5 } }],
    ['player.flames a string', { player: { flames: '3' } }],
    ['random_motes not boolean', { random_motes: 'no' }],
    ['random_shades not boolean', { random_shades: 0 }],
    ['motes not an array', { motes: 'none' }],
    ['mote with 2 numbers', { motes: [[1, 2]] }],
    ['mote not an array', { motes: [{ x: 1 }] }],
    ['shades not an array', { shades: {} }],
    ['shade not an object', { shades: [[1, 2, 3]] }],
    ['shade without pos', { shades: [{ id: 'S1' }] }],
    ['shade pos wrong', { shades: [{ pos: [1, 2] }] }],
    ['shade id not a string', { shades: [{ pos: [0, 0, 0], id: 5 }] }],
    ['shade id empty', { shades: [{ pos: [0, 0, 0], id: '' }] }],
    ['shade ids duplicated', { shades: [{ pos: [0, 0, 0], id: 'S1' }, { pos: [1, 0, 0], id: 'S1' }] }],
    ['lanterns not an array', { lanterns: 'L1' }],
    ['lantern without id', { lanterns: [{ pos: [0, 0, 0] }] }],
    ['lantern id malformed', { lanterns: [{ id: 'X1' }] }],
    ['lantern id lowercase', { lanterns: [{ id: 'l1' }] }],
    ['lantern pos wrong', { lanterns: [{ id: 'L1', pos: [0, 0] }] }],
    ['lantern lit not boolean', { lanterns: [{ id: 'L1', lit: 'yes' }] }],
    ['lantern deposited negative', { lanterns: [{ id: 'L1', deposited: -1 }] }],
    ['lantern deposited fractional', { lanterns: [{ id: 'L1', deposited: 0.5 }] }],
    ['time_left_s negative', { time_left_s: -1 }],
    ['time_left_s a string', { time_left_s: '300' }],
    ['time_left_s infinite', { time_left_s: Number.POSITIVE_INFINITY }],
  ])('throws FormatError: %s', (_name, doc) => {
    expect(() => parseScenario(doc)).toThrow(FormatError);
  });
});
