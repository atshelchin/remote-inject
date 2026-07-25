<script lang="ts">
	import '$lib/styles/global.css';
	import SiteHeader from '$lib/components/SiteHeader.svelte';
	import SiteFooter from '$lib/components/SiteFooter.svelte';
	import { applyTheme } from '$lib/prefs.svelte';
	import { applyLocale, t } from '$lib/i18n';
	import { page } from '$app/state';
	import { onMount } from 'svelte';

	let { children } = $props();

	onMount(() => {
		applyTheme();
		applyLocale();
	});

	// The bridge runs inside a mobile wallet's dApp browser — render only the
	// pairing card, no marketing header/footer (avoids escape hatches mid-pairing).
	const bare = $derived(page.url.pathname.startsWith('/bridge'));
</script>

<svelte:head>
	<title>{t('global.head.title')}</title>
	<meta name="description" content={t('global.head.description')} />
</svelte:head>

{#if bare}
	{@render children()}
{:else}
	<SiteHeader />
	<main>
		{@render children()}
	</main>
	<SiteFooter />
{/if}

<style>
	main {
		min-height: calc(100vh - 56px);
	}
</style>
