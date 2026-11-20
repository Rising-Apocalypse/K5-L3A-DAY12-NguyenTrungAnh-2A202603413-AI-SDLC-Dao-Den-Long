import { describe, expect, it } from 'vitest';
import { benchStats } from '../../src/web/benchstats';

describe('benchStats', () => {
  it('N = 4 [10, 10, 20, 40]: sum 80 -> 50 fps; k = 1 -> 1000/40 = 25; p95 rank ceil(3.8) = 4 -> 40', () => {
    expect(benchStats([10, 10, 20, 40])).toEqual({ frames: 4, avg_fps: 50, p1_low_fps: 25, frame_ms_p95: 40 });
  });

  it('N = 100 of 1..100 ms: sum 5050 -> 19.8 fps; k = 1 -> 1000/100 = 10; p95 rank 95 -> 95', () => {
    const dts = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(benchStats(dts)).toEqual({ frames: 100, avg_fps: 19.8, p1_low_fps: 10, frame_ms_p95: 95 });
  });

  it('N = 250: k = ceil(2.5) = 3; 246 x 10 ms + [100, 90, 80, 70]', () => {
    // sum = 2460 + 340 = 2800 -> 1000*250/2800 = 89.2857 -> 89.3
    // k = 3 largest: 100, 90, 80 -> mean 90 -> 1000/90 = 11.11 -> 11.1
    // p95 rank = ceil(237.5) = 238 -> index 237 -> still among the 246 tens -> 10
    const dts = [...Array(246).fill(10), 100, 90, 80, 70];
    expect(benchStats(dts)).toEqual({ frames: 250, avg_fps: 89.3, p1_low_fps: 11.1, frame_ms_p95: 10 });
  });

  it('is independent of the order of the input and does not modify it', () => {
    const dts = [40, 10, 20, 10];
    expect(benchStats(dts)).toEqual(benchStats([10, 10, 20, 40]));
    expect(dts).toEqual([40, 10, 20, 10]);
  });

  it('an exact multiple of 100 frames does not round k up: N = 700 -> k = 7', () => {
    // 693 x 10 ms + 7 x 20 ms: the 7 largest are all 20 -> p1 = 1000/20 = 50. With k = 8 the mean would be 20 - 10/8 = 18.75 -> 53.3.
    const dts = [...Array(693).fill(10), ...Array(7).fill(20)];
    expect(benchStats(dts).p1_low_fps).toBe(50);
  });

  it('one frame, and no frames', () => {
    expect(benchStats([16])).toEqual({ frames: 1, avg_fps: 62.5, p1_low_fps: 62.5, frame_ms_p95: 16 });
    expect(benchStats([]).frames).toBe(0);
  });
});
