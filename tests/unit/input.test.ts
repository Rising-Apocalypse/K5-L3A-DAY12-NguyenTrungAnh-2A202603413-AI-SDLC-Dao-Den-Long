import { describe, expect, it } from 'vitest';
import { FormatError } from '../../src/core/errors';
import { defaultInput, parseInputsFile, risingEdges, worldMove } from '../../src/core/input';

describe('input timeline', () => {
  it('uses the defaults before the first frame (and with no frames at all)', () => {
    expect(parseInputsFile({ frames: [] }).at(0)).toEqual(defaultInput());
    const t = parseInputsFile({ frames: [{ tick: 5, move: [1, 0] }] });
    expect(t.at(0)).toEqual(defaultInput());
    expect(t.at(4)).toEqual(defaultInput());
    expect(t.at(5).move).toEqual([1, 0]);
  });

  it('keeps absent fields from the previous frame', () => {
    const t = parseInputsFile({
      frames: [
        { tick: 0, move: [0, 1], cam_yaw_deg: 90 },
        { tick: 10, interact: true },
        { tick: 20, interact: false, pulse: true },
      ],
    });
    expect(t.at(9)).toMatchObject({ move: [0, 1], camYawDeg: 90, interact: false, pulse: false });
    expect(t.at(10)).toMatchObject({ move: [0, 1], camYawDeg: 90, interact: true, pulse: false });
    expect(t.at(19)).toMatchObject({ interact: true });
    expect(t.at(20)).toMatchObject({ move: [0, 1], camYawDeg: 90, interact: false, pulse: true });
    expect(t.at(100000)).toMatchObject({ move: [0, 1], pulse: true });
  });

  it('ignores unknown frame keys', () => {
    const t = parseInputsFile({ frames: [{ tick: 0, move: [1, 0], comment: 'hi', extra: 42 }] });
    expect(t.at(0).move).toEqual([1, 0]);
  });

  it('answers any tick correctly regardless of query order (100k+ ticks)', () => {
    const frames = [];
    for (let i = 0; i < 1000; i++) frames.push({ tick: i * 150, move: [i % 2 === 0 ? 1 : -1, 0] });
    const t = parseInputsFile({ frames });
    for (let tick = 200000; tick >= 0; tick -= 37) {
      const i = Math.min(999, Math.floor(tick / 150)); // frames stop at tick 149850; the last one persists
      expect(t.at(tick).move[0]).toBe(i % 2 === 0 ? 1 : -1);
    }
  });

  it('rejects duplicate and decreasing ticks (must be strictly increasing)', () => {
    expect(() => parseInputsFile({ frames: [{ tick: 5 }, { tick: 5 }] })).toThrow(FormatError);
    expect(() => parseInputsFile({ frames: [{ tick: 5 }, { tick: 3 }] })).toThrow(FormatError);
    expect(() => parseInputsFile({ frames: [{ tick: 0 }, { tick: 1 }, { tick: 1 }] })).toThrow(FormatError);
    expect(() => parseInputsFile({ frames: [{ tick: 0 }, { tick: 1 }, { tick: 2 }] })).not.toThrow();
  });

  it.each([
    ['top level is an array', []],
    ['top level is null', null],
    ['frames missing', {}],
    ['frames not an array', { frames: {} }],
    ['frame not an object', { frames: [5] }],
    ['tick missing', { frames: [{ move: [0, 0] }] }],
    ['tick negative', { frames: [{ tick: -1 }] }],
    ['tick fractional', { frames: [{ tick: 1.5 }] }],
    ['tick a string', { frames: [{ tick: '3' }] }],
    ['move length 3', { frames: [{ tick: 0, move: [0, 0, 0] }] }],
    ['move length 1', { frames: [{ tick: 0, move: [0] }] }],
    ['move component above 1', { frames: [{ tick: 0, move: [1.5, 0] }] }],
    ['move component below -1', { frames: [{ tick: 0, move: [0, -1.01] }] }],
    ['move component a string', { frames: [{ tick: 0, move: ['a', 0] }] }],
    ['move component NaN', { frames: [{ tick: 0, move: [Number.NaN, 0] }] }],
    ['move not an array', { frames: [{ tick: 0, move: 'up' }] }],
    ['cam_yaw_deg a string', { frames: [{ tick: 0, cam_yaw_deg: '90' }] }],
    ['cam_yaw_deg infinite', { frames: [{ tick: 0, cam_yaw_deg: Number.POSITIVE_INFINITY }] }],
    ['jump not a boolean', { frames: [{ tick: 0, jump: 1 }] }],
    ['interact not a boolean', { frames: [{ tick: 0, interact: 'true' }] }],
    ['pulse not a boolean', { frames: [{ tick: 0, pulse: null }] }],
    ['dash not a boolean', { frames: [{ tick: 0, dash: 0 }] }],
  ])('throws FormatError: %s', (_name, doc) => {
    expect(() => parseInputsFile(doc)).toThrow(FormatError);
  });
});

describe('worldMove', () => {
  const near = (actual: [number, number], expected: [number, number]) => {
    expect(actual[0]).toBeCloseTo(expected[0], 9);
    expect(actual[1]).toBeCloseTo(expected[1], 9);
  };

  it('yaw 0: x is +X and z is +Z', () => {
    near(worldMove([1, 0], 0), [1, 0]);
    near(worldMove([0, 1], 0), [0, 1]);
  });

  it('yaw 90', () => {
    near(worldMove([0, 1], 90), [1, 0]);
    near(worldMove([1, 0], 90), [0, -1]);
  });

  it('yaw 180', () => {
    near(worldMove([0, 1], 180), [0, -1]);
    near(worldMove([1, 0], 180), [-1, 0]);
  });

  it('yaw -90', () => {
    near(worldMove([0, 1], -90), [-1, 0]);
    near(worldMove([1, 0], -90), [0, 1]);
  });

  it('normalises vectors longer than 1', () => {
    const [x, z] = worldMove([1, 1], 0);
    expect(Math.hypot(x, z)).toBeCloseTo(1, 12);
    near([x, z], [Math.SQRT1_2, Math.SQRT1_2]);
    const [rx, rz] = worldMove([1, 1], 37);
    expect(Math.hypot(rx, rz)).toBeCloseTo(1, 12);
  });

  it('leaves shorter vectors alone', () => {
    near(worldMove([0.5, 0], 0), [0.5, 0]);
    near(worldMove([0, 0], 123), [0, 0]);
    const [x, z] = worldMove([0.3, 0.4], 50);
    expect(Math.hypot(x, z)).toBeCloseTo(0.5, 12);
  });
});

describe('risingEdges', () => {
  const none = { jump: false, interact: false, pulse: false, dash: false };

  it('reports only false -> true transitions', () => {
    expect(risingEdges(none, { ...none, jump: true })).toEqual({ ...none, jump: true });
    expect(risingEdges({ ...none, jump: true }, { ...none, jump: true })).toEqual(none);
    expect(risingEdges({ ...none, jump: true }, none)).toEqual(none);
    expect(risingEdges(none, { jump: true, interact: true, pulse: true, dash: true })).toEqual({
      jump: true,
      interact: true,
      pulse: true,
      dash: true,
    });
  });
});
