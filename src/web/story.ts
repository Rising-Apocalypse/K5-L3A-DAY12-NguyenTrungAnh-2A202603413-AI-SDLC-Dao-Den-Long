// Text and numbers of the night intro screen (pure). The Ông Đăng lines are in assumptions.md.
import { getLevel } from '../core/levels';
import type { Tuning } from '../core/tuning';
import { lanternsNeeded } from './hudlogic';

export const ONG_DANG_LINES: Record<1 | 2 | 3, string> = {
  1: 'Gió mùa về rồi con ạ. Thắp đèn, giữ lửa cho tới khi gà gáy.',
  2: 'Hai đảo, một cây cầu tre. Coi chừng Gió Lạc, nó thích đom đóm của con lắm.',
  3: 'Chuông trên đỉnh tháp chờ con. Gió lớn lắm, đứng cho vững.',
};

export interface IntroInfo {
  night: 1 | 2 | 3;
  islandName: string;
  durationS: number;
  lanternTotal: number;
  lanternsNeeded: number;
  quote: string;
}

export function nightDurationS(night: 1 | 2 | 3, t: Tuning): number {
  return night === 1 ? t.night1_duration_s : night === 2 ? t.night2_duration_s : t.night3_duration_s;
}

export function introInfo(night: 1 | 2 | 3, t: Tuning): IntroInfo {
  const level = getLevel(night);
  const total = level.lanternPositions.length;
  return {
    night,
    islandName: level.islandName,
    durationS: nightDurationS(night, t),
    lanternTotal: total,
    lanternsNeeded: lanternsNeeded(t, total),
    quote: ONG_DANG_LINES[night],
  };
}

/** `m phút s giây` style length for the intro, e.g. 270 -> "4 phút 30 giây". */
export function formatDuration(totalS: number): string {
  const m = Math.floor(totalS / 60);
  const s = Math.round(totalS % 60);
  return s === 0 ? `${m} phút` : m === 0 ? `${s} giây` : `${m} phút ${s} giây`;
}
