// DOM screens: main menu, night select, intro, result, dawn, pause menu and settings. Pure presentation: the flow logic is
// in flow.ts and main.ts decides what to show.
import { getSettings, updateSettings } from './prefs';
import { formatDuration, type IntroInfo } from './story';

export interface ScreenHandlers {
  onStart(): void;
  onSelect(night: 1 | 2 | 3): void;
  onBegin(): void;
  onNext(): void;
  onRetry(): void;
  onMenu(): void;
  onResume(): void;
}

export interface ResultInfo {
  night: 1 | 2 | 3;
  won: boolean;
  score: number;
  title: string;
  sub: string;
  hasNext: boolean;
}

export interface DawnInfo {
  total: number;
  wins: Array<{ night: number; score: number }>;
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
      button('Cài đặt', () => openSettings(showMenu)),
    );
    card.append(btns, el('p', 'hint', 'WASD di chuyển · E nạp ánh sáng · F toả sáng · Shift lướt · H đom đóm dẫn đường · P tạm dừng'));
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
    btns.append(button('Chơi lại từ đầu', handlers.onStart), button('Về menu', handlers.onMenu));
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

    const btns = el('div', 'btns');
    btns.append(button('Xong', closeSettings));
    card.append(volRow, sensRow, cbRow, btns);
    show(card, true);
  }

  function closeSettings(): void {
    if (!settingsVisible) return;
    settingsVisible = false;
    back();
  }

  return {
    showMenu,
    showIntro,
    showResult,
    showDawn,
    showPause,
    hide,
    closeSettings,
    settingsOpen: (): boolean => settingsVisible,
  };
}
