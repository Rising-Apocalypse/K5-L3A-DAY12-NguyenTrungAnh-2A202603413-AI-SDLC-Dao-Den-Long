// "Bảng màu dễ phân biệt": a web-only accessibility toggle (key C or the settings screen). Shade rim #7A3CFF -> #00B3FF,
// UI danger colour #FF5A5F -> #FFFFFF with a warning sign in front of the text. Stored with the other settings (prefs.ts).
import { getSettings, updateSettings } from './prefs';

export const isColorBlind = (): boolean => getSettings().colorBlind;

export function toggleColorBlind(): boolean {
  updateSettings({ colorBlind: !getSettings().colorBlind });
  return getSettings().colorBlind;
}
