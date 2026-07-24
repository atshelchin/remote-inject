<script lang="ts">
	import { onMount } from 'svelte';
	import { WalletSession, isEvmRequest, type EvmRequest, type JsonValue } from '$lib/walletpair/protocol';
	import { t } from '$lib/i18n';

	type Phase = 'loading' | 'no-uri' | 'no-wallet' | 'review' | 'connecting' | 'connected' | 'error';

	let phase = $state<Phase>('loading');
	let errorMsg = $state('');
	let dapp = $state<{ name: string; url: string; icon: string } | null>(null);
	let code = $state('');
	let account = $state('');
	let chainHex = $state('');
	let logs = $state<{ dir: 'in' | 'out' | 'err'; text: string; time: string }[]>([]);

	let session: WalletSession | null = null;

	function eth(): any {
		return (globalThis as any).ethereum;
	}

	function caip2From(hexChain: string): string {
		try {
			return 'eip155:' + BigInt(hexChain).toString(10);
		} catch {
			return 'eip155:1';
		}
	}

	function safeDecode(value: string): string {
		try {
			return decodeURIComponent(value);
		} catch {
			return '';
		}
	}

	function getPairingUri(): string | null {
		// The extension encodes the QR as `<bridge>#<walletpair-uri>`. Browsers may
		// leave the fragment as-is or percent-encode it once, so accept both. The
		// pairing URI is itself already single-encoded — never decode it twice.
		const raw = location.hash.startsWith('#') ? location.hash.slice(1) : '';
		for (const candidate of [raw, safeDecode(raw)]) {
			if (candidate.startsWith('walletpair:')) return candidate;
		}
		const params = new URLSearchParams(location.search);
		const q = params.get('uri') || params.get('p');
		if (q && q.startsWith('walletpair:')) return q;
		return null;
	}

	function log(dir: 'in' | 'out' | 'err', text: string) {
		const time = new Date().toLocaleTimeString();
		logs = [{ dir, text, time }, ...logs].slice(0, 40);
	}

	onMount(() => {
		const uri = getPairingUri();
		if (!uri) {
			phase = 'no-uri';
			return;
		}
		if (!eth()) {
			phase = 'no-wallet';
			return;
		}
		try {
			session = new WalletSession({
				meta: {
					name: 'Remote Inject',
					url: 'https://remoteinject.org',
					icon: 'https://remoteinject.org/icon.png'
				},
				onPeer: (peer) => (dapp = peer),
				onMessage: handleMessage,
				onError: (e) => {
					errorMsg = e.message;
				}
			});
			session.prepare(uri);
			code = session.pairingCode;
			phase = 'review';
		} catch (e: any) {
			errorMsg = e?.message ?? String(e);
			phase = 'error';
		}
	});

	async function connect() {
		if (!session) return;
		phase = 'connecting';
		try {
			await session.confirm();
			phase = 'connected';
			await syncWalletState();
			subscribeWalletEvents();
		} catch (e: any) {
			errorMsg = e?.message ?? String(e);
			phase = 'error';
		}
	}

	async function handleMessage(message: JsonValue, chainId: string) {
		if (!isEvmRequest(message as JsonValue)) return;
		const req = message as EvmRequest;
		log('in', req.method);
		try {
			const result = await eth().request({ method: req.method, params: req.params });
			session!.send({ id: req.id, result: (result ?? null) as JsonValue }, chainId);
			log('out', `${req.method} ✓`);
		} catch (err: any) {
			const errCode = typeof err?.code === 'number' ? err.code : -32603;
			session!.send(
				{ id: req.id, error: { code: errCode, message: String(err?.message ?? 'Request failed') } },
				chainId
			);
			log('err', `${req.method} ✕`);
		}
	}

	async function syncWalletState() {
		try {
			const accts = await eth().request({ method: 'eth_accounts' });
			account = Array.isArray(accts) ? (accts[0] ?? '') : '';
			const cid = await eth().request({ method: 'eth_chainId' });
			chainHex = cid;
			const caip = caip2From(cid);
			session!.send({ event: 'connect', data: { chainId: cid } as JsonValue }, caip);
			session!.send({ event: 'chainChanged', data: cid }, caip);
			if (account) session!.send({ event: 'accountsChanged', data: [account] as JsonValue });
		} catch {
			/* wallet may reject eth_accounts before authorization; ignore */
		}
	}

	function subscribeWalletEvents() {
		const e = eth();
		if (!e?.on) return;
		e.on('accountsChanged', (a: string[]) => {
			account = a?.[0] ?? '';
			session?.send({ event: 'accountsChanged', data: (a ?? []) as JsonValue });
		});
		e.on('chainChanged', (c: string) => {
			chainHex = c;
			session?.send({ event: 'chainChanged', data: c }, caip2From(c));
		});
	}

	function shorten(addr: string): string {
		return addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : '';
	}

	// MetaMask (and most in-app browsers) open http(s) deep links but routinely
	// drop the URL fragment, so carry the pairing URI as a query param the bridge
	// also accepts (?uri=). Strip the scheme from the deep link host+path.
	let mmLink = $state('');
	let pageUrl = $state('');
	let copied = $state(false);
	onMount(() => {
		pageUrl = location.href;
		const uri = getPairingUri();
		const target =
			location.host + location.pathname + (uri ? '?uri=' + encodeURIComponent(uri) : location.hash);
		mmLink = 'https://metamask.app.link/dapp/' + target;
	});

	async function copyLink() {
		try {
			await navigator.clipboard?.writeText(location.href);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			/* clipboard unavailable — the URL is shown in the field as a fallback */
		}
	}
