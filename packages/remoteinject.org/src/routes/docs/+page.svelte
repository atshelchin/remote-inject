<script lang="ts">
	import { t } from '$lib/i18n';

	const specs = $derived([
		{
			title: t('docs.spec.encryption.title'),
			href: 'https://walletpair.org/docs/core-concepts',
			desc: t('docs.spec.encryption.desc')
		},
		{
			title: t('docs.spec.relay.title'),
			href: 'https://walletpair.org/docs/relay',
			desc: t('docs.spec.relay.desc')
		},
		{
			title: t('docs.spec.ethereum.title'),
			href: 'https://walletpair.org/docs/evm-methods',
			desc: t('docs.spec.ethereum.desc')
		}
	]);

	const faqs = $derived([
		{
			q: t('docs.faq.what.q'),
			a: t('docs.faq.what.a')
		},
		{
			q: t('docs.faq.walletconnect.q'),
			a: t('docs.faq.walletconnect.a')
		},
		{
			q: t('docs.faq.walletpair.q'),
			a: t('docs.faq.walletpair.a')
		},
		{
			q: t('docs.faq.wallets.q'),
			a: t('docs.faq.wallets.a')
		},
		{
			q: t('docs.faq.keys.q'),
			a: t('docs.faq.keys.a')
		}
	]);
</script>

<svelte:head>
	<title>{t('docs.head.title')}</title>
	<meta name="description" content={t('docs.head.description')} />
</svelte:head>

<article class="page">
	<header class="page-head">
		<h1 class="page-title">{t('docs.page.title')}</h1>
		<p class="page-lead">
			{@html t('docs.page.lead')}
		</p>
	</header>

	<section class="block">
		<h2 class="block-title">{t('docs.getstarted.title')}</h2>
		<div class="card-grid">
			<a class="link-card" href="/install">
				<h3 class="link-title">{t('docs.getstarted.install.title')}</h3>
				<p class="link-desc">{t('docs.getstarted.install.desc')}</p>
			</a>
			<a class="link-card" href="/#how">
				<h3 class="link-title">{t('docs.getstarted.how.title')}</h3>
				<p class="link-desc">{t('docs.getstarted.how.desc')}</p>
			</a>
		</div>
	</section>

	<section class="block">
		<h2 class="block-title">{t('docs.architecture.title')}</h2>
		<p class="block-text">
			{@html t('docs.architecture.para1')}
		</p>
		<p class="block-text">
			{@html t('docs.architecture.para2')}
		</p>
	</section>

	<section class="block">
		<h2 class="block-title">{t('docs.specs.title')}</h2>
		<p class="block-text">
			{t('docs.specs.intro')}
		</p>
		<div class="card-grid">
			{#each specs as spec (spec.href)}
				<a class="link-card" href={spec.href} target="_blank" rel="noopener">
					<h3 class="link-title">{spec.title} →</h3>
					<p class="link-desc">{spec.desc}</p>
				</a>
			{/each}
		</div>
	</section>

	<section class="block">
		<h2 class="block-title">{t('docs.faq.title')}</h2>
		<dl class="faq">
			{#each faqs as item (item.q)}
				<div class="faq-item">
					<dt class="faq-q">{item.q}</dt>
					<dd class="faq-a">{item.a}</dd>
				</div>
			{/each}
		</dl>
	</section>
</article>

<style>
	.page {
		max-width: var(--max-w-content);
		margin: 0 auto;
		padding: var(--space-16) var(--space-6) 0;
	}

	.page-head {
		margin-bottom: var(--space-12);
	}

	.page-title {
		font-size: 2rem;
		font-weight: 600;
		letter-spacing: -0.03em;
		margin-bottom: var(--space-3);
	}

	.page-lead {
		color: var(--color-text-muted);
		line-height: 1.7;
	}

	.block {
		margin-bottom: var(--space-12);
	}

	.block-title {
		font-size: 1.2rem;
		font-weight: 600;
		margin-bottom: var(--space-4);
	}

	.block-text {
		color: var(--color-text-muted);
		line-height: 1.7;
		margin-bottom: var(--space-6);
	}

	.block-text :global(code) {
		color: var(--color-text);
	}

	.card-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--space-4);
	}

	.link-card {
		display: block;
		padding: var(--space-4) var(--space-6);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		background: var(--color-surface);
		transition: border-color 0.15s;
	}

	.link-card:hover {
		border-color: var(--color-text-subtle);
	}

	.link-title {
		font-family: var(--font-mono);
		font-size: 0.95rem;
		font-weight: 600;
		margin-bottom: var(--space-2);
		color: var(--color-text);
	}

	.link-desc {
		font-size: 0.85rem;
		color: var(--color-text-muted);
		line-height: 1.5;
	}

	.faq {
		display: flex;
		flex-direction: column;
		gap: var(--space-6);
	}

	.faq-q {
		font-weight: 600;
		margin-bottom: var(--space-2);
	}

	.faq-a {
		color: var(--color-text-muted);
		line-height: 1.6;
		margin: 0;
	}

	@media (max-width: 640px) {
		.card-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
