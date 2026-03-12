<script lang="ts">
  let { account, chainId, sessionId }: { account: string; chainId: string; sessionId?: string } = $props()

  const CHAIN_NAMES: Record<string, string> = {
    '0x1': 'Ethereum',
    '0x38': 'BSC',
    '0x89': 'Polygon',
    '0xa': 'Optimism',
    '0xa4b1': 'Arbitrum',
    '0xa86a': 'Avalanche',
    '0xfa': 'Fantom',
    '0x2105': 'Base',
    '0xe708': 'Linea',
    '0xa4ec': 'Celo',
  }

  let chainName = $derived(CHAIN_NAMES[chainId] || `Chain ${parseInt(chainId, 16)}`)
  let shortAddr = $derived(
    account ? `${account.slice(0, 6)}...${account.slice(-4)}` : 'Unknown',
  )

  async function copyAddress() {
    if (!account) return
    await navigator.clipboard.writeText(account)
    copied = true
    setTimeout(() => (copied = false), 2000)
  }

  let copied = $state(false)
</script>

<div class="card">
  <div class="row">
    <span class="label">Account</span>
    <button class="address" onclick={copyAddress} title={account}>
      {shortAddr}
      <span class="copy-hint">{copied ? 'Copied' : ''}</span>
    </button>
  </div>
  <div class="row">
    <span class="label">Network</span>
    <span class="value">{chainName}</span>
  </div>
  {#if sessionId}
  <div class="row session-row">
    <span class="label">Session <span class="verify-hint">verify with wallet</span></span>
    <span class="session-id">{sessionId}</span>
  </div>
  {/if}
</div>

<style>
  .card {
    background: #1e293b;
    border-radius: 10px;
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .label {
    font-size: 12px;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-weight: 500;
  }

  .value {
    font-size: 14px;
    color: #e2e8f0;
    font-weight: 500;
  }

  .address {
    background: none;
    border: none;
    color: #3b82f6;
    font-size: 14px;
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
    cursor: pointer;
    padding: 0;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .address:hover {
    color: #60a5fa;
  }

  .copy-hint {
    font-size: 11px;
    color: #34d399;
    font-family: -apple-system, sans-serif;
  }

  .session-row {
    border-top: 1px solid #1e293b;
    padding-top: 8px;
  }

  .verify-hint {
    font-size: 9px;
    color: #475569;
    font-weight: normal;
    text-transform: none;
    letter-spacing: 0;
    margin-left: 4px;
  }

  .session-id {
    font-size: 16px;
    font-weight: 700;
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
    color: #3b82f6;
    letter-spacing: 3px;
  }
</style>
