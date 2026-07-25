<script lang="ts">
	import { onMount } from 'svelte';
	import {
		WalletSession,
		isEvmRequest,
		type EvmRequest,
		type JsonValue,
		type ParticipantMeta
	} from '$lib/walletpair/protocol';
	import { chainIdFromHex, chainLogoUrl, fallbackChainName, fetchChainName } from '$lib/chain-meta';
	import { t } from '$lib/i18n';

	type Phase = 'loading' | 'no-uri' | 'no-wallet' | 'review' | 'connecting' | 'connected' | 'error';

	interface InjectedWallet {
		info: { uuid: string; name: string; icon: string; rdns: string };
		provider: any;
	}

	// The bridge signs with a REAL injected wallet on this page. WalletPair-style
	// bridges (Remote Inject, the WalletPair extension) are themselves dApp-side
	// relays with no local keys — selecting one would loop forever — so they are
	// excluded from the "sign with" list.
	const BRIDGE_RDNS = new Set(['com.remote-inject.bridge', 'org.walletpair.extension']);

	function isBridgeProvider(w: InjectedWallet): boolean {
		const p = w.provider;
		return !!(p?.isRemoteInject || p?.isWalletPair) || BRIDGE_RDNS.has(w.info.rdns);
	}

	let phase = $state<Phase>('loading');
	let errorMsg = $state('');
	let dapp = $state<{ name: string; url: string; icon: string } | null>(null);
	let code = $state('');
	let account = $state('');
	let chainHex = $state('');
	let chainName = $state('');
	let chainLogo = $state('');
	let chainLogoOk = $state(true);
	let logs = $state<{ dir: 'in' | 'out' | 'err'; text: string; time: string }[]>([]);
	let wallets = $state<InjectedWallet[]>([]);
	let selectedRdns = $state('');
	// The relay never tells a late joiner that the dApp is present, so "connected"
	// only means "joined the channel". If no request arrives shortly after, warn the
	// user to re-check the pairing code — the usual cause is a stale/mismatched link.
	let firstRequestSeen = $state(false);
	let waitingForApp = $state(false);
	let waitTimer: ReturnType<typeof setTimeout> | null = null;
	// Methods that make the wallet prompt for a signature/confirmation; while one is
	// in flight the bridge tells the user to switch to their wallet to approve it.
	const CONFIRMATION_METHODS = new Set([
		'eth_sendTransaction',
		'personal_sign',
		'eth_sign',
		'eth_signTypedData',
		'eth_signTypedData_v1',
		'eth_signTypedData_v3',
		'eth_signTypedData_v4',
		'wallet_addEthereumChain',
		'wallet_switchEthereumChain'
	]);
	let signingMethod = $state<string | null>(null);

	let session: WalletSession | null = null;
	let pairingUri: string | null = null;

	const selectedWallet = $derived(
		wallets.find((w) => w.info.rdns === selectedRdns) ?? wallets[0]
	);

	function eth(): any {
		return selectedWallet?.provider;
	}

	/**
	 * Discover injected wallets via EIP-6963 (the bridge is a dApp). Remote Inject
	 * is excluded — you can't bridge a wallet to itself. A legacy window.ethereum
	 * that didn't announce (and isn't Remote Inject) is added as a fallback.
	 */
	const found = new Map<string, InjectedWallet>();

	function addWallet(w: InjectedWallet | undefined) {
		if (!w?.info?.rdns || !w.provider) return;
		if (isBridgeProvider(w)) return; // never sign with another WalletPair bridge
		if (found.has(w.info.rdns)) return;
		found.set(w.info.rdns, w);
		wallets = [...found.values()];
		if (!selectedRdns) selectedRdns = w.info.rdns;
		if (phase === 'loading') phase = 'review';
	}

	function requestProviders() {
		window.dispatchEvent(new Event('eip6963:requestProvider'));
		// Legacy window.ethereum fallback (skip bridges / already-announced).
		const legacy = (globalThis as any).ethereum;
		if (legacy && !legacy.isRemoteInject && !legacy.isWalletPair) {
			const already = [...found.values()].some((w) => w.provider === legacy);
			if (!already) {
				addWallet({
					info: {
						uuid: 'legacy',
						name: legacy.isMetaMask ? 'MetaMask' : 'Injected wallet',
						icon: '',
						rdns: 'legacy.window.ethereum'
					},
					provider: legacy
				});
			}
		}
	}

	function discoverWallets(): void {
		// Keep the listener attached so late announcements still register; re-request
		// a couple of times because some wallets announce on load, others on request.
		window.addEventListener('eip6963:announceProvider', (e: any) => addWallet(e.detail));
		requestProviders();
		setTimeout(requestProviders, 300);
		setTimeout(requestProviders, 800);

		// If nothing eligible announced, fall to the "open in a wallet" guidance.
		setTimeout(() => {
			if (phase === 'loading') phase = 'no-wallet';
		}, 1200);
	}

	/**
	 * The wallet-side identity the extension displays as the connected wallet.
	 * Uses the selected injected wallet's name so the sidepanel shows e.g.
	 * "OKX Wallet" rather than the generic bridge name. The protocol requires an
	 * https icon, so a data-URI wallet logo falls back to the Remote Inject icon.
	 */
	function walletMetaFor(w: InjectedWallet): ParticipantMeta {
		const icon = w.info.icon?.startsWith('https:') ? w.info.icon : 'https://remoteinject.org/icon.png';
		const name = (w.info.name || 'Wallet').slice(0, 128);
		return { name, url: 'https://remoteinject.org', icon };
	}

	async function refreshChainMeta(hex: string) {
		const id = chainIdFromHex(hex);
		// Paint immediately from the built-in table + CDN logo, then upgrade the
		// name from the canonical dataset when it resolves.
		chainName = fallbackChainName(id);
		chainLogo = id > 0 ? chainLogoUrl(id) : '';
		chainLogoOk = true;
		if (id > 0) chainName = await fetchChainName(id);
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
		pageUrl = location.href;
		const uri = getPairingUri();
		pairingUri = uri;
		const target =
			location.host + location.pathname + (uri ? '?uri=' + encodeURIComponent(uri) : location.hash);
		mmLink = 'https://metamask.app.link/dapp/' + target;

		if (!uri) {
			phase = 'no-uri';
			return;
		}
		try {
			// A neutral session drives the review screen (peer + pairing code). The
			// real session is rebuilt at connect() with the chosen wallet's identity;
			// the pairing code is derived from the dApp side, so it is unchanged.
			session = buildSession({
				name: 'Remote Inject',
				url: 'https://remoteinject.org',
				icon: 'https://remoteinject.org/icon.png'
			});
			session.prepare(uri);
			code = session.pairingCode;
		} catch (e: any) {
			errorMsg = e?.message ?? String(e);
			phase = 'error';
			return;
		}
		// Discover the local injected wallet(s) to sign with (moves to review/no-wallet).
		discoverWallets();
	});

	function buildSession(meta: ParticipantMeta): WalletSession {
		return new WalletSession({
			meta,
			onPeer: (peer) => (dapp = peer),
			onMessage: handleMessage,
			onError: (e) => {
				errorMsg = e.message;
			}
		});
	}

	async function connect() {
		const w = selectedWallet;
		if (!w || !pairingUri) return;
		phase = 'connecting';
		try {
			// Rebuild with the selected wallet's identity so the extension shows the
			// actual signing wallet. prepare() re-derives keys; the code is unchanged.
			session?.close();
			session = buildSession(walletMetaFor(w));
			session.prepare(pairingUri);
			code = session.pairingCode;
			await session.confirm();
			phase = 'connected';
			// Joined the channel — but the dApp only truly reaches us if it is on the
			// same channel. Surface a code-mismatch hint if nothing arrives soon.
			if (waitTimer) clearTimeout(waitTimer);
			waitTimer = setTimeout(() => {
				if (!firstRequestSeen) waitingForApp = true;
			}, 8000);
			subscribeWalletEvents();
			await authorizeAndSync();
		} catch (e: any) {
			errorMsg = e?.message ?? String(e);
			phase = 'error';
		}
	}

	async function handleMessage(message: JsonValue, chainId: string) {
		if (!isEvmRequest(message as JsonValue)) return;
		const req = message as EvmRequest;
		// First real request proves the dApp is on our channel — clear the warning.
		firstRequestSeen = true;
		waitingForApp = false;
		if (waitTimer) {
			clearTimeout(waitTimer);
			waitTimer = null;
		}
		log('in', req.method);
		const needsConfirm = CONFIRMATION_METHODS.has(req.method);
		if (needsConfirm) signingMethod = req.method;
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
		} finally {
			if (needsConfirm) signingMethod = null;
		}
	}

	async function authorizeAndSync() {
		try {
			// Authorize the selected wallet so we have an account to relay. If it is
			// already authorized, eth_accounts returns it without a prompt; otherwise
			// prompt once with eth_requestAccounts.
			let accts = await eth().request({ method: 'eth_accounts' });
			if (!Array.isArray(accts) || accts.length === 0) {
				accts = await eth().request({ method: 'eth_requestAccounts' });
			}
			account = Array.isArray(accts) ? (accts[0] ?? '') : '';
			const cid = await eth().request({ method: 'eth_chainId' });
			chainHex = cid;
			refreshChainMeta(cid);
			const caip = caip2From(cid);
			session!.send({ event: 'connect', data: { chainId: cid } as JsonValue }, caip);
			session!.send({ event: 'chainChanged', data: cid }, caip);
			if (account) session!.send({ event: 'accountsChanged', data: [account] as JsonValue });
		} catch {
			/* user may reject authorization — the dApp's own request will re-prompt */
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
			refreshChainMeta(c);
			session?.send({ event: 'chainChanged', data: c }, caip2From(c));
		});
	}

	function shorten(addr: string): string {
		return addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : '';
	}

	// MetaMask (and most in-app browsers) open http(s) deep links but routinely
	// drop the URL fragment, so the deep link (built in onMount) carries the
	// pairing URI as a query param the bridge also accepts (?uri=).
	let mmLink = $state('');
	let pageUrl = $state('');
	let copied = $state(false);

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

				<label class="wallet-picker">
					<span class="wallet-picker-label">{t('bridge.review.signWith')}</span>
					{#if wallets.length > 1}
						<select bind:value={selectedRdns} disabled={phase === 'connecting'}>
							{#each wallets as w (w.info.rdns)}
								<option value={w.info.rdns}>{w.info.name}</option>
							{/each}
						</select>
					{:else}
						<span class="wallet-picker-single">
							{#if selectedWallet?.info.icon}<img src={selectedWallet.info.icon} alt="" />{/if}
							{selectedWallet?.info.name ?? '—'}
						</span>
					{/if}
					<button type="button" class="rescan" onclick={requestProviders}>
						{t('bridge.review.rescan')}
					</button>
				</label>

				<button class="btn btn-primary big" onclick={connect} disabled={phase === 'connecting' || !selectedWallet}>
					{#if phase === 'connecting'}<span class="spinner"></span> {t('bridge.review.connecting')}
					{:else}{t('bridge.review.connect')}{/if}
				</button>
			</div>
		{:else if phase === 'connected'}
			<div class="state" role="status" aria-live="polite">
				<div class="state-icon ok">✓</div>
				<h2>{t('bridge.connected.title')}</h2>
				{#if dapp}<p class="lead">{dapp.name}</p>{/if}
				{#if signingMethod}
					<div class="signing-banner" role="alert">
						<span class="spinner"></span>
						<span>{t('bridge.connected.confirm')}<code>{signingMethod}</code></span>
					</div>
				{/if}
				<div class="wallet-info">
					{#if selectedWallet}
						<div class="wallet-row">
							<span class="wallet-label">{t('bridge.connected.wallet')}</span>
							<span class="wallet-value chain-value">
								{#if selectedWallet.info.icon}
									<img class="chain-logo" src={selectedWallet.info.icon} alt="" />
								{/if}
								{selectedWallet.info.name}
							</span>
						</div>
					{/if}
					<div class="wallet-row">
						<span class="wallet-label">{t('bridge.connected.account')}</span>
						<span class="wallet-value">{shorten(account) || '—'}</span>
					</div>
					<div class="wallet-row">
						<span class="wallet-label">{t('bridge.connected.chain')}</span>
						<span class="wallet-value chain-value">
							{#if chainLogo && chainLogoOk}
								<img
									class="chain-logo"
									src={chainLogo}
									alt=""
									onerror={() => (chainLogoOk = false)}
								/>
							{/if}
							{chainName || chainHex || '—'}
						</span>
					</div>
				</div>
				<div class="pairing-check">
					<span class="pairing-label">{t('bridge.connected.pairing')}</span>
					<span class="pairing-code">{code.slice(0, 2)} {code.slice(2)}</span>
				</div>
				{#if waitingForApp}
					<p class="warn">
						{t('bridge.connected.waiting')}
					</p>
				{/if}
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

	.wallet-picker {
		display: flex;
		flex-direction: column;
		gap: 6px;
		text-align: left;
		margin-bottom: 16px;
	}

	.wallet-picker-label {
		font-size: 12px;
		color: var(--color-text-muted);
	}

	.wallet-picker select {
		width: 100%;
		padding: 10px 12px;
		font-size: 14px;
		font-family: inherit;
		color: var(--color-text-primary);
		background: var(--color-bg-primary);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		outline: none;
	}

	.wallet-picker select:focus {
		border-color: var(--color-accent);
	}

	.wallet-picker-single {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 12px;
		font-size: 14px;
		font-weight: 500;
		background: var(--color-bg-tertiary);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
	}

	.wallet-picker-single img {
		width: 18px;
		height: 18px;
		border-radius: 4px;
	}

	.rescan {
		align-self: flex-start;
		background: none;
		border: none;
		padding: 2px 0;
		font-size: 11px;
		color: var(--color-text-muted);
		text-decoration: underline;
	}

	.rescan:hover {
		color: var(--color-accent);
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

	.chain-value {
		display: flex;
		align-items: center;
		gap: 6px;
		font-family: inherit;
		max-width: 200px;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}

	.chain-logo {
		width: 16px;
		height: 16px;
		border-radius: 50%;
		flex-shrink: 0;
		object-fit: cover;
	}

	.pairing-check {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		margin: 4px 0 12px;
		font-size: 12px;
		color: var(--color-text-muted);
	}

	.pairing-code {
		font-family: var(--font-mono);
		font-weight: 700;
		letter-spacing: 2px;
		color: var(--color-accent);
	}

	.signing-banner {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		margin: 12px 0;
		padding: 10px 14px;
		font-size: 13px;
		font-weight: 500;
		color: var(--color-warning);
		background: var(--color-warning-bg);
		border-radius: var(--radius-md);
	}

	.signing-banner code {
		margin-left: 6px;
		font-family: var(--font-mono);
		font-size: 11px;
		opacity: 0.8;
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
