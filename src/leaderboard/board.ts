/**
 * Local leaderboard rules (Ticket-04 section 3). Pure: no DOM, no fs. Shared by the web build and the Node launcher,
 * so both validate and sort the same way.
 */

export interface Entry {
  name: string;
  score: number;
  nights_won: number;
  /** ISO 8601 with a time zone offset, e.g. 2026-11-20T21:05:07+07:00. */
  achieved_at: string;
  seed: number;
}

export const MAX_ENTRIES = 10;
export const NAME_MIN = 3;
export const NAME_MAX = 12;

export type NameCheck = { ok: true; name: string } | { ok: false; reason: string };

/** Trim, NFC-normalise, then 3-12 characters of letters (Vietnamese diacritics included), digits or `_`. */
export function validateName(raw: string): NameCheck {
  const name = raw.trim().normalize('NFC');
  const length = [...name].length;
  if (length < NAME_MIN || length > NAME_MAX) return { ok: false, reason: `Tên cần ${NAME_MIN}–${NAME_MAX} ký tự` };
  if (![...name].every((ch) => /^[\p{L}\p{M}\p{N}_]$/u.test(ch))) return { ok: false, reason: 'Chỉ dùng chữ, số và _' };
  return { ok: true, name };
}

/** Score descending; equal scores: the earlier `achieved_at` first; still equal: keep the given order (stable). */
export function sortEntries(entries: readonly Entry[]): Entry[] {
  return entries
    .map((e, i) => ({ e, i }))
    .sort((a, b) => b.e.score - a.e.score || Date.parse(a.e.achieved_at) - Date.parse(b.e.achieved_at) || a.i - b.i)
    .map((x) => x.e);
}

/** A new list: `entries` plus `e`, sorted, cut to the top 10. */
export function addEntry(entries: readonly Entry[], e: Entry): Entry[] {
  return sortEntries([...entries, e]).slice(0, MAX_ENTRIES);
}

const pad = (n: number, width = 2): string => String(Math.abs(n)).padStart(width, '0');

/**
 * `2026-11-20T21:05:07+07:00`: the local wall-clock time of `d` with its offset. `offsetMinutes` is the zone's
 * offset east of UTC (default: this machine's, `-d.getTimezoneOffset()`); it is a parameter so tests can fix it.
 */
export function isoWithOffset(d: Date, offsetMinutes: number = -d.getTimezoneOffset()): string {
  const t = new Date(d.getTime() + offsetMinutes * 60000);
  const sign = offsetMinutes < 0 ? '-' : '+';
  return (
    `${pad(t.getUTCFullYear(), 4)}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}` +
    `T${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}:${pad(t.getUTCSeconds())}` +
    `${sign}${pad(Math.trunc(Math.abs(offsetMinutes) / 60))}:${pad(Math.abs(offsetMinutes) % 60)}`
  );
}

/** ISO 8601 date-time that carries a zone (`Z` or ±hh:mm) and really parses. */
const ISO_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

/** The entry if it is well formed (name rules, integer score >= 0, nights_won 0-3, dated, integer seed), else null. */
export function parseEntry(raw: unknown): Entry | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.name !== 'string') return null;
  const name = validateName(o.name);
  if (!name.ok) return null;
  if (typeof o.score !== 'number' || !Number.isSafeInteger(o.score) || o.score < 0) return null;
  if (typeof o.nights_won !== 'number' || !Number.isInteger(o.nights_won) || o.nights_won < 0 || o.nights_won > 3) return null;
  if (typeof o.achieved_at !== 'string' || !ISO_WITH_ZONE.test(o.achieved_at) || Number.isNaN(Date.parse(o.achieved_at))) return null;
  if (typeof o.seed !== 'number' || !Number.isSafeInteger(o.seed)) return null;
  return { name: name.name, score: o.score, nights_won: o.nights_won, achieved_at: o.achieved_at, seed: o.seed };
}

/** Tolerant reader for `{"entries": [...]}` (or a bare array): drops invalid entries, returns the sorted top 10. */
export function parseBoard(json: unknown): Entry[] {
  const list = Array.isArray(json) ? json : typeof json === 'object' && json !== null ? (json as { entries?: unknown }).entries : undefined;
  if (!Array.isArray(list)) return [];
  const valid: Entry[] = [];
  for (const raw of list) {
    const e = parseEntry(raw);
    if (e) valid.push(e);
  }
  return sortEntries(valid).slice(0, MAX_ENTRIES);
}
