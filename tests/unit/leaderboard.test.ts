import { describe, expect, it } from 'vitest';
import { addEntry, isoWithOffset, parseBoard, parseEntry, sortEntries, validateName, type Entry } from '../../src/leaderboard/board';

const e = (name: string, score: number, at: string, extra: Partial<Entry> = {}): Entry => ({ name, score, nights_won: 1, achieved_at: at, seed: 1, ...extra });

describe('validateName', () => {
  it('length boundaries 2 / 3 / 12 / 13', () => {
    expect(validateName('ab').ok).toBe(false);
    expect(validateName('abc')).toEqual({ ok: true, name: 'abc' });
    expect(validateName('a'.repeat(12))).toEqual({ ok: true, name: 'a'.repeat(12) });
    const long = validateName('a'.repeat(13));
    expect(long).toEqual({ ok: false, reason: 'Tên cần 3–12 ký tự' });
    expect(validateName('ab')).toEqual({ ok: false, reason: 'Tên cần 3–12 ký tự' });
  });

  it('accepts ASCII, digits, underscore and Vietnamese with diacritics', () => {
    expect(validateName('Mây_01')).toEqual({ ok: true, name: 'Mây_01' });
    expect(validateName('Đăng')).toEqual({ ok: true, name: 'Đăng' });
    expect(validateName('Nguyễn_Văn')).toEqual({ ok: true, name: 'Nguyễn_Văn' });
  });

  it('counts characters after NFC: decomposed "Đăng" (D-bar + a + breve) is 4 characters, not 5+', () => {
    const decomposed = 'Đăng'; // a + combining breve
    const r = validateName(decomposed);
    expect(r).toEqual({ ok: true, name: 'Đăng' });
    expect(r.ok && [...r.name].length).toBe(4);
  });

  it('trims outer spaces but rejects inner spaces, symbols and emoji', () => {
    expect(validateName('  abc  ')).toEqual({ ok: true, name: 'abc' });
    expect(validateName('  ab  ').ok).toBe(false); // trims to 2 characters
    expect(validateName('a b c')).toEqual({ ok: false, reason: 'Chỉ dùng chữ, số và _' });
    expect(validateName('abc-def')).toEqual({ ok: false, reason: 'Chỉ dùng chữ, số và _' });
    expect(validateName('😀😀😀')).toEqual({ ok: false, reason: 'Chỉ dùng chữ, số và _' });
    expect(validateName('ab😀')).toEqual({ ok: false, reason: 'Chỉ dùng chữ, số và _' });
  });
});

describe('sortEntries / addEntry', () => {
  it('score descending', () => {
    const s = sortEntries([e('aaa', 10, '2026-01-01T00:00:00+07:00'), e('bbb', 30, '2026-01-02T00:00:00+07:00'), e('ccc', 20, '2026-01-03T00:00:00+07:00')]);
    expect(s.map((x) => x.name)).toEqual(['bbb', 'ccc', 'aaa']);
  });

  it('tie: the earlier achieved_at first, compared as instants across offsets', () => {
    // 10:00+07:00 = 03:00Z is earlier than 09:00+00:00 = 09:00Z although "09" < "10" as text says the opposite
    const late = e('late', 50, '2026-01-01T09:00:00+00:00');
    const early = e('early', 50, '2026-01-01T10:00:00+07:00');
    expect(sortEntries([late, early]).map((x) => x.name)).toEqual(['early', 'late']);
  });

  it('a further tie keeps insertion order', () => {
    const at = '2026-01-01T00:00:00Z';
    expect(sortEntries([e('one', 5, at), e('two', 5, at), e('three', 5, at)]).map((x) => x.name)).toEqual(['one', 'two', 'three']);
  });

  it('the 11th entry is dropped and the input is not mutated', () => {
    let list: Entry[] = [];
    for (let i = 1; i <= 10; i++) list = addEntry(list, e(`p${i}`, i * 10, '2026-01-01T00:00:00Z'));
    expect(list).toHaveLength(10);
    const frozen = [...list];
    const lower = addEntry(list, e('low', 5, '2026-01-01T00:00:00Z')); // below the 10th (score 10)
    expect(lower.map((x) => x.name)).not.toContain('low');
    expect(lower).toHaveLength(10);
    const higher = addEntry(list, e('top', 105, '2026-01-01T00:00:00Z'));
    expect(higher[0]!.name).toBe('top');
    expect(higher.map((x) => x.name)).not.toContain('p1'); // lowest (10) pushed out
    expect(higher).toHaveLength(10);
    expect(list).toEqual(frozen);
  });
});

describe('isoWithOffset', () => {
  // 2026-11-20T14:05:07Z; +07:00 -> 21:05:07
  const d = new Date(Date.UTC(2026, 10, 20, 14, 5, 7));
  it('formats local time with the offset', () => {
    expect(isoWithOffset(d, 420)).toBe('2026-11-20T21:05:07+07:00');
    expect(isoWithOffset(d, 0)).toBe('2026-11-20T14:05:07+00:00');
    expect(isoWithOffset(d, -330)).toBe('2026-11-20T08:35:07-05:30'); // 14:05 - 5:30
  });
  it('rolls over midnight with the offset (23:30Z + 07:00 = next day 06:30)', () => {
    expect(isoWithOffset(new Date(Date.UTC(2026, 10, 20, 23, 30, 0)), 420)).toBe('2026-11-21T06:30:00+07:00');
  });
  it('the default offset is the machine one and still parses back to the same instant', () => {
    const s = isoWithOffset(d);
    expect(s).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
    expect(Date.parse(s)).toBe(d.getTime());
  });
});

describe('parseBoard / parseEntry', () => {
  const ok = e('Mây_01', 100, '2026-11-20T21:05:07+07:00', { nights_won: 3, seed: 42 });
  it('keeps valid entries, drops invalid ones, sorts and caps at 10', () => {
    const junk = [
      null, 5, 'x', {},
      { ...ok, name: 'ab' },
      { ...ok, score: -1 },
      { ...ok, score: 1.5 },
      { ...ok, nights_won: 4 },
      { ...ok, achieved_at: 'yesterday' },
      { ...ok, achieved_at: '2026-11-20T21:05:07' }, // no zone
      { ...ok, seed: 'x' },
    ];
    expect(parseBoard({ entries: [...junk, ok] })).toEqual([ok]);
    const many = Array.from({ length: 12 }, (_, i) => e(`pl${i}`, i, '2026-01-01T00:00:00Z'));
    const board = parseBoard({ entries: many });
    expect(board).toHaveLength(10);
    expect(board[0]!.score).toBe(11);
    expect(board[9]!.score).toBe(2);
  });
  it('tolerates non-board JSON', () => {
    expect(parseBoard(null)).toEqual([]);
    expect(parseBoard({ entries: 3 })).toEqual([]);
    expect(parseBoard([ok])).toEqual([ok]);
  });
  it('parseEntry normalises the name', () => {
    expect(parseEntry({ ...ok, name: '  Mây_01 ' })).toEqual(ok);
  });
});