</script>

<svelte:head>
	<title>{t('bridge.head.title')}</title>
</svelte:head>

<div class="wrap">
	<div class="card bridge-card">
		{#if phase === 'loading'}
			<div class="center-col">
				<span class="spinner"></span>
			</div>
		{:else if phase === 'no-uri'}
			<div class="state">
				<div class="state-icon">🔗</div>
				<h2>{t('bridge.nouri.title')}</h2>
				<p>
					{t('bridge.nouri.desc')}
				</p>
				<div class="wallet-actions">
					<a class="btn btn-primary big" href="/install">{t('bridge.nouri.getExtension')}</a>
					<button class="btn btn-ghost big" onclick={() => location.reload()}>{t('bridge.nouri.retry')}</button>
				</div>
			</div>
		{:else if phase === 'no-wallet'}
			<div class="state">
				<div class="state-icon">📱</div>
				<h2>{t('bridge.nowallet.title')}</h2>
				<p>
					{t('bridge.nowallet.desc')}
				</p>
				<div class="wallet-actions">
					<a class="btn btn-primary big" href={mmLink}>{t('bridge.nowallet.openMetamask')}</a>
					<button class="btn btn-ghost big" onclick={copyLink}>
						{copied
							? t('bridge.nowallet.copied')
							: t('bridge.nowallet.copyLink')}
					</button>
				</div>
				<input class="url-fallback" readonly value={pageUrl} onclick={(e) => e.currentTarget.select()} />
			</div>
		{:else if phase === 'review' || phase === 'connecting'}
			<div class="state">
				{#if dapp}
					<div class="dapp">
						<div class="dapp-icon">
							{#if dapp.icon}<img src={dapp.icon} alt="" />{:else}🔗{/if}
						</div>
						<div class="dapp-text">
							<div class="dapp-name">{dapp.name}</div>
							<div class="dapp-url">{dapp.url}</div>
						</div>
					</div>
				{/if}
				<p class="lead">
					{t('bridge.review.compare')}
				</p>
				<div class="code">{code}</div>
				<p class="hint">
					{t('bridge.review.hint')}
				</p>
				<button class="btn btn-primary big" onclick={connect} disabled={phase === 'connecting'}>
					{#if phase === 'connecting'}<span class="spinner"></span> {t('bridge.review.connecting')}
					{:else}{t('bridge.review.connect')}{/if}
				</button>
			</div>
		{:else if phase === 'connected'}
			<div class="state" role="status" aria-live="polite">
				<div class="state-icon ok">✓</div>
				<h2>{t('bridge.connected.title')}</h2>
				{#if dapp}<p class="lead">{dapp.name}</p>{/if}
				<div class="wallet-info">
					<div class="wallet-row">
						<span class="wallet-label">{t('bridge.connected.account')}</span>
						<span class="wallet-value">{shorten(account) || '—'}</span>
					</div>
					<div class="wallet-row">
						<span class="wallet-label">{t('bridge.connected.chain')}</span>
						<span class="wallet-value">{chainHex || '—'}</span>
					</div>
				</div>
				{#if !account}
					<p class="warn">
						{t('bridge.connected.approve')}
					</p>
				{/if}
				{#if errorMsg}
					<p class="warn">
						{t('bridge.connected.unstable')}
					</p>
				{/if}
				<p class="hint">
					{t('bridge.connected.keepOpen')}
				</p>
				{#if logs.length}
					<div class="log">
						{#each logs as entry (entry.time + entry.text)}
							<div class="log-row {entry.dir}">
								<span class="log-dir"
									>{entry.dir === 'in' ? '←' : entry.dir === 'out' ? '→' : '✕'}</span
								>
								<span class="log-text">{entry.text}</span>
								<span class="log-time">{entry.time}</span>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		{:else if phase === 'error'}
			<div class="state">
				<div class="state-icon err">!</div>
				<h2>{t('bridge.error.title')}</h2>
				<p class="err-msg">{errorMsg}</p>
				<button class="btn btn-ghost" onclick={() => location.reload()}
					>{t('bridge.error.retry')}</button
				>
			</div>
		{/if}
	</div>
	<p class="brand">Remote Inject · <a href="/">remoteinject.org</a></p>
</div>

<style>
	.wrap {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 24px;
		gap: 16px;
	}

	.warn {
		font-size: 13px;
		color: var(--color-warning);
		background: var(--color-warning-bg);
		border-radius: var(--radius-md);
		padding: 8px 12px;
		margin: 4px 0;
		line-height: 1.5;
	}

	.url-fallback {
		width: 100%;
		margin-top: 10px;
		padding: 8px 10px;
		font-family: var(--font-mono);
		font-size: 11px;
		color: var(--color-text-muted);
		background: var(--color-bg-tertiary);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		text-overflow: ellipsis;
	}

	.bridge-card {
		width: 100%;
		max-width: 380px;
	}

	.center-col {
		display: flex;
		justify-content: center;
		padding: 40px 0;
	}

	.state {
		text-align: center;
	}

	.state h2 {
		font-size: 20px;
		font-weight: 600;
		margin-bottom: 10px;
	}

	.state p {
		font-size: 14px;
		color: var(--color-text-secondary);
		line-height: 1.6;
	}

	.state-icon {
		font-size: 40px;
		margin-bottom: 12px;
	}

	.state-icon.ok {
		width: 56px;
		height: 56px;
		margin: 0 auto 16px;
		border-radius: 50%;
		background: var(--color-success-bg);
		color: var(--color-success);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 28px;
	}

	.state-icon.err {
		width: 56px;
		height: 56px;
		margin: 0 auto 16px;
		border-radius: 50%;
		background: var(--color-error-bg);
		color: var(--color-error);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 28px;
		font-weight: 700;
	}

	.dapp {
		display: flex;
		align-items: center;
		gap: 12px;
		padding-bottom: 16px;
		border-bottom: 1px solid var(--color-border);
		margin-bottom: 20px;
		text-align: left;
	}

	.dapp-icon {
		width: 44px;
		height: 44px;
		border-radius: var(--radius-md);
		background: var(--color-bg-tertiary);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 20px;
		overflow: hidden;
		flex-shrink: 0;
	}

	.dapp-icon img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.dapp-name {
		font-size: 15px;
		font-weight: 600;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.dapp-url {
		font-size: 12px;
		color: var(--color-accent);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.lead {
		font-size: 14px;
		color: var(--color-text-secondary);
		margin-bottom: 16px;
	}

	.code {
		font-family: var(--font-mono);
		font-size: 44px;
		font-weight: 700;
		letter-spacing: 10px;
		color: var(--color-accent);
		padding-left: 10px;
		margin-bottom: 12px;
	}

	.hint {
		font-size: 12px;
		color: var(--color-text-muted);
		margin-bottom: 20px;
	}

	.btn.big {
		width: 100%;
		padding: 14px;
		font-size: 15px;
	}

	.wallet-actions {
		display: flex;
		flex-direction: column;
		gap: 10px;
		margin-top: 16px;
	}

	.wallet-info {
		background: var(--color-bg-tertiary);
		border-radius: var(--radius-md);
		padding: 12px;
		margin: 16px 0;
		text-align: left;
	}

	.wallet-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
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
		font-weight: 500;
	}

	.log {
		margin-top: 16px;
		text-align: left;
		max-height: 180px;
		overflow-y: auto;
		border-top: 1px solid var(--color-border);
		padding-top: 12px;
	}

	.log-row {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 12px;
		font-family: var(--font-mono);
		padding: 3px 0;
	}

	.log-dir {
		width: 14px;
		color: var(--color-text-muted);
	}

	.log-row.in .log-dir {
		color: var(--color-info);
	}
	.log-row.out .log-dir {
		color: var(--color-success);
	}
	.log-row.err .log-dir {
		color: var(--color-error);
	}

	.log-text {
		flex: 1;
		color: var(--color-text-secondary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.log-time {
		color: var(--color-text-muted);
		font-size: 10px;
	}

	.err-msg {
		color: var(--color-error);
		margin-bottom: 20px;
		word-break: break-word;
	}

	.brand {
		font-size: 11px;
		color: var(--color-text-muted);
	}
</style>
