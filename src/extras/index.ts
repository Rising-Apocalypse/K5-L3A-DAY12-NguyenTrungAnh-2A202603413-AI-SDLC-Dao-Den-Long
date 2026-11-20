/**
 * Creative extras registry. WEB ONLY: `src/web` passes `EXTRAS` to `createGame`; the headless CLI never
 * loads this module, so extras can never change the graded headless output. Extras use the dedicated
 * "extras" random stream they receive and must not break PRD-0 or the Test Contract.
 */
import type { Extra } from '../core/types';

export type { Extra };

export const EXTRAS: Extra[] = [];
