/**
 * Creative extras registry. WEB ONLY: `src/web` passes `EXTRAS` to `createGame`; the headless CLI never
 * loads this module, so extras can never change the graded headless output. Extras use the dedicated
 * "extras" random stream they receive and must not break PRD-0 or the Test Contract.
 *
 * `EXTRAS` (game hooks that run inside `step()`) stays empty on purpose: "Đom đóm dẫn đường" (`guide.ts`) is a
 * purely visual extra that only reads `game.state` from the web layer, so it needs no hook into the simulation.
 */
import type { Extra } from '../core/types';

export type { Extra };
export { FireflyGuide, GUIDE_COOLDOWN_S, GUIDE_DURATION_S, GUIDE_FIREFLIES, guidePoint, helpTarget } from './guide';

export const EXTRAS: Extra[] = [];
