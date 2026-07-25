<script lang="ts">
  import type { ConnectedWallet, ActivityEntry } from '@/lib/types';
  import ActivityLog from './ActivityLog.svelte';
  import SigningToast from './SigningToast.svelte';
  import { getActivityLog, clearActivityLog } from '@/lib/storage';
  import { chainLogoUrl, fallbackChainName, fetchChainName } from '@/lib/chain-meta';
  import { Copy, Check } from 'lucide-svelte';
  import { t } from '@/lib/i18n.svelte';

  let {
    wallet,
    onDisconnect,
    signingInProgress,
    fingerprint,
  }: {
    wallet?: ConnectedWallet | null;
    onDisconnect: () => void;
    signingInProgress?: { method: string; origin: string };
    fingerprint?: string;
  } = $props();

  // Pairing code stays visible after connecting so it can be cross-checked
  // against the bridge — matching codes prove both sides share one channel.
  let pairingCode = $derived(
    fingerprint && fingerprint.length >= 4
      ? `${fingerprint.slice(0, 2)} ${fingerprint.slice(2, 4)}`
      : fingerprint ?? '',
  );

  let activity = $state<ActivityEntry[]>([]);
  let currentOrigin = $state<string | undefined>(undefined);

  function updateCurrentOrigin() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const url = tabs[0]?.url;
      if (url) {
        try { currentOrigin = new URL(url).origin; } catch { /* ignore */ }
      }
    });
  }

  $effect(() => {
    updateCurrentOrigin();

    // Re-query origin when user switches tabs or windows
    const onTabActivated = () => updateCurrentOrigin();
    const onWindowFocused = (windowId: number) => {
      if (windowId !== chrome.windows.WINDOW_ID_NONE) updateCurrentOrigin();
    };
    // Also catches in-tab navigations (e.g. SPA route changes)
    const onTabUpdated = (_tabId: number, info: { url?: string }) => {
      if (info.url) updateCurrentOrigin();
    };

    chrome.tabs.onActivated.addListener(onTabActivated);
    chrome.windows.onFocusChanged.addListener(onWindowFocused);
    chrome.tabs.onUpdated.addListener(onTabUpdated);

    const load = () => getActivityLog().then(a => { activity = a; });
    load();
    const timer = setInterval(load, 2000);

    return () => {
      clearInterval(timer);
      chrome.tabs.onActivated.removeListener(onTabActivated);
      chrome.windows.onFocusChanged.removeListener(onWindowFocused);
      chrome.tabs.onUpdated.removeListener(onTabUpdated);
    };
  });

  async function handleClearActivity() {
    await clearActivityLog();
    activity = [];
  }

  let address = $derived(wallet?.address ?? '');
  let shortAddress = $derived(
    address ? `${address.slice(0, 6)}...${address.slice(-4)}` : t('Unknown', '未知'),
  );
  let copied = $state(false);

  // Chain name + logo, upgraded from the canonical dataset once it resolves.
  let chainName = $state('');
  let chainLogo = $state('');
  let chainLogoOk = $state(true);

  $effect(() => {
    const id = wallet?.chainId ?? 1;
    chainName = fallbackChainName(id);
    chainLogo = chainLogoUrl(id);
    chainLogoOk = true;
    let stale = false;
    fetchChainName(id).then((n) => {
      if (!stale) chainName = n;
    });
    return () => {
      stale = true;
    };
  });

  function copyAddress() {
    if (!address) return;
    navigator.clipboard.writeText(address);
    copied = true;
    setTimeout(() => (copied = false), 2000);
  }
</script>

