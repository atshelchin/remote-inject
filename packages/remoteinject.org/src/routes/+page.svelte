<script lang="ts">
	import { t } from '$lib/i18n';
</script>

<!-- Hero -->
<section class="hero">
	<span class="hero-badge">{t('home.hero.badge')}</span>
	<h1>Remote Inject</h1>
	<p class="hero-desc">
		{t('home.hero.desc')}
	</p>
	<div class="hero-actions">
		<a href="/install" class="btn btn-primary">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
				><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline
					points="7 10 12 15 17 10"
				/><line x1="12" y1="15" x2="12" y2="3" /></svg
			>
			{t('home.hero.installBtn')}
		</a>
		<a href="#how" class="btn btn-ghost">{t('home.hero.howItWorks')}</a>
		<a
			href="https://github.com/atshelchin/remote-inject"
			class="btn btn-ghost"
			target="_blank"
			rel="noopener"
		>
			<svg viewBox="0 0 24 24" fill="currentColor"
				><path
					d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"
				/></svg
			>
			GitHub
		</a>
	</div>
	<div class="scroll-hint">
		<span>{t('home.hero.scroll')}</span>
		<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
			><path d="M12 5v14M19 12l-7 7-7-7" /></svg
		>
	</div>
</section>

<!-- Features -->
<section class="section">
	<h2 class="section-title">{t('home.features.title')}</h2>
	<div class="features">
		<div class="feature">
			<div class="feature-icon">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
					><path
						d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"
					/><path d="M9 18c-4.51 2-5-2-7-2" /></svg
				>
			</div>
			<h3>{t('home.feature.noRegistration.title')}</h3>
			<p>
				{t('home.feature.noRegistration.desc')}
			</p>
		</div>
		<div class="feature">
			<div class="feature-icon">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
					><rect width="14" height="20" x="5" y="2" rx="2" /><path d="M12 18h.01" /></svg
				>
			</div>
			<h3>{t('home.feature.keysOnPhone.title')}</h3>
			<p>
				{t('home.feature.keysOnPhone.desc')}
			</p>
		</div>
		<div class="feature">
			<div class="feature-icon">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
					><rect width="18" height="11" x="3" y="11" rx="2" /><path
						d="M7 11V7a5 5 0 0 1 10 0v4"
					/></svg
				>
			</div>
			<h3>{t('home.feature.encrypted.title')}</h3>
			<p>
				{t('home.feature.encrypted.desc')}
			</p>
		</div>
		<div class="feature">
			<div class="feature-icon">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
					><path d="m18 16 4-4-4-4" /><path d="m6 8-4 4 4 4" /><path d="m14.5 4-5 16" /></svg
				>
			</div>
			<h3>{t('home.feature.anyDapp.title')}</h3>
			<p>
				{t('home.feature.anyDapp.desc')}
			</p>
		</div>
	</div>
</section>

<!-- How it works -->
<section class="section" id="how">
	<h2 class="section-title">{t('home.how.title')}</h2>
	<div class="flow">
		<div class="flow-box">
			<h4>{t('home.how.desktopDapp')}</h4>
			<p>+ {t('home.how.extension')}</p>
		</div>
		<span class="flow-arrow">→</span>
		<div class="flow-box highlight">
			<h4>{t('home.how.relay')}</h4>
			<p>WebSocket</p>
		</div>
		<span class="flow-arrow">→</span>
		<div class="flow-box">
			<h4>{t('home.how.mobileWallet')}</h4>
			<p>{t('home.how.bridgePage')}</p>
		</div>
	</div>
	<p class="flow-desc">
		{t('home.how.desc')}
	</p>
</section>

<!-- Chrome Extension -->
<section class="section">
	<h2 class="section-title">{t('home.start.title')}</h2>
	<p class="flow-desc" style="margin-bottom: 40px;">
		{t('home.start.desc')}
	</p>
	<div class="features ext-steps">
		<div class="feature center">
			<div class="feature-icon center-icon">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
					><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline
						points="7 10 12 15 17 10"
					/><line x1="12" y1="15" x2="12" y2="3" /></svg
				>
			</div>
			<h3>{t('home.step1.title')}</h3>
			<p>{t('home.step1.desc')}</p>
		</div>
		<div class="feature center">
			<div class="feature-icon center-icon">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
					><rect x="2" y="2" width="20" height="20" rx="2" /><path
						d="M7 7h4v4H7zM7 13h4v4H7zM13 7h4v4h-4zM13 13h4v4h-4z"
					/></svg
				>
			</div>
			<h3>{t('home.step2.title')}</h3>
			<p>{t('home.step2.desc')}</p>
		</div>
		<div class="feature center">
			<div class="feature-icon center-icon">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
					><circle cx="12" cy="12" r="10" /><path d="m9 12 2 2 4-4" /></svg
				>
			</div>
			<h3>{t('home.step3.title')}</h3>
			<p>{t('home.step3.desc')}</p>
		</div>
	</div>
	<div class="center" style="margin-top: 40px;">
		<a href="/install" class="btn btn-primary">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
				><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline
					points="7 10 12 15 17 10"
				/><line x1="12" y1="15" x2="12" y2="3" /></svg
			>
			{t('home.start.installBtn')}
		</a>
	</div>
