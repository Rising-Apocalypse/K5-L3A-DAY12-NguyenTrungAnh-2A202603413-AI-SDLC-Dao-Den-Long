import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { addEntry, parseBoard, sortEntries, type Entry } from '../leaderboard/board';

/** Leaderboard on disk: `{"entries": [...]}`. A missing or unreadable file is an empty board. */
export function readBoard(file: string): Entry[] {
  try {
    return parseBoard(JSON.parse(readFileSync(file, 'utf8')));
  } catch {
    return [];
  }
}

/** Atomic write (temp file in the same folder, then rename). The folder is created on demand. */
export function writeBoard(file: string, entries: readonly Entry[]): void {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify({ entries: sortEntries(entries) }, null, 2) + '\n');
  renameSync(tmp, file);
}

/** Add one (already validated) entry and persist; returns the new top 10. */
export function saveEntry(file: string, entry: Entry): Entry[] {
  const next = addEntry(readBoard(file), entry);
  writeBoard(file, next);
  return next;
}