<div class="connected">
  <div class="wallet-card">
    <div class="wallet-avatar">
      {#if wallet?.icon}
        <img src={wallet.icon} alt="" class="wallet-icon" />
      {:else}
        <div class="avatar-fallback">
          {address ? address.slice(2, 4).toUpperCase() : 'WP'}
        </div>
      {/if}
    </div>

    <div class="wallet-info">
      <div class="wallet-heading">
        <span class="wallet-name">{wallet?.name || t('Wallet', '钱包')}</span>
        <span class="status-badge green">
          <span class="status-dot green"></span>
          {t('Connected', '已连接')}
        </span>
      </div>
      <button class="address-btn" onclick={copyAddress} title={t('Copy address', '复制地址')} aria-label={t('Copy address', '复制地址')}>
        <span class="address">{shortAddress}</span>
        {#if copied}
          <Check size={12} strokeWidth={2} color="var(--green)" />
        {:else}
          <Copy size={12} strokeWidth={1.5} />
        {/if}
      </button>
    </div>

    <div class="chain-badge">
      {#if chainLogo && chainLogoOk}
        <img class="chain-logo" src={chainLogo} alt="" onerror={() => (chainLogoOk = false)} />
      {/if}
      <span class="chain-name">{chainName}</span>
    </div>
  </div>

  {#if pairingCode}
    <div class="pairing-check" title={t('Both sides must show the same code', '两端应显示相同配对码')}>
      <span class="pairing-label">{t('Pairing code', '配对码')}</span>
      <span class="pairing-code">{pairingCode}</span>
    </div>
  {/if}

  <SigningToast method={signingInProgress?.method} origin={signingInProgress?.origin} />
  <ActivityLog entries={activity} filterOrigin={currentOrigin} onClear={handleClearActivity} />

  <div class="actions">
    <button class="btn-disconnect" onclick={onDisconnect}>{t('Disconnect', '断开连接')}</button>
  </div>
</div>

<style>
  .connected {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
    animation: fadeInScale 0.3s ease-out;
  }

  .status-badge {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 10px;
    font-weight: 600;
    padding: 3px 7px;
    border-radius: 100px;
  }
  .status-badge.green {
    background: var(--green-dim);
    color: var(--green);
  }

  .status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }
  .status-dot.green {
    background: var(--green);
  }

  .wallet-card {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 16px;
    width: 100%;
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 12px;
    box-shadow: var(--shadow-card);
  }

  .wallet-avatar {
    width: 46px;
    height: 46px;
    border-radius: 14px;
    overflow: hidden;
    flex-shrink: 0;
  }

  .wallet-icon {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .avatar-fallback {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--accent-dim);
    color: var(--accent);
    font-weight: 700;
    font-size: 16px;
    font-family: 'SF Mono', 'Fira Code', monospace;
  }

  .wallet-info {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    min-width: 0;
    flex: 1;
  }

  .wallet-heading {
    display: flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
  }

  .wallet-name {
    font-size: 15px;
    font-weight: 700;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .address-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    background: none;
    padding: 2px 0;
    color: var(--text-dim);
  }

  .address {
    font-size: 12px;
    color: var(--text-dim);
    font-family: 'SF Mono', 'Fira Code', monospace;
  }

  .pairing-check {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    margin-top: -4px;
    font-size: 11px;
    color: var(--text-dim);
  }

  .pairing-label {
    text-transform: uppercase;
    letter-spacing: 0.4px;
  }

  .pairing-code {
    font-family: 'SF Mono', 'Fira Code', monospace;
    font-weight: 700;
    letter-spacing: 2px;
    color: var(--accent);
  }

  .chain-badge {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 11px;
    font-weight: 500;
    color: var(--accent-hover);
    background: var(--accent-dim);
    padding: 4px 10px;
    border-radius: 100px;
    flex-shrink: 0;
    max-width: 120px;
  }

  .chain-logo {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    flex-shrink: 0;
    object-fit: cover;
  }

  .chain-name {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .actions {
    width: 100%;
    padding-top: 2px;
  }

  .btn-disconnect {
    width: 100%;
    background: transparent;
    color: var(--text-dim);
    font-size: 13px;
    font-weight: 500;
    padding: 10px 24px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
  }
  .btn-disconnect:hover {
    color: var(--red);
    border-color: var(--red);
    background: var(--red-dim);
  }

  .address-btn:hover {
    color: var(--accent);
  }

  @keyframes fadeInScale {
    from { opacity: 0; transform: scale(0.95); }
    to { opacity: 1; transform: scale(1); }
  }
</style>