</section>

<!-- Open protocol -->
<section class="section">
	<h2 class="section-title">{t('home.protocol.title')}</h2>
	<p class="flow-desc" style="margin-bottom: 32px;">
		{t('home.protocol.desc')}
	</p>
	<div class="center">
		<a href="https://walletpair.org/docs" class="btn btn-ghost" target="_blank" rel="noopener"
			>{t('home.protocol.specsLink')}</a
		>
	</div>
</section>

<style>
	.hero {
		min-height: 88vh;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		text-align: center;
		padding: 60px 24px;
		position: relative;
	}

	.hero::before {
		content: '';
		position: absolute;
		top: 0;
		left: 50%;
		transform: translateX(-50%);
		width: 600px;
		height: 600px;
		max-width: 100%;
		background: radial-gradient(circle, var(--color-accent-muted) 0%, transparent 70%);
		opacity: 0.5;
		pointer-events: none;
	}

	.hero-badge {
		display: inline-block;
		padding: 6px 14px;
		background: var(--color-accent-muted);
		color: var(--color-accent);
		border-radius: 20px;
		font-size: 12px;
		font-weight: 500;
		margin-bottom: 24px;
		letter-spacing: 0.3px;
	}

	.hero h1 {
		font-size: clamp(48px, 10vw, 72px);
		font-weight: 700;
		letter-spacing: -2px;
		margin-bottom: 20px;
		background: var(--color-accent-gradient);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
	}

	.hero-desc {
		font-size: 18px;
		color: var(--color-text-secondary);
		max-width: 520px;
		margin: 0 auto 40px;
		line-height: 1.7;
	}

	.hero-actions {
		display: flex;
		gap: 12px;
		flex-wrap: wrap;
		justify-content: center;
	}

	.btn-primary:hover {
		transform: translateY(-1px);
	}

	.scroll-hint {
		position: absolute;
		bottom: 32px;
		left: 50%;
		transform: translateX(-50%);
		color: var(--color-text-muted);
		font-size: 12px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		animation: bounce 2s infinite;
	}

	@keyframes bounce {
		0%,
		100% {
			transform: translateX(-50%) translateY(0);
		}
		50% {
			transform: translateX(-50%) translateY(6px);
		}
	}

	.section {
		padding: 80px 24px;
		max-width: var(--max-w-wide);
		margin: 0 auto;
		scroll-margin-top: 72px;
	}

	.section-title {
		font-size: 28px;
		font-weight: 600;
		text-align: center;
		margin-bottom: 48px;
		letter-spacing: -0.5px;
	}

	.features {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 16px;
	}

	.feature {
		padding: 24px;
		background: var(--color-bg-secondary);
		border: 1px solid var(--color-border);
		border-radius: 12px;
		transition:
			border-color 0.2s,
			box-shadow 0.2s;
	}

	.feature:hover {
		border-color: var(--color-accent);
		box-shadow: var(--shadow-card);
	}

	.feature.center {
		text-align: center;
	}

	.feature-icon {
		width: 44px;
		height: 44px;
		background: var(--color-accent-muted);
		border-radius: 10px;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--color-accent);
		margin-bottom: 16px;
	}

	.feature-icon.center-icon {
		margin: 0 auto 16px;
	}

	.feature-icon svg {
		width: 22px;
		height: 22px;
	}

	.feature h3 {
		font-size: 16px;
		font-weight: 600;
		margin-bottom: 8px;
	}

	.feature p {
		font-size: 14px;
		color: var(--color-text-secondary);
		line-height: 1.6;
	}

	.flow {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 16px;
		flex-wrap: wrap;
		padding: 8px 0 40px;
	}

	.flow-box {
		padding: 16px 24px;
		background: var(--color-bg-secondary);
		border: 1px solid var(--color-border);
		border-radius: 10px;
		text-align: center;
		min-width: 140px;
	}

	.flow-box.highlight {
		border-color: var(--color-accent);
		background: var(--color-accent-muted);
	}

	.flow-box h4 {
		font-size: 13px;
		font-weight: 600;
		margin-bottom: 2px;
	}

	.flow-box p {
		font-size: 11px;
		color: var(--color-text-muted);
	}

	.flow-arrow {
		color: var(--color-text-muted);
		font-size: 18px;
	}

	.flow-desc {
		text-align: center;
		font-size: 15px;
		color: var(--color-text-secondary);
		max-width: 640px;
		margin: 0 auto;
		line-height: 1.7;
	}

	.center {
		text-align: center;
	}

	.ext-steps {
		grid-template-columns: repeat(3, 1fr);
	}

	@media (max-width: 768px) {
		.features {
			grid-template-columns: 1fr;
		}
		.ext-steps {
			grid-template-columns: 1fr;
		}
		.hero h1 {
			font-size: 40px;
			letter-spacing: -1px;
		}
		.hero-desc {
			font-size: 16px;
		}
		.section {
			padding: 60px 20px;
		}
		.section-title {
			font-size: 24px;
			margin-bottom: 32px;
		}
	}

	@media (max-width: 640px) {
		.flow {
			flex-direction: column;
		}
		.flow-arrow {
			transform: rotate(90deg);
		}
	}
</style>
