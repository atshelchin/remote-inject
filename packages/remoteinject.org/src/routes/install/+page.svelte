<script lang="ts">
	import { Download, Puzzle, ExternalLink } from 'lucide-svelte';
	import { t } from '$lib/i18n';

	const steps = $derived([
		{
			title: t('install.step1.title'),
			body: t('install.step1.body')
		},
		{
			title: t('install.step2.title'),
			body: t('install.step2.body')
		},
		{
			title: t('install.step3.title'),
			body: t('install.step3.body')
		},
		{
			title: t('install.step4.title'),
			body: t('install.step4.body')
		}
	]);
</script>

<svelte:head>
	<title>{t('install.head.title')}</title>
	<meta name="description" content={t('install.head.description')} />
</svelte:head>

<article class="page">
	<header class="page-head">
		<h1 class="page-title">{t('install.page.title')}</h1>
		<p class="page-lead">
			{t('install.page.lead')}
		</p>
		<div class="head-actions">
			<a
				href="https://github.com/atshelchin/remote-inject/releases"
				class="btn btn-primary"
				target="_blank"
				rel="noopener"><Download size={16} strokeWidth={1.5} /> {t('install.cta.download')}</a
			>
			<a
				href="https://github.com/atshelchin/remote-inject"
				class="btn btn-ghost"
				target="_blank"
				rel="noopener"><ExternalLink size={16} strokeWidth={1.5} /> {t('install.cta.source')}</a
			>
		</div>
	</header>

	<section class="block">
		<h2 class="block-title"><Puzzle size={18} strokeWidth={1.5} /> {t('install.section.load.title')}</h2>
		<ol class="steps">
			{#each steps as step, i (step.title)}
				<li class="step">
					<span class="step-num">{i + 1}</span>
					<div>
						<h3 class="step-title">{step.title}</h3>
						<p class="step-body">{step.body}</p>
					</div>
				</li>
			{/each}
		</ol>
	</section>

	<section class="block">
		<h2 class="block-title">{t('install.section.pair.title')}</h2>
		<ol class="steps">
			<li class="step">
				<span class="step-num">1</span>
				<div>
					<h3 class="step-title">{t('install.pair.step1.title')}</h3>
					<p class="step-body">
						{@html t('install.pair.step1.body')}
					</p>
				</div>
			</li>
			<li class="step">
				<span class="step-num">2</span>
				<div>
					<h3 class="step-title">{t('install.pair.step2.title')}</h3>
					<p class="step-body">
						{t('install.pair.step2.body')}
					</p>
				</div>
			</li>
			<li class="step">
				<span class="step-num">3</span>
				<div>
					<h3 class="step-title">{t('install.pair.step3.title')}</h3>
					<p class="step-body">
						{t('install.pair.step3.body')}
					</p>
				</div>
			</li>
		</ol>
	</section>

	<section class="block">
		<h2 class="block-title">{t('install.section.settings.title')}</h2>
		<p class="block-text">
			{@html t('install.settings.body')}
		</p>
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
		line-height: 1.6;
		margin-bottom: var(--space-6);
	}

	.head-actions {
		display: flex;
		gap: var(--space-3);
		flex-wrap: wrap;
	}

	.btn {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-3) var(--space-6);
		border-radius: var(--radius-md);
		font-size: 0.95rem;
		font-weight: 500;
		text-decoration: none;
		transition:
			background 0.15s,
			border-color 0.15s,
			color 0.15s;
	}

	.btn-primary {
		background: var(--color-accent);
		color: #fff;
	}

	.btn-primary:hover {
		background: var(--color-accent-hover);
		color: #fff;
	}

	.btn-ghost {
		background: transparent;
		border: 1px solid var(--color-border);
		color: var(--color-text-muted);
	}

	.btn-ghost:hover {
		border-color: var(--color-text-subtle);
		color: var(--color-text);
	}

	.block {
		margin-bottom: var(--space-12);
	}

	.block-title {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: 1.2rem;
		font-weight: 600;
		margin-bottom: var(--space-6);
		color: var(--color-text);
	}

	.block-text {
		color: var(--color-text-muted);
		line-height: 1.7;
	}

	.block-text :global(code) {
		color: var(--color-text);
	}

	.steps {
		list-style: none;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.step {
		display: flex;
		gap: var(--space-4);
		align-items: flex-start;
	}

	.step-num {
		flex-shrink: 0;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border-radius: 50%;
		background: var(--color-surface-2);
		border: 1px solid var(--color-border);
		color: var(--color-accent);
		font-family: var(--font-mono);
		font-size: 0.85rem;
		font-weight: 600;
	}

	.step-title {
		font-size: 1rem;
		font-weight: 600;
		margin-bottom: var(--space-1);
	}

	.step-body {
		font-size: 0.9rem;
		color: var(--color-text-muted);
		line-height: 1.6;
	}

	.step-body :global(code) {
		color: var(--color-text);
	}
</style>
