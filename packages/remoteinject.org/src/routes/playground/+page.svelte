<script lang="ts">
	import { onMount } from 'svelte';
	import { t } from '$lib/i18n';

	interface Eip6963Provider {
		info: { uuid: string; name: string; icon: string; rdns: string };
		provider: any;
	}

	interface LogEntry {
		id: number;
		method: string;
		status: 'pending' | 'ok' | 'err';
		detail: string;
	}

	let providers = $state<Eip6963Provider[]>([]);
	let selectedRdns = $state('');
	let account = $state('');
	let chainId = $state('');
	let connected = $state(false);
	let logs = $state<LogEntry[]>([]);
	let signMessage = $state('Hello from the Remote Inject playground!');
	let logCounter = 0;

	const selected = $derived(
		providers.find((p) => p.info.rdns === selectedRdns) ?? providers[0]
	);
	const provider = $derived(selected?.provider);

	function pushLog(method: string, status: LogEntry['status'], detail: string): number {
		const id = ++logCounter;
		logs = [{ id, method, status, detail }, ...logs].slice(0, 40);
		return id;
	}

	function updateLog(id: number, status: LogEntry['status'], detail: string) {
		logs = logs.map((l) => (l.id === id ? { ...l, status, detail } : l));
	}

	async function call(method: string, params?: unknown[]): Promise<unknown> {
		if (!provider) throw new Error('No provider selected');
		const id = pushLog(method, 'pending', '…');
		try {
			const result = await provider.request({ method, params });
			updateLog(id, 'ok', truncate(JSON.stringify(result)));
			return result;
		} catch (err: any) {
			updateLog(id, 'err', `${err?.code ?? ''} ${err?.message ?? String(err)}`.trim());
			throw err;
		}
	}

	function truncate(s: string, n = 200): string {
		return s.length > n ? s.slice(0, n) + '…' : s;
	}

	async function connect() {
		try {
			const accounts = (await call('eth_requestAccounts')) as string[];
			account = accounts?.[0] ?? '';
			chainId = (await provider.request({ method: 'eth_chainId' })) as string;
			connected = !!account;
			bindEvents();
		} catch {
			/* logged */
		}
	}

	let bound: any = null;
	function bindEvents() {
		if (!provider?.on || bound === provider) return;
		bound = provider;
		provider.on('accountsChanged', (a: string[]) => {
			account = a?.[0] ?? '';
			connected = !!account;
			pushLog('event: accountsChanged', 'ok', JSON.stringify(a ?? []));
		});
		provider.on('chainChanged', (c: string) => {
			chainId = c;
			pushLog('event: chainChanged', 'ok', c);
		});
		provider.on('disconnect', (e: any) => {
			connected = false;
			account = '';
			pushLog('event: disconnect', 'err', e?.message ?? '');
		});
	}

	async function personalSign() {
		if (!account) return;
		const hex = '0x' + Array.from(new TextEncoder().encode(signMessage), (b) => b.toString(16).padStart(2, '0')).join('');
		await call('personal_sign', [hex, account]).catch(() => {});
	}

	async function signTypedData() {
		if (!account) return;
		const cid = parseInt(chainId || '0x1', 16);
		const typed = {
			types: {
				EIP712Domain: [
					{ name: 'name', type: 'string' },
					{ name: 'version', type: 'string' },
					{ name: 'chainId', type: 'uint256' }
				],
				Message: [
					{ name: 'contents', type: 'string' },
					{ name: 'from', type: 'address' }
				]
			},
			primaryType: 'Message',
			domain: { name: 'Remote Inject Playground', version: '1', chainId: cid },
			message: { contents: signMessage, from: account }
		};
		await call('eth_signTypedData_v4', [account, JSON.stringify(typed)]).catch(() => {});
	}

	async function sendSelfTx() {
		if (!account) return;
		await call('eth_sendTransaction', [{ from: account, to: account, value: '0x0' }]).catch(() => {});
	}

	async function getBalance() {
		if (!account) return;
		await call('eth_getBalance', [account, 'latest']).catch(() => {});
	}

	async function switchChain(hex: string) {
		await call('wallet_switchEthereumChain', [{ chainId: hex }]).catch(() => {});
	}

	function refreshProviders() {
		const found = new Map<string, Eip6963Provider>();
		function onAnnounce(event: any) {
			const d = event.detail as Eip6963Provider;
			if (d?.info?.rdns) found.set(d.info.rdns, d);
			providers = [...found.values()];
			if (!selectedRdns) {
				selectedRdns =
					providers.find((p) => p.info.rdns === 'com.remote-inject.bridge')?.info.rdns ??
					providers[0]?.info.rdns ??
					'';
			}
		}
		window.addEventListener('eip6963:announceProvider', onAnnounce);
		window.dispatchEvent(new Event('eip6963:requestProvider'));
	}

	onMount(() => {
		refreshProviders();
		// Give slow-to-announce providers a moment, then re-request.
		setTimeout(refreshProviders, 400);
	});

	function shorten(a: string): string {
		return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '';
	}

	const chains = [
		{ hex: '0x1', name: 'Ethereum' },
		{ hex: '0x2105', name: 'Base' },
		{ hex: '0x89', name: 'Polygon' },
		{ hex: '0xa4b1', name: 'Arbitrum' }
	];
