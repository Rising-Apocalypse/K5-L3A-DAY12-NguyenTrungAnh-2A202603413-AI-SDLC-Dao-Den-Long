// Subtitle line and edge arrows toward newly spawned shades (DOM). Logic lives in captions.ts; this only draws.
import type { GameEvent, GameState, Vec3 } from '../core/types';
import { captionsFor, CaptionQueue, initialMemory, summarize, type CaptionMemory } from './captions';
import { edgeArrow, type EdgeArrow } from './hudlogic';

export type CueProjector = (pos: Vec3, out: { x: number; y: number; behind: boolean }) => void;

const MAX_ARROWS = 3;

export function createCues(lowFuelUnits: number) {
  const box = document.getElementById('captions');
  const arrowsBox = document.getElementById('shade-arrows');
  if (!box || !arrowsBox) throw new Error('missing #captions / #shade-arrows in index.html');
  const queue = new CaptionQueue();
  let memory: CaptionMemory = initialMemory();
  let lastKey = '';
  const arrows: HTMLElement[] = [];
  for (let i = 0; i < MAX_ARROWS; i++) {
    const a = document.createElement('div');
    a.className = 'shade-arrow';
    arrowsBox.appendChild(a);
    arrows.push(a);
  }
  const proj = { x: 0, y: 0, behind: false };
  const edge: EdgeArrow = { visible: false, x: 0, y: 0, rotDeg: 0 };

  return {
    /** A new night starts: forget the queue and take the state as the baseline. */
    reset(state: GameState): void {
      queue.clear();
      memory = summarize(state, lowFuelUnits);
      lastKey = '';
      box.replaceChildren();
      for (const a of arrows) a.style.display = 'none';
    },
    onStep(events: readonly GameEvent[], state: GameState, timeS: number): void {
      const r = captionsFor(memory, events, state, lowFuelUnits);
      memory = r.next;
      for (const c of r.captions) queue.add(c, timeS);
    },
    /** Redraw. `enabled` is the "Phụ đề" setting. */
    update(state: GameState, timeS: number, enabled: boolean, project: CueProjector, width: number, height: number): void {
      const live = enabled ? queue.active(timeS) : [];
      const key = live.map((c) => c.text).join('\n');
      if (key !== lastKey) {
        lastKey = key;
        box.replaceChildren(
          ...live.map((c) => {
            const d = document.createElement('div');
            d.className = 'caption';
            d.textContent = c.text;
            return d;
          }),
        );
      }
      let n = 0;
      for (const c of live) {
        if (c.shadeId === undefined || n >= arrows.length) continue;
        const shade = state.shades.find((s) => s.id === c.shadeId);
        if (!shade) continue;
        project(shade.pos, proj);
        edgeArrow(proj.x, proj.y, proj.behind, width, height, 50, edge);
        if (!edge.visible) continue;
        const a = arrows[n++]!;
        a.style.transform = `translate(${edge.x.toFixed(0)}px, ${edge.y.toFixed(0)}px) rotate(${edge.rotDeg.toFixed(0)}deg)`;
        a.style.display = 'block';
      }
      for (let i = n; i < arrows.length; i++) arrows[i]!.style.display = 'none';
    },
  };
}
