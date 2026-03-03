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
  let debugMode = $state(false)

  onMount(() => {
    chrome.runtime.sendMessage({ type: 'popup_get_state' }, (response) => {
      if (response?.state) {
        state = response.state
        if (response.state.error) {
          error = response.state.error
        }
      }
    })

    chrome.storage.local.get('debugMode', (result) => {
      debugMode = result.debugMode ?? false
    })

    chrome.storage.onChanged.addListener((changes) => {
      if (changes.extensionState?.newValue) {
        const newState = changes.extensionState.newValue
        state = newState
        if (newState.error) {
          error = newState.error
        }
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

  function reconnect() {
    chrome.runtime.sendMessage({ type: 'popup_reconnect' })
  }

  function toggleDebug() {
    debugMode = !debugMode
    chrome.storage.local.set({ debugMode })
  }
</script>

<main>
  <header>
    <img src="/assets/icon.svg" alt="logo" class="logo" />
    <h1>Remote Inject</h1>
    <button class="debug-toggle" class:active={debugMode} onclick={toggleDebug} title="Debug mode">
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
        <path d="M8 14a4 4 0 0 0 4-4V8a4 4 0 0 0-8 0v2a4 4 0 0 0 4 4Z" stroke="currentColor" stroke-width="1.3" fill="none"/>
        <path d="M5.5 8.5h5M5.5 11h5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
        <path d="M8 4V2M5 5L3 3.5M11 5l2-1.5M4 8H1.5M12 8h2.5M4 12l-2 1.5M12 12l2 1.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
      </svg>
    </button>
    <span class="badge" class:connected={state.status === 'connected'} class:waiting={state.status === 'waiting' || state.status === 'connecting'} class:reconnecting={state.status === 'reconnecting'}>
      {state.status === 'connected' ? 'Connected' : state.status === 'waiting' ? 'Waiting' : state.status === 'connecting' ? 'Connecting' : state.status === 'reconnecting' ? 'Reconnecting' : 'Disconnected'}
    </span>
  </header>

  {#if error}
    <div class="error">{error}</div>
  {/if}

  {#if state.status === 'disconnected'}
    <div class="guide">
      <p class="guide-title">Bridge any DApp to your mobile wallet</p>
      <ol>
        <li>Enter your Remote Inject server URL below</li>
        <li>Click Connect and scan the QR code with your mobile wallet</li>
        <li>Open any DApp — it will detect "Remote Inject Bridge" as a wallet</li>
      </ol>
    </div>
    <ServerConfig serverUrl={state.serverUrl} onConnect={connect} />
  {:else if state.status === 'connecting'}
    <div class="center">
      <div class="spinner"></div>
      <p class="hint">Connecting to server...</p>
    </div>
  {:else if state.status === 'waiting'}
    <div class="qr-section">
      <p class="hint">Scan with your mobile wallet's DApp browser, or paste the link into it</p>
      {#if state.sessionUrl}
        <QRCode url={state.sessionUrl} />
      {/if}
      <button class="btn secondary" onclick={disconnect}>Cancel</button>
    </div>
  {:else if state.status === 'reconnecting'}
    {#if state.account}
      <ConnectedView account={state.account} chainId={state.chainId ?? '0x1'} />
    {/if}
    <div class="reconnecting-banner">
      <span class="banner-text">Connection lost</span>
      <button class="reconnect-btn" onclick={reconnect}>Reconnect</button>
    </div>
    <p class="reconnect-hint">Please make sure the bridge page is open on your phone</p>
    {#if debugMode}
      {#if state.sessionUrl}
        <div class="session-hint">
          <p>You can also open this link in your mobile wallet to reconnect faster:</p>
          <code class="session-url">{state.sessionUrl}</code>
        </div>
      {/if}
      <RequestLog requests={state.requests} />
    {/if}
    <button class="btn danger" onclick={disconnect}>Disconnect</button>
  {:else if state.status === 'connected'}
    <ConnectedView account={state.account ?? ''} chainId={state.chainId ?? '0x1'} />
    {#if debugMode}
      {#if state.sessionUrl}
        <div class="session-hint">
          <p>Wallet disconnected? Open the same link in your mobile wallet to reconnect:</p>
          <code class="session-url">{state.sessionUrl}</code>
        </div>
      {/if}
      <RequestLog requests={state.requests} />
    {/if}
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

  .debug-toggle {
    background: none;
    border: 1px solid transparent;
    border-radius: 6px;
    color: #64748b;
    cursor: pointer;
    padding: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s;
  }

  .debug-toggle:hover {
    color: #cbd5e1;
    background: #1e293b;
  }

  .debug-toggle.active {
    color: #3b82f6;
    background: #1e3a5f;
    border-color: #3b82f6;
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

  .badge.reconnecting {
    background: #78350f;
    color: #fb923c;
  }

  .error {
    background: #7f1d1d;
    color: #fca5a5;
    padding: 8px 12px;
    border-radius: 8px;
    font-size: 13px;
  }

  .guide {
    background: #1e293b;
    border-radius: 10px;
    padding: 14px;
  }

  .guide-title {
    font-size: 14px;
    font-weight: 500;
    color: #e2e8f0;
    margin-bottom: 10px;
  }

  .guide ol {
    padding-left: 20px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .guide li {
    font-size: 13px;
    color: #94a3b8;
    line-height: 1.4;
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

  .session-hint {
    background: #1e293b;
    border-radius: 8px;
    padding: 10px 12px;
  }

  .session-hint p {
    font-size: 12px;
    color: #64748b;
    margin-bottom: 6px;
  }

  .session-url {
    font-size: 11px;
    color: #94a3b8;
    word-break: break-all;
    display: block;
    background: #0f172a;
    padding: 6px 8px;
    border-radius: 4px;
    user-select: all;
  }

  .reconnecting-banner {
    display: flex;
    align-items: center;
    gap: 10px;
    background: #1c1917;
    border: 1px solid #78350f;
    border-radius: 8px;
    padding: 10px 14px;
    font-size: 13px;
    color: #fb923c;
  }

  .banner-text {
    flex: 1;
  }

  .reconnect-btn {
    background: #78350f;
    border: none;
    border-radius: 6px;
    color: #fed7aa;
    cursor: pointer;
    padding: 5px 12px;
    font-size: 12px;
    font-weight: 500;
    flex-shrink: 0;
    transition: all 0.15s;
  }

  .reconnect-btn:hover {
    background: #92400e;
  }

  .reconnect-hint {
    font-size: 12px;
    color: #64748b;
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

  .spinner.small {
    width: 16px;
    height: 16px;
    border-width: 2px;
    flex-shrink: 0;
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
