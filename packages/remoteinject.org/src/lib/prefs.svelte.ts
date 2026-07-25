import { browser } from '$app/environment';

export type Theme = 'light' | 'dark';

function initTheme(): Theme {
	if (!browser) return 'light';
	const stored = localStorage.getItem('theme');
	if (stored === 'light' || stored === 'dark') return stored;
	return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export const prefs = $state<{ theme: Theme }>({ theme: initTheme() });

/** Apply the current theme to <html>. Call once on mount. */
export function applyTheme(): void {
	if (browser) document.documentElement.setAttribute('data-theme', prefs.theme);
}

export function toggleTheme(): void {
	prefs.theme = prefs.theme === 'dark' ? 'light' : 'dark';
	if (browser) {
		localStorage.setItem('theme', prefs.theme);
		document.documentElement.setAttribute('data-theme', prefs.theme);
	}
}
