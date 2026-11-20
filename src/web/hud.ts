import { xzDist } from '../core/geom';
import { TICK_RATE } from '../core/sim';
import type { Tuning } from '../core/tuning';
import type { GameEvent, GameState } from '../core/types';

const byId = (id: string): HTMLElement => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id} in index.html`);
  return el;
};

const REASON_TEXT = {
  all_lit: ['Bình minh! Đảo đã sáng lại', 'Cả 5 Đèn Lồng Lớn đã được thắp.'],
  dawn: ['Trời sáng mất rồi...', 'Hết đêm mà các đèn chưa sáng hết.'],
  no_flames: ['Bóng Mực đã nuốt ánh sáng...', 'Mây đã hết ngọn lửa.'],
} as const;

/** DOM overlay: time, lanterns, flames, carried, pulse cooldown, score, the "E" prompt, a hit flash and the end banner. */
export function createHud(tuning: Tuning) {
  const time = byId('hud-time');
  const score = byId('hud-score');
  const flames = byId('hud-flames');
  const carried = byId('hud-carried');
  const lanterns = byId('hud-lanterns');
  const pulse = byId('hud-pulse');
  const prompt = byId('prompt');
  const flash = byId('flash');
  const banner = byId('banner');
  const bannerText = byId('banner-text');
  const bannerScore = byId('banner-score');
  const bannerSub = byId('banner-sub');

  let reason: keyof typeof REASON_TEXT | null = null;

  const set = (el: HTMLElement, label: string, value: string) => {
    el.innerHTML = `${label}: <b>${value}</b>`;
  };

  return {
    /** Feed the events of a step: a hit flashes the screen red, game_over remembers why the night ended. */
    onEvents(events: readonly GameEvent[]): void {
      for (const e of events) {
        if (e.name === 'player_hit') {
          flash.classList.remove('on');
          void flash.offsetWidth; // restart the CSS transition
          flash.classList.add('on');
          requestAnimationFrame(() => flash.classList.remove('on'));
        } else if (e.name === 'game_over') {
          reason = e.data.reason;
        }
      }
    },

    /** Forget the previous night (called on restart). */
    reset(): void {
      reason = null;
      flash.classList.remove('on');
    },

    update(state: GameState): void {
      const p = state.player;
      const secs = Math.max(0, Math.ceil(state.timeLeftS));
      set(time, 'Thời gian', `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`);
      set(lanterns, 'Đèn lồng', `${state.lanterns.filter((l) => l.lit).length}/${state.lanterns.length}`);
      set(flames, 'Ngọn lửa', `${'●'.repeat(Math.max(0, p.flames))}${p.flames <= 0 ? '0' : ''}`);
      flames.classList.toggle('bad', p.flames <= 1);
      set(carried, 'Ánh sáng mang theo', `${p.carried}/${tuning.carry_capacity}`);
      set(score, 'Điểm', String(state.score));

      const cooling = p.pulseCooldownTicks > 0;
      const canPulse = !cooling && p.carried >= tuning.pulse_cost;
      set(
        pulse,
        'Toả sáng [F]',
        cooling ? `hồi ${(p.pulseCooldownTicks / TICK_RATE).toFixed(1)}s` : canPulse ? 'sẵn sàng' : `cần ${tuning.pulse_cost} ánh sáng`,
      );
      pulse.classList.toggle('dim', !canPulse);

      // "E" prompt: nearest unlit lantern within interact_radius, with how full it already is.
      let near: GameState['lanterns'][number] | null = null;
      let best = Infinity;
      for (const l of state.lanterns) {
        const d = xzDist(p.pos, l.pos);
        if (!l.lit && d <= tuning.interact_radius && d < best) {
          near = l;
          best = d;
        }
      }
      if (state.state !== 'playing') {
        prompt.style.display = 'none';
      } else if (p.fallWaitTicks > 0) {
        prompt.textContent = 'Mây rơi khỏi đảo...';
        prompt.style.display = 'block';
      } else if (near) {
        prompt.textContent = `E — Nạp ánh sáng (${near.deposited}/${tuning.lantern_cost})`;
        prompt.style.display = 'block';
      } else {
        prompt.style.display = 'none';
      }

      const over = state.state !== 'playing';
      banner.style.display = over ? 'flex' : 'none';
      banner.classList.toggle('lost', state.state === 'lost');
      if (over) {
        const [title, sub] = REASON_TEXT[reason ?? (state.state === 'won' ? 'all_lit' : 'no_flames')];
        bannerText.textContent = title;
        bannerScore.textContent = `Điểm cuối: ${state.score}`;
        bannerSub.textContent = sub;
      }
    },
  };
}
