/**
 * Site i18n built on @shelchin/i18n-sveltekit.
 *
 * Messages live in `src/messages/{locale}/{namespace}.json` as flat
 * `"dotted.key": "text"` catalogs (the library's authoring format). They are
 * eager-loaded and merged per locale (English base under the target locale, so
 * a missing key falls back to English rather than showing the raw key).
 *
 * Locale is client-driven (localStorage + a header toggle); the server and the
 * first client paint always render the default locale, then `applyLocale()` (in
 * the root layout's onMount) switches to the stored/preferred locale after
 * hydration — so there is no hydration mismatch and no per-request SSR state.
 */
import { browser } from '$app/environment';
import { createI18n, i18nState } from '@shelchin/i18n-sveltekit';

export type Lang = 'en' | 'zh';
export const DEFAULT_LOCALE: Lang = 'en';

type Catalog = Record<string, string>;

const modules = import.meta.glob('../messages/*/*.json', { eager: true }) as Record<
	string,
	{ default: Catalog }
>;

const catalogs: Record<Lang, Catalog> = { en: {}, zh: {} };
for (const [path, mod] of Object.entries(modules)) {
	const match = path.match(/\/messages\/([^/]+)\//);
	const loc = match?.[1] as Lang | undefined;
	if (loc && catalogs[loc]) Object.assign(catalogs[loc], mod.default);
}

const merged: Record<Lang, Catalog> = {
	en: catalogs.en,
	zh: { ...catalogs.en, ...catalogs.zh }
};

const i18n = createI18n({ defaultLocale: DEFAULT_LOCALE, fallbackLocale: DEFAULT_LOCALE });

// Server + first client render use the default locale.
i18nState.setMessages(merged[DEFAULT_LOCALE]);
i18nState.locale = DEFAULT_LOCALE;

/** Translate a key (with optional `{var}` interpolation params). */
export const t = i18n.t as (key: string, params?: Record<string, string | number>) => string;

/** Reactive current-locale accessor: read `locale.value` in markup. */
export const locale = i18n.locale as { value: Lang; set(value: Lang): void };

export function detectLang(): Lang {
	if (!browser) return DEFAULT_LOCALE;
	const stored = localStorage.getItem('locale');
	if (stored === 'en' || stored === 'zh') return stored;
	return (navigator.language || '').toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

export function setLocale(lang: Lang): void {
	i18nState.setMessages(merged[lang]);
	i18nState.locale = lang;
	if (browser) {
		localStorage.setItem('locale', lang);
		document.documentElement.setAttribute('lang', lang === 'zh' ? 'zh-CN' : 'en');
	}
}

/** Apply the stored/preferred locale. Call once from the root layout's onMount. */
export function applyLocale(): void {
	if (browser) setLocale(detectLang());
}
