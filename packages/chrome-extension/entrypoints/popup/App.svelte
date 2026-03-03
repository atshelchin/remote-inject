<script lang="ts">
  import { onMount } from 'svelte'
  import type { ExtensionState } from '../../lib/types'
  import { DEFAULT_SERVER_URL } from '../../lib/constants'
  import ServerConfig from '../../components/ServerConfig.svelte'
  import QRCode from '../../components/QRCode.svelte'
  import ConnectedView from '../../components/ConnectedView.svelte'
  import RequestLog from '../../components/RequestLog.svelte'

  let state = $state<ExtensionState>({
    serverUrl: DEFAULT_SERVER_URL,
    status: 'disconnected',
    requests: [],
  })

  let error = $state('')

  onMount(() => {
    // Load initial state
    chrome.runtime.sendMessage({ type: 'popup_get_state' }, (response) => {
      if (response?.state) state = response.state
    })

    // Listen for storage changes
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.extensionState?.newValue) {
        state = changes.extensionState.newValue
      }
    })
  })

  function connect(serverUrl: string) {
    error = ''
    chrome.runtime.sendMessage({ type: 'popup_connect', serverUrl })
  }

  function disconnect() {
    chrome.runtime.sendMessage({ type: 'popup_disconnect' })
  }
</script>

<main>
  <header>
    <img src="/assets/icon.svg" alt="logo" class="logo" />
    <h1>Remote Inject</h1>
    <span class="badge" class:connected={state.status === 'connected'} class:waiting={state.status === 'waiting' || state.status === 'connecting'}>
      {state.status === 'connected' ? 'Connected' : state.status === 'waiting' ? 'Waiting' : state.status === 'connecting' ? 'Connecting' : 'Disconnected'}
    </span>
  </header>

  {#if error}
    <div class="error">{error}</div>
  {/if}

  {#if state.status === 'disconnected'}
    <ServerConfig serverUrl={state.serverUrl} onConnect={connect} />
  {:else if state.status === 'connecting'}
    <div class="center">
      <div class="spinner"></div>
      <p class="hint">Connecting to server...</p>
    </div>
  {:else if state.status === 'waiting'}
    <div class="qr-section">
      <p class="hint">Scan with your mobile wallet</p>
      {#if state.sessionUrl}
        <QRCode url={state.sessionUrl} />
      {/if}
      <button class="btn secondary" onclick={disconnect}>Cancel</button>
    </div>
  {:else if state.status === 'connected'}
    <ConnectedView account={state.account ?? ''} chainId={state.chainId ?? '0x1'} />
    <RequestLog requests={state.requests} />
    <button class="btn danger" onclick={disconnect}>Disconnect</button>
  {/if}
</main>

<style>
  :global(*) {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  :global(body) {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #0f172a;
    color: #e2e8f0;
    width: 360px;
    min-height: 400px;
  }

  main {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  header {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .logo {
    width: 28px;
    height: 28px;
    border-radius: 6px;
  }

  h1 {
    font-size: 16px;
    font-weight: 600;
    flex: 1;
  }

  .badge {
    font-size: 11px;
    padding: 3px 8px;
    border-radius: 99px;
    background: #334155;
    color: #94a3b8;
    font-weight: 500;
  }

  .badge.connected {
    background: #064e3b;
    color: #34d399;
  }

  .badge.waiting {
    background: #78350f;
    color: #fbbf24;
  }

  .error {
    background: #7f1d1d;
    color: #fca5a5;
    padding: 8px 12px;
    border-radius: 8px;
    font-size: 13px;
  }

  .center {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 32px 0;
  }

  .qr-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
  }

  .hint {
    font-size: 13px;
    color: #94a3b8;
    text-align: center;
  }

  .spinner {
    width: 32px;
    height: 32px;
    border: 3px solid #334155;
    border-top-color: #3b82f6;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  :global(.btn) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 10px 16px;
    border: none;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s;
    width: 100%;
  }

  :global(.btn.primary) {
    background: #3b82f6;
    color: #fff;
  }

  :global(.btn.primary:hover) {
    background: #2563eb;
  }

  :global(.btn.secondary) {
    background: #334155;
    color: #e2e8f0;
  }

  :global(.btn.secondary:hover) {
    background: #475569;
  }

  :global(.btn.danger) {
    background: #7f1d1d;
    color: #fca5a5;
  }

  :global(.btn.danger:hover) {
    background: #991b1b;
  }
</style>
