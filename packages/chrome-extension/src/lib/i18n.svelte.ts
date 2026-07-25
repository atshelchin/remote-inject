/**
 * Lightweight EN / 中文 i18n for the extension UI (popup, side panel, confirm
 * window). All three run on the same chrome-extension:// origin and therefore
 * share `localStorage`, so the chosen language is consistent across surfaces
 * without touching chrome.storage. Reactive via Svelte 5 runes.
 */

export type Lang = 'en' | 'zh';

const STORAGE_KEY = 'ri_lang';

function detectLang(): Lang {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'en' || stored === 'zh') return stored;
  } catch {
    /* localStorage unavailable */
  }
  try {
    return (navigator.language || '').toLowerCase().startsWith('zh') ? 'zh' : 'en';
  } catch {
    return 'en';
  }
}

export const i18n = $state<{ lang: Lang }>({ lang: detectLang() });

export function setLang(lang: Lang): void {
  i18n.lang = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* ignore */
  }
}

/** Bilingual helper — reads i18n.lang so callers stay reactive in markup. */
export function t(en: string, zh: string): string {
  return i18n.lang === 'zh' ? zh : en;
}