</script>

<svelte:head>
	<title>{t('playground.head.title')}</title>
	<meta
		name="description"
		content={t('playground.head.description')}
	/>
</svelte:head>

<article class="page">
	<header class="head">
		<h1>{t('playground.hero.title')}</h1>
		<p class="lead">
			{t('playground.hero.lead')}
		</p>
	</header>

	{#if providers.length === 0}
		<div class="card notice">
			<h3>{t('playground.notice.title')}</h3>
			<p>
				{t('playground.notice.desc')}
			</p>
			<div class="row">
				<a class="btn btn-primary" href="/install">{t('playground.notice.install')}</a>
				<button class="btn btn-ghost" onclick={() => location.reload()}>{t('playground.notice.reload')}</button>
			</div>
		</div>
	{:else}
		<div class="grid">
			<!-- Connection -->
			<div class="card">
				<h3 class="card-title">{t('playground.connection.title')}</h3>

				<label class="field">
					<span class="field-label">{t('playground.connection.providerLabel')}</span>
					<select class="input" bind:value={selectedRdns} disabled={connected}>
						{#each providers as p (p.info.rdns)}
							<option value={p.info.rdns} title={p.info.rdns}>{p.info.name}</option>
						{/each}
					</select>
				</label>

				{#if !connected}
					<button class="btn btn-primary full" onclick={connect}>{t('playground.connection.connect')}</button>
					<p class="connect-hint">
						{t('playground.connection.pairingHint')}
					</p>
				{:else}
					<div class="wallet-info">
						<div class="wallet-row">
							<span class="wallet-label">{t('playground.wallet.account')}</span>
							<span class="wallet-value">{shorten(account)}</span>
						</div>
						<div class="wallet-row">
							<span class="wallet-label">{t('playground.wallet.chain')}</span>
							<span class="wallet-value">{chainId}</span>
						</div>
					</div>
					<div class="chain-switch">
						<span class="field-label">{t('playground.wallet.switchChain')}</span>
						<div class="chain-btns">
							{#each chains as c (c.hex)}
								<button
									class="chip"
									class:active={chainId?.toLowerCase() === c.hex}
									onclick={() => switchChain(c.hex)}>{c.name}</button
								>
							{/each}
						</div>
					</div>
				{/if}
			</div>

			<!-- Actions -->
			<div class="card">
				<h3 class="card-title">{t('playground.requests.title')}</h3>
				<label class="field">
					<span class="field-label">{t('playground.requests.messageLabel')}</span>
					<input class="input" bind:value={signMessage} />
				</label>
				<div class="actions">
					<button class="btn btn-ghost" disabled={!connected} onclick={personalSign}>personal_sign</button>
					<button class="btn btn-ghost" disabled={!connected} onclick={signTypedData}
						>eth_signTypedData_v4</button
					>
					<button class="btn btn-ghost" disabled={!connected} onclick={sendSelfTx}
						>eth_sendTransaction</button
					>
					<button class="btn btn-ghost" disabled={!connected} onclick={getBalance}>eth_getBalance</button>
				</div>
				<p class="tx-note">
					{t('playground.requests.txNote')}
				</p>
			</div>
		</div>

		<!-- Log -->
		<div class="card log-card">
			<h3 class="card-title">{t('playground.log.title')}</h3>
			{#if logs.length === 0}
				<p class="empty">{t('playground.log.empty')}</p>
			{:else}
				<div class="log">
					{#each logs as l (l.id)}
						<div class="log-row {l.status}">
							<span class="log-status">
								{l.status === 'pending' ? '…' : l.status === 'ok' ? '✓' : '✕'}
							</span>
							<span class="log-method">{l.method}</span>
							<span class="log-detail">{l.detail}</span>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	{/if}
</article>

<style>
	.page {
		max-width: var(--max-w-wide);
		margin: 0 auto;
		padding: var(--space-12) var(--space-6) 0;
	}

	.head {
		margin-bottom: var(--space-8);
	}

	.head h1 {
		font-size: 2rem;
		font-weight: 700;
		letter-spacing: -0.03em;
		margin-bottom: var(--space-3);
	}

	.lead {
		color: var(--color-text-secondary);
		line-height: 1.7;
		max-width: 680px;
	}

	.grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--space-4);
		margin-bottom: var(--space-4);
	}

	.card-title {
		font-size: 1rem;
		font-weight: 600;
		margin-bottom: var(--space-4);
	}

	.notice {
		text-align: center;
	}

	.notice h3 {
		margin-bottom: var(--space-2);
	}

	.notice p {
		color: var(--color-text-secondary);
		margin-bottom: var(--space-4);
	}

	.row {
		display: flex;
		gap: var(--space-3);
		justify-content: center;
	}

	.field {
		display: block;
		margin-bottom: var(--space-4);
	}

	.field-label {
		display: block;
		font-size: 12px;
		color: var(--color-text-muted);
		margin-bottom: 6px;
	}

	.input {
		width: 100%;
		padding: 10px 12px;
		font-size: 14px;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		background: var(--color-bg-primary);
		color: var(--color-text-primary);
		outline: none;
		font-family: inherit;
	}

	.input:focus {
		border-color: var(--color-accent);
	}

	.full {
		width: 100%;
	}

	.connect-hint {
		font-size: 12px;
		color: var(--color-text-muted);
		line-height: 1.5;
		margin-top: var(--space-3);
	}

	.wallet-info {
		background: var(--color-bg-tertiary);
		border-radius: var(--radius-md);
		padding: 12px;
		margin-bottom: var(--space-4);
	}

	.wallet-row {
		display: flex;
		justify-content: space-between;
		font-size: 13px;
	}

	.wallet-row + .wallet-row {
		margin-top: 6px;
		padding-top: 6px;
		border-top: 1px solid var(--color-border);
	}

	.wallet-label {
		color: var(--color-text-muted);
	}

	.wallet-value {
		font-family: var(--font-mono);
		font-size: 12px;
	}

	.chain-btns,
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	.chain-switch {
		margin-top: var(--space-2);
	}

	.chip {
		padding: 6px 12px;
		font-size: 12px;
		border-radius: var(--radius-full);
		border: 1px solid var(--color-border);
		background: var(--color-bg-secondary);
		color: var(--color-text-secondary);
	}

	.chip.active {
		border-color: var(--color-accent);
		color: var(--color-accent);
		background: var(--color-accent-muted);
	}

	.actions .btn {
		font-family: var(--font-mono);
		font-size: 12px;
		padding: 8px 12px;
	}

	.tx-note {
		font-size: 11px;
		color: var(--color-text-muted);
		margin-top: var(--space-3);
	}

	.log-card {
		margin-bottom: var(--space-8);
	}

	.empty {
		color: var(--color-text-muted);
		font-size: 14px;
	}

	.log {
		display: flex;
		flex-direction: column;
		gap: 4px;
		max-height: 320px;
		overflow-y: auto;
	}

	.log-row {
		display: flex;
		align-items: baseline;
		gap: 10px;
		font-size: 12px;
		font-family: var(--font-mono);
		padding: 6px 8px;
		border-radius: var(--radius-sm);
		background: var(--color-bg-tertiary);
	}

	.log-status {
		width: 14px;
		flex-shrink: 0;
	}

	.log-row.ok .log-status {
		color: var(--color-success);
	}
	.log-row.err .log-status {
		color: var(--color-error);
	}
	.log-row.pending .log-status {
		color: var(--color-warning);
	}

	.log-method {
		flex-shrink: 0;
		color: var(--color-text-primary);
	}

	.log-detail {
		color: var(--color-text-muted);
		word-break: break-all;
	}

	@media (max-width: 768px) {
		.grid {
			grid-template-columns: 1fr;
		}
	}
</style>
