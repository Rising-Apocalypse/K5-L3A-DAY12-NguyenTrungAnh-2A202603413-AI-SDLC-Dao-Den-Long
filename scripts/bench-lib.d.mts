export const DEFAULT_SEED: number;
export const DEFAULT_DURATION_S: number;
export const WARMUP_S: number;
export const USAGE: string;
export function parseBenchArgs(argv: string[]): { seed: number; duration: number; out: string };
export function browserCandidates(platform: string, env?: Record<string, string | undefined>): string[];
export function findBrowser(candidates: string[], exists: (path: string) => boolean, pathDirs?: string[], sep?: string): string | null;
export function browserArgs(userDataDir: string, url: string): string[];
export function sumTreeRssKb(psOutput: string, rootPid: number): number;
export function kbToMb(kb: number): number;
export function benchDocument(input: {
  stats: { avg_fps: number; p1_low_fps: number; frame_ms_p95: number; frames: number };
  loadMs: number;
  peakMemMb: number | null;
  renderer: string;
  os: string;
}): Record<string, unknown>;
export function thresholds(doc: { avg_fps: number; p1_low_fps: number; load_ms: number }): { avg_fps: boolean; p1_low_fps: boolean; load_ms: boolean };
export function benchPageUrl(port: number, seed: number, duration: number): string;
