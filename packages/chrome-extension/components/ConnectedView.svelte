<script lang="ts">
  import { t } from '../lib/i18n'

  let { account, chainId, sessionId, dim = false }:
    { account: string; chainId: string; sessionId?: string; dim?: boolean } = $props()

  const CHAIN_NAMES: Record<string, string> = {
    '0x1':    'Ethereum',
    '0x38':   'BNB Chain',
    '0x89':   'Polygon',
    '0xa':    'Optimism',
    '0xa4b1': 'Arbitrum',
    '0xa86a': 'Avalanche',
    '0xfa':   'Fantom',
    '0x2105': 'Base',
    '0xe708': 'Linea',
    '0xa4ec': 'Celo',
  }

  let chainName = $derived(CHAIN_NAMES[chainId] || `Chain ${parseInt(chainId, 16)}`)
  let shortAddr = $derived(
    account ? `${account.slice(0, 6)}···${account.slice(-4)}` : '—'
  )
  let initials = $derived(account ? account.slice(2, 4).toUpperCase() : '??')

  let copied = $state(false)

  async function copyAddress() {
    if (!account) return
    await navigator.clipboard.writeText(account)
    copied = true
    setTimeout(() => (copied = false), 1800)
  }
</script>

<div class="card" class:dim>
  <div class="top-row">
    <div class="avatar" aria-hidden="true">{initials}</div>
    <div class="info">
      <button class="address" onclick={copyAddress} title={account}>
        {shortAddr}
      </button>
      <span class="chain">{chainName}</span>
    </div>
    <button class="copy-btn" onclick={copyAddress} title={copied ? t('btn.copied') : t('btn.copy_address')}>
      {#if copied}
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
          <path d="M2 7l3.5 3.5 6.5-7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      {:else}
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
          <rect x="4.5" y="4.5" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="1.2"/>
          <path d="M9 4.5V2.5A1 1 0 0 0 8 1.5H2.5a1 1 0 0 0-1 1V8a1 1 0 0 0 1 1H4.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
        </svg>
      {/if}
    </button>
  </div>

  {#if sessionId}
    <div class="divider"></div>
    <div class="session-row">
      <span class="session-key">{t('session')}</span>
      <span class="session-val">{sessionId}</span>
    </div>
  {/if}
</div>

<style>
  .card {
    background: var(--s1);
    border: 1px solid var(--ln);
    border-radius: var(--r);
    padding: 13px 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    transition: opacity 0.15s;
  }

  .card.dim { opacity: 0.6; }

  .top-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .avatar {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    background: var(--accent-bg);
    color: var(--accent);
    font-size: 12px;
    font-weight: 700;
    font-family: var(--mono);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    letter-spacing: 0.5px;
    user-select: none;
  }

  .info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
    min-width: 0;
  }

  .address {
    background: none;
    border: none;
    padding: 0;
    color: var(--t1);
    font-size: 15px;
    font-weight: 600;
    font-family: var(--mono);
    cursor: pointer;
    text-align: left;
    letter-spacing: 0.3px;
    transition: color 0.12s;
    white-space: nowrap;
  }

  .address:hover { color: var(--accent); }

  .chain {
    font-size: 12px;
    color: var(--t3);
  }

  .copy-btn {
    background: none;
    border: none;
    color: var(--t3);
    cursor: pointer;
    padding: 5px;
    border-radius: 5px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: color 0.12s, background 0.12s;
    flex-shrink: 0;
  }

  .copy-btn:hover { color: var(--t1); background: var(--s2); }

  .divider {
    height: 1px;
    background: var(--ln);
    margin: 0 -14px;
  }

  .session-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .session-key {
    font-size: 11px;
    color: var(--t3);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    flex-shrink: 0;
  }

  .session-val {
    font-size: 17px;
    font-weight: 700;
    font-family: var(--mono);
    color: var(--accent);
    letter-spacing: 3px;
    flex: 1;
    text-align: center;
  }
</style>
