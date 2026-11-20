// Pure frame-time statistics for the benchmark (Ticket-04 section 1). No DOM, no Three.

export interface BenchStats {
  frames: number;
  avg_fps: number;
  p1_low_fps: number;
  frame_ms_p95: number;
}

const round1 = (x: number): number => Math.round(x * 10) / 10;

/**
 * `dts` = frame times in ms.
 *   avg_fps      = 1000 * N / sum(dt)
 *   p1_low_fps   = 1000 / mean of the k largest dt, k = max(1, ceil(N / 100))
 *   frame_ms_p95 = sorted[ceil(0.95 * N) - 1] (nearest rank)
 * The ceilings use integer arithmetic (N / 100, 95 * N / 100) so floating point cannot push them up by one.
 */
export function benchStats(dts: readonly number[]): BenchStats {
  const n = dts.length;
  if (n === 0) return { frames: 0, avg_fps: 0, p1_low_fps: 0, frame_ms_p95: 0 };
  const sorted = [...dts].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const k = Math.max(1, Math.ceil(n / 100));
  const worst = sorted.slice(n - k);
  const meanWorst = worst.reduce((a, b) => a + b, 0) / k;
  return {
    frames: n,
    avg_fps: round1((1000 * n) / sum),
    p1_low_fps: round1(1000 / meanWorst),
    frame_ms_p95: round1(sorted[Math.ceil((95 * n) / 100) - 1]!),
  };
}
