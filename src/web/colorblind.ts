// "Bảng màu dễ phân biệt": a web-only accessibility toggle (key C). Shade rim #7A3CFF -> #00B3FF, UI danger colour
// #FF5A5F -> #FFFFFF with a warning sign in front of the text. The choice is kept in localStorage when available.
const KEY = 'dao-den-long:colorblind';
const DANGER = '#ff5a5f';
const DANGER_CB = '#ffffff';

let on = false;
try {
  on = window.localStorage.getItem(KEY) === '1';
} catch {
  on = false;
}

function apply(): void {
  document.documentElement.style.setProperty('--danger', on ? DANGER_CB : DANGER);
}
apply();

export const isColorBlind = (): boolean => on;

export function toggleColorBlind(): boolean {
  on = !on;
  try {
    window.localStorage.setItem(KEY, on ? '1' : '0');
  } catch {
    // storage unavailable: the choice just lasts for this page view
  }
  apply();
  return on;
}
