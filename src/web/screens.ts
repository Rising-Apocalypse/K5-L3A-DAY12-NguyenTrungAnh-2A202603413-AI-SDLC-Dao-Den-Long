// DOM screens: main menu, night select, intro, result, dawn, pause menu and settings. Pure presentation: the flow logic is
// in flow.ts and main.ts decides what to show.
import { validateName, type Entry } from '../leaderboard/board';
import { ACTIONS, ACTION_LABELS, conflictText, DEFAULT_KEYMAP, findConflicts, keyLabel, rebind, type Action } from './keymap';
import { getSettings, updateSettings } from './prefs';
import { formatWhen } from './runentry';
import { formatDuration, type IntroInfo } from './story';

export interface ScreenHandlers {
  onStart(): void;
  onSelect(night: 1 | 2 | 3): void;
  onBegin(): void;
  onNext(): void;
  onRetry(): void;
  onMenu(): void;
  onResume(): void;
  /** Main menu "Bảng xếp hạng". */
  onShowBoard(): void;
  /** "Lưu điểm" on the Dawn screen or after a lost night. */
  onOpenSave(): void;
}

export interface NameEntryInfo {
  score: number;
  nightsWon: number;
  /** Save the entry under this (valid) name. Resolves to the new board, or null when nothing was saved (double submit). */
  submit(name: string): Promise<Entry[] | null>;
  /** "Bỏ qua": back to the end screen. */
  onSkip(): void;
  /** Saved: show the board with the new entry highlighted. */
  onSaved(entries: Entry[], mine: Entry | null): void;
}

export interface BoardOptions {
  highlight?: Entry | null;
  backLabel: string;
  onBack(): void;
}

export interface ResultInfo {
  night: 1 | 2 | 3;
  won: boolean;
  score: number;
  title: string;
  sub: string;
  hasNext: boolean;
  /** Offer "Lưu điểm" (lost night). */
  canSave?: boolean;
  saved?: boolean;
}

