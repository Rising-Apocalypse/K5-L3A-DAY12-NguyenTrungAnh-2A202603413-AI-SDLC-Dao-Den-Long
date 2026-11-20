// Key remapping (Ticket-04 section 4). Pure: codes are `KeyboardEvent.code` strings, no DOM.

export const ACTIONS = ['up', 'down', 'left', 'right', 'jump', 'dash', 'interact', 'pulse', 'pause'] as const;
export type Action = (typeof ACTIONS)[number];
export type KeyMap = Record<Action, string>;

export const DEFAULT_KEYMAP: Readonly<KeyMap> = Object.freeze({
  up: 'KeyW',
  down: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  jump: 'Space',
  dash: 'ShiftLeft',
  interact: 'KeyE',
  pulse: 'KeyF',
  pause: 'KeyP',
});

/** Codes that cannot be bound: they have a fixed job (menus, restart, colour palette, guide firefly, camera). */
export const RESERVED_CODES: readonly string[] = ['Escape', 'KeyR', 'KeyC', 'KeyH', 'BracketLeft', 'BracketRight'];

/** Fixed secondary keys. They only act for their action while the code is not bound to another action in the map. */
export const SECONDARY_KEYS: Readonly<Partial<Record<Action, readonly string[]>>> = {
  up: ['ArrowUp'],
  down: ['ArrowDown'],
  left: ['ArrowLeft'],
  right: ['ArrowRight'],
  pause: ['Escape'],
};

export const ACTION_LABELS: Readonly<Record<Action, string>> = {
  up: 'Tiến',
  down: 'Lùi',
  left: 'Sang trái',
  right: 'Sang phải',
  jump: 'Nhảy',
  dash: 'Lướt',
  interact: 'Nạp ánh sáng',
  pulse: 'Toả sáng',
  pause: 'Tạm dừng',
};

export const isReserved = (code: string): boolean => RESERVED_CODES.includes(code);

/** Human-readable key name for a `KeyboardEvent.code`. */
export function keyLabel(code: string): string {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad\d$/.test(code)) return `Num ${code.slice(6)}`;
  const names: Record<string, string> = {
    Space: 'Space',
    ShiftLeft: 'Shift trái',
    ShiftRight: 'Shift phải',
    ControlLeft: 'Ctrl trái',
    ControlRight: 'Ctrl phải',
    AltLeft: 'Alt trái',
    AltRight: 'Alt phải',
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
    Enter: 'Enter',
    Tab: 'Tab',
    Backspace: 'Backspace',
    Escape: 'Esc',
    BracketLeft: '[',
    BracketRight: ']',
    Comma: ',',
    Period: '.',
    Slash: '/',
    Semicolon: ';',
    Quote: "'",
    Minus: '-',
    Equal: '=',
    Backquote: '`',
    Backslash: '\\',
  };
  return names[code] ?? code;
}

/** A well-formed map: every action has a bindable code; anything missing, mistyped or reserved falls back to its default. */
export function sanitizeKeymap(raw: unknown): KeyMap {
  const r = typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const out = { ...DEFAULT_KEYMAP } as KeyMap;
  for (const a of ACTIONS) {
    const v = r[a];
    if (typeof v === 'string' && v.length > 0 && v.length <= 32 && !isReserved(v)) out[a] = v;
  }
  return out;
}

export type RebindResult = { ok: true; map: KeyMap } | { ok: false; reason: string };

/** New map with `action` bound to `code`. Reserved codes are refused. A code used elsewhere is allowed (see findConflicts). */
export function rebind(map: Readonly<KeyMap>, action: Action, code: string): RebindResult {
  if (isReserved(code)) return { ok: false, reason: `Phím ${keyLabel(code)} được dành riêng, hãy chọn phím khác` };
  if (code.length === 0) return { ok: false, reason: 'Phím không hợp lệ' };
  return { ok: true, map: { ...map, [action]: code } };
}

export interface Conflict {
  code: string;
  actions: Action[];
}

/** Every code bound to 2 or more actions, in action order. */
export function findConflicts(map: Readonly<KeyMap>): Conflict[] {
  const byCode = new Map<string, Action[]>();
  for (const a of ACTIONS) {
    const list = byCode.get(map[a]);
    if (list) list.push(a);
    else byCode.set(map[a], [a]);
  }
  const out: Conflict[] = [];
  for (const [code, actions] of byCode) if (actions.length > 1) out.push({ code, actions });
  return out;
}

/** "Trùng phím với Nhảy, Lướt" for `action`, or null when its key is unique. */
export function conflictText(map: Readonly<KeyMap>, action: Action): string | null {
  const others = ACTIONS.filter((a) => a !== action && map[a] === map[action]);
  return others.length === 0 ? null : `Trùng phím với ${others.map((a) => ACTION_LABELS[a]).join(', ')}`;
}

/** True when `action` is held: its bound key, or a fixed secondary key that no other action has taken. */
export function isActionDown(map: Readonly<KeyMap>, action: Action, down: (code: string) => boolean): boolean {
  if (down(map[action])) return true;
  for (const code of SECONDARY_KEYS[action] ?? []) {
    if (!ACTIONS.some((a) => map[a] === code) && down(code)) return true;
  }
  return false;
}

/** Every code the game listens to while playing (preventDefault, held/latched tracking). */
export function gameCodes(map: Readonly<KeyMap>): Set<string> {
  const s = new Set<string>(RESERVED_CODES);
  for (const a of ACTIONS) {
    s.add(map[a]);
    for (const c of SECONDARY_KEYS[a] ?? []) s.add(c);
  }
  return s;
}
