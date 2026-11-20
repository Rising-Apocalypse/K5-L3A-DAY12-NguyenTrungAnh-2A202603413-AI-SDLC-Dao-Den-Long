import { describe, expect, it } from 'vitest';
import { createGame, TICK_RATE } from '../../src/core/sim';
import { TUNING } from '../../src/core/tuning';
import type { GameEvent, GameState } from '../../src/core/types';
import { captionsFor, CAPTION_MAX, CAPTION_SECONDS, CaptionQueue, initialMemory, summarize } from '../../src/web/captions';

const LOW = TUNING.low_fuel_threshold * TICK_RATE;
const fresh = (): GameState => createGame({ seed: 1, night: 1 }).state;
const texts = (r: { captions: Array<{ text: string }> }): string[] => r.captions.map((c) => c.text);

describe('captionsFor', () => {
  it('shade_spawned: caption plus the shade id for the edge arrow', () => {
    const s = fresh();
    const r = captionsFor(summarize(s, LOW), [{ name: 'shade_spawned', data: { id: 'S3' } }], s, LOW);
    expect(r.captions).toEqual([{ text: 'Bóng Mực xuất hiện', shadeId: 'S3' }]);
  });

  it('drifter steal and lantern out', () => {
    const s = fresh();
    const ev: GameEvent[] = [
      { name: 'drifter_steal', data: { drifter_id: 'D1', amount: 3, carried: 2 } },
      { name: 'lantern_out', data: { lantern_id: 'L1' } },
    ];
    expect(texts(captionsFor(summarize(s, LOW), ev, s, LOW))).toEqual(['Gió Lạc cướp 3 đom đóm', 'Đèn L1 đã tắt']);
  });

  it('wind warning only on the rising edge', () => {
    const s = fresh();
    const mem = summarize(s, LOW);
    s.wind.warning = true;
    const r1 = captionsFor(mem, [], s, LOW);
    expect(texts(r1)).toEqual(['Gió mạnh sắp tới!']);
    expect(texts(captionsFor(r1.next, [], s, LOW))).toEqual([]);
    s.wind.warning = false;
    const r3 = captionsFor(r1.next, [], s, LOW);
    s.wind.warning = true;
    expect(texts(captionsFor(r3.next, [], s, LOW))).toEqual(['Gió mạnh sắp tới!']);
  });

  it('"10 giây cuối!" once per night', () => {
    const s = fresh();
    let mem = summarize(s, LOW);
    s.timeLeftS = 10.5;
    let r = captionsFor(mem, [], s, LOW);
    expect(texts(r)).toEqual([]);
    mem = r.next;
    s.timeLeftS = 10;
    r = captionsFor(mem, [], s, LOW);
    expect(texts(r)).toEqual(['10 giây cuối!']);
    s.timeLeftS = 9;
    expect(texts(captionsFor(r.next, [], s, LOW))).toEqual([]);
    // a night that starts inside the last 10 s does not announce it (baseline), a fresh summary of a full night does
    expect(summarize(s, LOW).lastSecondsShown).toBe(true);
    expect(initialMemory().lastSecondsShown).toBe(false);
  });

  it('low fuel fires when a lit lantern crosses below the threshold, once per lantern', () => {
    const s = fresh();
    const [a, b] = s.lanterns;
    a!.lit = true;
    a!.fuelUnits = LOW;
    b!.lit = true;
    b!.fuelUnits = 6000;
    let r = captionsFor(summarize(s, LOW), [], s, LOW);
    expect(texts(r)).toEqual([]);
    a!.fuelUnits = LOW - 1;
    r = captionsFor(r.next, [], s, LOW);
    expect(texts(r)).toEqual([`Đèn ${a!.id} sắp cạn dầu`]);
    expect(texts(captionsFor(r.next, [], s, LOW))).toEqual([]);
    // refuelled above the threshold, then drops again: announced again
    a!.fuelUnits = LOW + 10;
    r = captionsFor(r.next, [], s, LOW);
    a!.fuelUnits = LOW - 1;
    expect(texts(captionsFor(r.next, [], s, LOW))).toEqual([`Đèn ${a!.id} sắp cạn dầu`]);
  });

  it('an unlit lantern never counts as low on fuel', () => {
    const s = fresh();
    s.lanterns[0]!.lit = false;
    s.lanterns[0]!.fuelUnits = 0;
    expect(texts(captionsFor(initialMemory(), [], s, LOW))).toEqual([]);
  });
});

describe('CaptionQueue', () => {
  it('newest first, at most 3, each alive 3 s', () => {
    const q = new CaptionQueue();
    q.add({ text: 'a' }, 0);
    q.add({ text: 'b' }, 1);
    q.add({ text: 'c' }, 2);
    q.add({ text: 'd' }, 2.5);
    expect(CAPTION_MAX).toBe(3);
    expect(q.active(2.5).map((c) => c.text)).toEqual(['d', 'c', 'b']);
    expect(CAPTION_SECONDS).toBe(3);
    expect(q.active(4.1).map((c) => c.text)).toEqual(['d', 'c']);
    expect(q.active(5.5).map((c) => c.text)).toEqual([]);
  });
  it('clear empties it', () => {
    const q = new CaptionQueue();
    q.add({ text: 'a', shadeId: 'S1' }, 0);
    q.clear();
    expect(q.active(0)).toEqual([]);
  });
});