export interface DawnInfo {
  total: number;
  wins: Array<{ night: number; score: number }>;
  saved?: boolean;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

export function createScreens(handlers: ScreenHandlers) {
  const root = document.getElementById('screens');
  if (!root) throw new Error('missing #screens in index.html');
  let settingsVisible = false;
  let capturing: Action | null = null;
  let stopCapture: () => void = () => {};
  let back: () => void = () => {};

  const button = (label: string, onClick: () => void): HTMLButtonElement => {
    const b = el('button', 'btn', label);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  };

  function show(card: HTMLElement, clear = false): void {
    root!.replaceChildren(card);
    root!.classList.add('on');
    root!.classList.toggle('clear', clear);
    card.querySelector('button')?.focus({ preventScroll: true });
  }

  function hide(): void {
    stopCapture();
    root!.classList.remove('on');
    root!.replaceChildren();
    settingsVisible = false;
  }

  function showMenu(): void {
    settingsVisible = false;
    const card = el('div', 'card');
    card.append(el('h1', '', 'Đảo Đèn Lồng'), el('p', 'meta', 'Mây thắp lại những ngọn đèn trên các hòn đảo giữa biển mây.'));
    const btns = el('div', 'btns');
    btns.append(
      button('Bắt đầu', handlers.onStart),
      button('Chọn Đêm', showSelect),
      button('Bảng xếp hạng', handlers.onShowBoard),
      button('Cài đặt', () => openSettings(showMenu)),
    );
    const k = getSettings().keys;
    const names = (a: Action): string => keyLabel(k[a]);
    card.append(
      btns,
      el('p', 'hint', `${names('up')}${names('left')}${names('down')}${names('right')} di chuyển · ${names('interact')} nạp ánh sáng · ${names('pulse')} toả sáng · ${names('dash')} lướt · H đom đóm dẫn đường · ${names('pause')} tạm dừng`),
    );
    show(card);
  }

  function showSelect(): void {
    const card = el('div', 'card');
    card.append(el('h2', '', 'Chọn Đêm'), el('p', 'meta', 'Để luyện tập. Điểm tổng chỉ tính các Đêm thắng trong một lần chơi.'));
    const btns = el('div', 'btns');
    btns.append(
      button('Đêm 1 — Đảo Bến', () => handlers.onSelect(1)),
      button('Đêm 2 — Đảo Cau', () => handlers.onSelect(2)),
      button('Đêm 3 — Đảo Chuông', () => handlers.onSelect(3)),
      button('Quay lại', showMenu),
    );
    card.append(btns);
    show(card);
  }

  function showIntro(info: IntroInfo): void {
    const card = el('div', 'card');
    card.append(
      el('h2', '', `Đêm ${info.night} — ${info.islandName}`),
      el('p', 'meta', `Thời gian: ${formatDuration(info.durationS)} · Cần thắp ${info.lanternsNeeded}/${info.lanternTotal} đèn lồng`),
      el('p', 'quote', `“${info.quote}” — Ông Đăng`),
      el('p', 'hint', 'Nhấn Enter / Space hoặc bấm để bắt đầu'),
    );
    card.addEventListener('click', () => handlers.onBegin());
    show(card, true);
  }

  function showResult(info: ResultInfo): void {
    const card = el('div', info.won ? 'card' : 'card lost');
    card.append(el('h2', '', info.title), el('p', 'score', `Điểm Đêm ${info.night}: ${info.score}`), el('p', 'meta', info.sub));
    const btns = el('div', 'btns');
    if (info.won && info.hasNext) btns.append(button(`Đêm ${info.night + 1}`, handlers.onNext));
    if (info.canSave) btns.append(saveButton(info.saved === true));
    btns.append(button(`Chơi lại Đêm ${info.night}`, handlers.onRetry), button('Về menu', handlers.onMenu));
    card.append(btns, el('p', 'hint', 'R — chơi lại Đêm'));
    show(card);
  }

  function showDawn(info: DawnInfo): void {
    const card = el('div', 'card');
    card.append(el('h1', '', 'Bình Minh'), el('p', 'meta', 'Ba hòn đảo đã sáng đèn. Ông Đăng mỉm cười: “Giỏi lắm, Mây.”'));
    for (const w of info.wins) card.append(el('p', '', `Đêm ${w.night}: ${w.score}`));
    card.append(el('p', 'score gold', `Tổng điểm: ${info.total}`));
    const btns = el('div', 'btns');
    btns.append(saveButton(info.saved === true), button('Chơi lại từ đầu', handlers.onStart), button('Về menu', handlers.onMenu));
    card.append(btns);
    show(card);
  }

  function saveButton(saved: boolean): HTMLButtonElement {
    const b = button(saved ? 'Đã lưu điểm' : 'Lưu điểm', handlers.onOpenSave);
    b.disabled = saved;
    return b;
  }

  function showNameEntry(info: NameEntryInfo): void {
    const card = el('div', 'card');
    card.append(
      el('h2', '', 'Lưu điểm'),
      el('p', 'score', `Tổng điểm: ${info.score}`),
      el('p', 'meta', `Số Đêm thắng: ${info.nightsWon}/3`),
      el('p', 'meta', 'Tên 3–12 ký tự: chữ, số hoặc _'),
    );
    const input = el('input', 'name-input');
    input.type = 'text';
    input.maxLength = 40;
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.setAttribute('aria-label', 'Tên người chơi');
    const err = el('p', 'name-err');
    err.setAttribute('role', 'alert');
    const save = button('Lưu', () => void submit());
    save.disabled = true;
    let busy = false;
    const check = (): boolean => {
      const r = validateName(input.value);
      const empty = input.value.trim() === '';
      err.textContent = r.ok || empty ? '' : r.reason;
      input.classList.toggle('invalid', !r.ok && !empty);
      save.disabled = !r.ok || busy;
      return r.ok;
    };
    async function submit(): Promise<void> {
      const r = validateName(input.value);
      if (!r.ok || busy) return;
      busy = true;
      save.disabled = true;
      try {
        const entries = await info.submit(r.name);
        if (entries) info.onSaved(entries, entries.find((e) => e.name === r.name && e.score === info.score) ?? null);
        else info.onSkip();
      } catch {
        busy = false;
        err.textContent = 'Không lưu được, thử lại';
        check();
      }
    }
    input.addEventListener('input', check);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void submit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        info.onSkip();
      }
    });
    const btns = el('div', 'btns row');
    btns.append(save, button('Bỏ qua', info.onSkip));
    card.append(input, err, btns);
    root!.replaceChildren(card);
    root!.classList.add('on');
    root!.classList.remove('clear');
    input.focus({ preventScroll: true });
  }

  function showBoard(entries: readonly Entry[], opts: BoardOptions): void {
    const card = el('div', 'card');
    card.append(el('h2', '', 'Bảng xếp hạng'));
    if (entries.length === 0) {
      card.append(el('p', 'meta', 'Chưa có ai — hãy là người đầu tiên!'));
    } else {
      const table = el('table', 'board');
      const head = el('tr');
      for (const [label, cls] of [['Hạng', 'num'], ['Tên', ''], ['Điểm', 'num'], ['Đêm thắng', 'num'], ['Thời gian', '']] as const) head.append(el('th', cls, label));
      table.append(head);
      const mine = opts.highlight ?? null;
      let marked = false;
      entries.slice(0, 10).forEach((e, i) => {
        const isMine = !marked && mine !== null && e.name === mine.name && e.score === mine.score && e.achieved_at === mine.achieved_at;
        if (isMine) marked = true;
        const tr = el('tr', isMine ? 'me' : '');
        tr.append(el('td', 'num', String(i + 1)), el('td', '', e.name), el('td', 'num', String(e.score)), el('td', 'num', `${e.nights_won}/3`), el('td', '', formatWhen(e.achieved_at)));
        table.append(tr);
      });
      card.append(table);
    }
    const btns = el('div', 'btns');
    btns.append(button(opts.backLabel, opts.onBack));
    card.append(btns);
    show(card);
  }

  function showPause(): void {
    settingsVisible = false;
    const card = el('div', 'card');
    card.append(el('h2', '', 'Tạm dừng'));
    const btns = el('div', 'btns');
    btns.append(
      button('Tiếp tục', handlers.onResume),
      button('Chơi lại Đêm', handlers.onRetry),
      button('Cài đặt', () => openSettings(showPause)),
      button('Về menu', handlers.onMenu),
    );
    card.append(btns, el('p', 'hint', 'P / Esc — tiếp tục'));
    show(card, true);
  }

  function openSettings(returnTo: () => void): void {
    back = returnTo;
    settingsVisible = true;
    const s = getSettings();
    const card = el('div', 'card');
    card.append(el('h2', '', 'Cài đặt'));

    const vol = el('input');
    vol.type = 'range';
    vol.min = '0';
    vol.max = '100';
    vol.step = '1';
    vol.value = String(s.volume);
    const volOut = el('output', '', String(s.volume));
    vol.addEventListener('input', () => {
      volOut.textContent = vol.value;
      updateSettings({ volume: Number(vol.value) });
    });
    const volRow = el('label', 'row-set');
    volRow.append(el('span', '', 'Âm lượng'), vol, volOut);

    const sens = el('input');
    sens.type = 'range';
    sens.min = '0.1';
    sens.max = '1';
    sens.step = '0.05';
    sens.value = String(s.sensitivity);
    const sensOut = el('output', '', s.sensitivity.toFixed(2));
    sens.addEventListener('input', () => {
      sensOut.textContent = Number(sens.value).toFixed(2);
      updateSettings({ sensitivity: Number(sens.value) });
    });
    const sensRow = el('label', 'row-set');
    sensRow.append(el('span', '', 'Độ nhạy chuột (độ/px)'), sens, sensOut);

    const cb = el('input');
    cb.type = 'checkbox';
    cb.checked = s.colorBlind;
    cb.addEventListener('change', () => updateSettings({ colorBlind: cb.checked }));
    const cbRow = el('label', 'row-set');
    cbRow.append(el('span', '', 'Bảng màu dễ phân biệt (C)'), cb);

    const toggle = (label: string, checked: boolean, onChange: (v: boolean) => void): HTMLElement => {
      const box = el('input');
      box.type = 'checkbox';
      box.checked = checked;
      box.addEventListener('change', () => onChange(box.checked));
      const row = el('label', 'row-set');
      row.append(el('span', '', label), box);
      return row;
    };
    const capRow = toggle('Phụ đề', s.captions, (v) => updateSettings({ captions: v }));
    const rmRow = toggle('Giảm chuyển động', s.reducedMotion, (v) => updateSettings({ reducedMotion: v }));
    const ltRow = toggle('Chữ lớn (×1.25)', s.largeText, (v) => updateSettings({ largeText: v }));

    const keysBox = el('div');
    renderKeys(keysBox);

    const btns = el('div', 'btns');
    btns.append(button('Xong', closeSettings));
    card.append(volRow, sensRow, cbRow, capRow, rmRow, ltRow, keysBox, btns);
    show(card, true);
  }

  /** Section "Phím điều khiển": one row per action, conflicts in danger colour on both rows, reset button. */
  function renderKeys(box: HTMLElement): void {
    stopCapture();
    const keys = getSettings().keys;
    const conflicts = findConflicts(keys);
    box.replaceChildren(el('div', 'sect', 'Phím điều khiển'));
    if (conflicts.length > 0) box.append(el('div', 'banner', 'Có phím bị trùng. Hãy đổi để mỗi hành động một phím riêng.'));
    for (const a of ACTIONS) {
      const note = conflictText(keys, a);
      const row = el('div', note ? 'row-set keyrow conflict' : 'row-set keyrow');
      const change = button('Đổi', () => beginCapture(a, row, box));
      change.classList.add('small');
      change.setAttribute('aria-label', `Đổi phím ${ACTION_LABELS[a]}`);
      row.append(el('span', '', ACTION_LABELS[a]), el('span', 'kname', keyLabel(keys[a])), change);
      if (note) row.append(el('span', 'note', note));
      box.append(row);
    }
    const reset = button('Khôi phục mặc định', () => {
      updateSettings({ keys: { ...DEFAULT_KEYMAP } });
      renderKeys(box);
    });
    const btns = el('div', 'btns');
    btns.append(reset);
    box.append(btns);
  }

  function beginCapture(action: Action, row: HTMLElement, box: HTMLElement): void {
    stopCapture();
    capturing = action;
    const msg = el('span', 'note', 'Nhấn phím mới… (Esc để huỷ)');
    row.append(msg);
    const onKey = (e: KeyboardEvent): void => {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.code === 'Escape') {
        renderKeys(box);
        return;
      }
      const r = rebind(getSettings().keys, action, e.code);
      if (!r.ok) {
        msg.textContent = `${r.reason}. Nhấn phím khác (Esc để huỷ)`;
        return;
      }
      updateSettings({ keys: r.map });
      renderKeys(box);
    };
    window.addEventListener('keydown', onKey, true);
    stopCapture = () => {
      window.removeEventListener('keydown', onKey, true);
      capturing = null;
      stopCapture = () => {};
    };
  }

  function closeSettings(): void {
    if (!settingsVisible) return;
    settingsVisible = false;
    stopCapture();
    back();
  }

  return {
    showMenu,
    showIntro,
    showResult,
    showDawn,
    showNameEntry,
    showBoard,
    showPause,
    hide,
    closeSettings,
    settingsOpen: (): boolean => settingsVisible,
    /** True while "Nhấn phím mới…" waits for a key. */
    capturing: (): boolean => capturing !== null,
  };
}
