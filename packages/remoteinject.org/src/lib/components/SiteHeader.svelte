<script lang="ts">
	import { page } from '$app/state';
	import { prefs, toggleTheme } from '$lib/prefs.svelte';
	import { t, locale, setLocale } from '$lib/i18n';

	const nav = $derived([
		{ href: '/install', label: t('nav.install') },
		{ href: '/playground', label: t('nav.playground') },
		{ href: '/docs', label: t('nav.docs') }
	]);

	let mobileOpen = $state(false);
</script>

<header class="header">
	<div class="header-inner">
		<a href="/" class="logo" onclick={() => (mobileOpen = false)}>
			<img src="/logo.png" alt="" class="logo-icon" />
			<span class="logo-text">Remote Inject</span>
		</a>

		<nav class="nav-desktop">
			{#each nav as item (item.href)}
				<a href={item.href} class="nav-link" class:active={page.url.pathname.startsWith(item.href)}>
					{item.label}
				</a>
			{/each}
			<a
				href="https://github.com/atshelchin/remote-inject"
				class="nav-link"
				target="_blank"
				rel="noopener">GitHub</a
			>

			<select
				class="ctrl lang"
				aria-label={t('nav.language')}
				value={locale.value}
				onchange={(e) => setLocale(e.currentTarget.value as 'en' | 'zh')}
			>
				<option value="en">EN</option>
				<option value="zh">中文</option>
			</select>
			<button class="ctrl" aria-label={t('nav.toggleTheme')} onclick={toggleTheme}>
				{#if prefs.theme === 'dark'}☀{:else}☾{/if}
			</button>
		</nav>

		<button
			class="mobile-toggle"
			onclick={() => (mobileOpen = !mobileOpen)}
			aria-label={t('nav.toggleNav')}
		>
			<svg width="20" height="20" viewBox="0 0 20 20" fill="none">
				{#if mobileOpen}
					<path d="M5 5L15 15M15 5L5 15" stroke="currentColor" stroke-width="1.5" />
				{:else}
					<path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" stroke-width="1.5" />
				{/if}
			</svg>
		</button>
	</div>

	{#if mobileOpen}
		<nav class="nav-mobile">
			{#each nav as item (item.href)}
				<a
					href={item.href}
					class="nav-link"
					class:active={page.url.pathname.startsWith(item.href)}
					onclick={() => (mobileOpen = false)}
				>
					{item.label}
				</a>
			{/each}
			<a
				href="https://github.com/atshelchin/remote-inject"
				class="nav-link"
				target="_blank"
				rel="noopener">GitHub</a
			>
			<div class="mobile-ctrls">
				<select
					class="ctrl lang"
					aria-label={t('nav.language')}
					value={locale.value}
					onchange={(e) => setLocale(e.currentTarget.value as 'en' | 'zh')}
				>
					<option value="en">EN</option>
					<option value="zh">中文</option>
				</select>
				<button class="ctrl" aria-label={t('nav.toggleTheme')} onclick={toggleTheme}>
					{#if prefs.theme === 'dark'}☀{:else}☾{/if}
				</button>
			</div>
		</nav>
	{/if}
</header>

<style>
	.header {
		position: sticky;
		top: 0;
		z-index: 100;
		background: color-mix(in srgb, var(--color-bg-primary) 85%, transparent);
		backdrop-filter: blur(8px);
		border-bottom: 1px solid var(--color-border);
	}

	.header-inner {
		max-width: var(--max-w-wide);
		margin: 0 auto;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-3) var(--space-6);
		height: 56px;
	}

	.logo {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		text-decoration: none;
		color: var(--color-text-primary);
	}

	.logo-icon {
		width: 26px;
		height: 26px;
		border-radius: 6px;
	}

	.logo-text {
		font-size: 1.05rem;
		font-weight: 700;
		letter-spacing: -0.02em;
	}

	.nav-desktop {
		display: flex;
		align-items: center;
		gap: var(--space-6);
	}

	.nav-link {
		font-size: 0.9rem;
		color: var(--color-text-secondary);
		text-decoration: none;
	}

	.nav-link:hover,
	.nav-link.active {
		color: var(--color-accent);
	}

	.ctrl {
		height: 34px;
		min-width: 34px;
		padding: 0 8px;
		border-radius: var(--radius-full);
		border: 1px solid var(--color-border);
		background: var(--color-bg-secondary);
		color: var(--color-text-secondary);
		font-size: 14px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		transition: all var(--motion-fast) var(--easing);
	}

	.ctrl:hover {
		border-color: var(--color-accent);
		color: var(--color-accent);
	}

	select.ctrl.lang {
		font-size: 12px;
		font-weight: 500;
	}

	.mobile-toggle {
		display: none;
		background: none;
		border: none;
		color: var(--color-text-secondary);
		padding: var(--space-2);
	}

	.nav-mobile {
		display: none;
		flex-direction: column;
		gap: var(--space-3);
		padding: var(--space-4) var(--space-6);
		border-top: 1px solid var(--color-border);
	}

	.mobile-ctrls {
		display: flex;
		gap: var(--space-2);
	}

	@media (max-width: 640px) {
		.nav-desktop {
			display: none;
		}
		.mobile-toggle {
			display: flex;
		}
		.nav-mobile {
			display: flex;
		}
	}
</style>
