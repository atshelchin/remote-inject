<script lang="ts">
  import { onMount } from 'svelte'
  import type { ExtensionState } from '../../lib/types'
  import { DEFAULT_SERVER_URL } from '../../lib/constants'
  import ServerConfig from '../../components/ServerConfig.svelte'
  import QRCode from '../../components/QRCode.svelte'
  import ConnectedView from '../../components/ConnectedView.svelte'
  import RequestLog from '../../components/RequestLog.svelte'

  let { sidepanel = false }: { sidepanel?: boolean } = $props()

  let state = $state<ExtensionState>({
    serverUrl: DEFAULT_SERVER_URL,
    status: 'disconnected',
    requests: [],
  })

  let error = $state('')
  let debugMode = $state(false)
  let reconnectPending = $state(false)

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
        if (newState.error) error = newState.error
        if (newState.status !== 'reconnecting') reconnectPending = false
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
    if (reconnectPending) return
    reconnectPending = true
    chrome.runtime.sendMessage({ type: 'popup_reconnect' })
    setTimeout(() => { reconnectPending = false }, 10000)
  }

  function toggleDebug() {
    debugMode = !debugMode
    chrome.storage.local.set({ debugMode })
  }

  async function openSidepanel() {
    const [tab] = await new Promise<chrome.tabs.Tab[]>((resolve) =>
      chrome.tabs.query({ active: true, currentWindow: true }, resolve)
    )
    if (tab?.windowId != null) {
      await chrome.sidePanel.open({ windowId: tab.windowId })
      window.close()
    }
  }

  let statusLabel = $derived(
    state.status === 'connected' ? 'Connected'
    : state.status === 'waiting' ? 'Waiting'
    : state.status === 'connecting' ? 'Connecting'
    : state.status === 'reconnecting' ? 'Reconnecting'
    : 'Offline'
  )

  let showActivity = $derived(sidepanel || debugMode)
</script>

<div class="app" class:sidepanel>
  <!-- ── Header ── -->
  <header>
    <img src="/assets/icon.png" alt="" class="logo" />
    <span class="brand">Remote Inject Bridge</span>
    <div class="header-right">
      {#if !sidepanel}
        <button class="icon-btn" onclick={openSidepanel} title="Open in side panel">
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
            <rect x="0.65" y="0.65" width="12.7" height="12.7" rx="2" stroke="currentColor" stroke-width="1.3"/>
            <line x1="9" y1="0.65" x2="9" y2="13.35" stroke="currentColor" stroke-width="1.3"/>
          </svg>
        </button>
      {/if}
      <button class="icon-btn" class:active={debugMode} onclick={toggleDebug} title="Debug">
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
          <path d="M8 14a4 4 0 0 0 4-4V8a4 4 0 0 0-8 0v2a4 4 0 0 0 4 4Z" stroke="currentColor" stroke-width="1.3" fill="none"/>
          <path d="M5.5 8.5h5M5.5 11h5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
          <path d="M8 4V2M5 5L3 3.5M11 5l2-1.5M4 8H1.5M12 8h2.5M4 12l-2 1.5M12 12l2 1.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
        </svg>
      </button>
      <span
        class="status-chip"
        class:connected={state.status === 'connected'}
        class:pending={state.status === 'waiting' || state.status === 'connecting'}
        class:warning={state.status === 'reconnecting'}
      >{statusLabel}</span>
    </div>
  </header>

  <!-- ── Error ── -->
  {#if error}
    <div class="error-bar">
      <span>{error}</span>
      <button class="dismiss" onclick={() => (error = '')} aria-label="Dismiss">
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
          <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </button>
    </div>
  {/if}

  <!-- ── Disconnected ── -->
  {#if state.status === 'disconnected'}
    <div class="setup-view">
      <p class="setup-desc">Bridge any DApp to your mobile wallet via a relay server.</p>
      <ServerConfig serverUrl={state.serverUrl} onConnect={connect} />
    </div>

  <!-- ── Connecting ── -->
  {:else if state.status === 'connecting'}
    <div class="center-view">
      <span class="ring"></span>
      <span class="state-text">Connecting…</span>
    </div>

  <!-- ── Waiting for scan ── -->
  {:else if state.status === 'waiting'}
    <div class="qr-view">
      <p class="qr-hint">Open in your mobile wallet's DApp browser</p>
      {#if state.sessionUrl}
        <QRCode url={state.sessionUrl} />
      {/if}
      {#if state.sessionId}
        <div class="session-strip">
          <span class="strip-label">Session</span>
          <span class="strip-code">{state.sessionId}</span>
          <span class="strip-verify">verify</span>
        </div>
      {/if}
      <button class="btn-outline" onclick={disconnect}>Cancel</button>
    </div>

  <!-- ── Reconnecting ── -->
  {:else if state.status === 'reconnecting'}
    <div class="main-view">
      {#if state.account}
        <ConnectedView account={state.account} chainId={state.chainId ?? '0x1'} sessionId={state.sessionId} dim />
      {/if}
      <div class="alert-row">
        <span class="alert-dot"></span>
        <span class="alert-text">Connection lost</span>
        <button class="retry-btn" onclick={reconnect} disabled={reconnectPending}>
          {#if reconnectPending}
            <span class="mini-ring"></span>
          {:else}
            Retry
          {/if}
        </button>
      </div>
      <p class="tip">Keep the bridge page open on your phone</p>
      {#if showActivity}
        {#if state.sessionUrl}
          <div class="url-box">
            <p class="url-label">Session URL — paste into wallet to reconnect</p>
            <code class="url-val">{state.sessionUrl}</code>
          </div>
        {/if}
        <RequestLog requests={state.requests} />
      {/if}
      <button class="btn-disconnect" onclick={disconnect}>Disconnect</button>
    </div>

  <!-- ── Connected ── -->
  {:else if state.status === 'connected'}
    <div class="main-view">
      <ConnectedView account={state.account ?? ''} chainId={state.chainId ?? '0x1'} sessionId={state.sessionId} />
      {#if showActivity}
        {#if state.sessionUrl}
          <div class="url-box">
            <p class="url-label">Session URL — paste into wallet to reconnect</p>
            <code class="url-val">{state.sessionUrl}</code>
          </div>
        {/if}
        <RequestLog requests={state.requests} />
      {/if}
      <button class="btn-disconnect" onclick={disconnect}>Disconnect</button>
    </div>
  {/if}
</div>

<style>
  :global(*) {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  :global(:root) {
    --bg:         #0f0f11;
    --s1:         #1b1b1f;
    --s2:         #252529;
    --ln:         rgba(255,255,255,0.07);
    --ln2:        rgba(255,255,255,0.12);
    --t1:         #edeef1;
    --t2:         #8a8a94;
    --t3:         #52525c;
    --blue:       #4b8cff;
    --blue-bg:    rgba(75,140,255,0.1);
    --green:      #2dca78;
    --green-bg:   rgba(45,202,120,0.1);
    --amber:      #f5a130;
    --amber-bg:   rgba(245,161,48,0.1);
    --red:        #e04444;
    --red-bg:     rgba(224,68,68,0.1);
    --mono:       'SF Mono', 'Cascadia Code', Monaco, monospace;
    --r:          9px;
  }

  :global(body) {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    background: var(--bg);
    color: var(--t1);
    -webkit-font-smoothing: antialiased;
    line-height: 1.5;
  }

  :global(body.is-popup) {
    width: 340px;
  }

  :global(body.is-sidepanel) {
    min-height: 100vh;
  }

  /* ── App shell ── */
  .app {
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  /* ── Header ── */
  header {
    display: flex;
    align-items: center;
    gap: 7px;
  }

  .logo {
    width: 20px;
    height: 20px;
    border-radius: 4px;
    flex-shrink: 0;
  }

  .brand {
    font-size: 13px;
    font-weight: 600;
    color: var(--t1);
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 3px;
    flex-shrink: 0;
  }

  .icon-btn {
    background: none;
    border: none;
    color: var(--t3);
    cursor: pointer;
    padding: 4px;
    border-radius: 5px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: color 0.12s, background 0.12s;
    line-height: 1;
  }

  .icon-btn:hover { color: var(--t2); background: var(--s1); }
  .icon-btn.active { color: var(--blue); background: var(--blue-bg); }

  .status-chip {
    font-size: 10px;
    font-weight: 500;
    padding: 2px 7px;
    border-radius: 99px;
    background: var(--s1);
    color: var(--t3);
    margin-left: 2px;
  }
  .status-chip.connected { background: var(--green-bg); color: var(--green); }
  .status-chip.pending   { background: var(--blue-bg);  color: var(--blue);  }
  .status-chip.warning   { background: var(--amber-bg); color: var(--amber); }

  /* ── Error bar ── */
  .error-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--red-bg);
    border: 1px solid rgba(224,68,68,0.2);
    border-radius: 8px;
    padding: 8px 10px;
    font-size: 12px;
    color: var(--red);
  }
  .error-bar span { flex: 1; }

  .dismiss {
    background: none;
    border: none;
    color: var(--red);
    cursor: pointer;
    opacity: 0.6;
    padding: 2px;
    display: flex;
    align-items: center;
    transition: opacity 0.12s;
    flex-shrink: 0;
  }
  .dismiss:hover { opacity: 1; }

  /* ── Setup view ── */
  .setup-view {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .setup-desc {
    font-size: 12px;
    color: var(--t3);
    line-height: 1.55;
  }

  /* ── Connecting ── */
  .center-view {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
    padding: 38px 0;
  }

  .ring {
    width: 26px;
    height: 26px;
    border: 2px solid var(--s2);
    border-top-color: var(--blue);
    border-radius: 50%;
    animation: spin 0.65s linear infinite;
    display: block;
  }

  .mini-ring {
    width: 10px;
    height: 10px;
    border: 1.5px solid rgba(245,161,48,0.3);
    border-top-color: var(--amber);
    border-radius: 50%;
    animation: spin 0.65s linear infinite;
    display: inline-block;
  }

  @keyframes spin { to { transform: rotate(360deg); } }

  .state-text {
    font-size: 13px;
    color: var(--t2);
  }

  /* ── QR view ── */
  .qr-view {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
  }

  .qr-hint {
    font-size: 12px;
    color: var(--t2);
    text-align: center;
    line-height: 1.5;
  }

  /* ── Session strip ── */
  .session-strip {
    display: flex;
    align-items: center;
    gap: 7px;
    width: 100%;
    padding: 8px 12px;
    background: var(--s1);
    border: 1px solid var(--ln);
    border-radius: var(--r);
  }

  .strip-label {
    font-size: 10px;
    color: var(--t3);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    flex-shrink: 0;
  }

  .strip-code {
    font-size: 15px;
    font-weight: 700;
    font-family: var(--mono);
    color: var(--blue);
    letter-spacing: 3px;
    flex: 1;
    text-align: center;
  }

  .strip-verify {
    font-size: 9px;
    color: var(--t3);
    flex-shrink: 0;
  }

  /* ── Main view (connected / reconnecting) ── */
  .main-view {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  /* ── Alert row (reconnecting) ── */
  .alert-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: var(--amber-bg);
    border: 1px solid rgba(245,161,48,0.18);
    border-radius: 8px;
  }

  .alert-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--amber);
    flex-shrink: 0;
  }

  .alert-text {
    flex: 1;
    font-size: 12px;
    color: var(--amber);
  }

  .retry-btn {
    background: none;
    border: 1px solid rgba(245,161,48,0.3);
    border-radius: 5px;
    color: var(--amber);
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
    padding: 3px 9px;
    flex-shrink: 0;
    transition: background 0.12s;
    display: flex;
    align-items: center;
    gap: 5px;
    min-width: 48px;
    justify-content: center;
  }
  .retry-btn:hover:not(:disabled) { background: rgba(245,161,48,0.12); }
  .retry-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .tip {
    font-size: 11px;
    color: var(--t3);
    text-align: center;
  }

  /* ── URL debug box ── */
  .url-box {
    background: var(--s1);
    border: 1px solid var(--ln);
    border-radius: 8px;
    padding: 9px 11px;
  }

  .url-label {
    font-size: 11px;
    color: var(--t3);
    margin-bottom: 5px;
  }

  .url-val {
    font-size: 10px;
    color: var(--t2);
    font-family: var(--mono);
    word-break: break-all;
    display: block;
    user-select: all;
    line-height: 1.55;
  }

  /* ── Buttons ── */
  .btn-outline {
    width: 100%;
    padding: 9px 0;
    background: none;
    border: 1px solid var(--ln);
    border-radius: 8px;
    color: var(--t2);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: border-color 0.12s, color 0.12s;
  }
  .btn-outline:hover { border-color: var(--ln2); color: var(--t1); }

  .btn-disconnect {
    width: 100%;
    padding: 9px 0;
    background: var(--s1);
    border: 1px solid var(--ln);
    border-radius: 8px;
    color: var(--t2);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.12s;
  }
  .btn-disconnect:hover {
    background: var(--red-bg);
    border-color: rgba(224,68,68,0.2);
    color: var(--red);
  }

  /* ── Shared global buttons (used by ServerConfig) ── */
  :global(.btn-primary) {
    width: 100%;
    padding: 9px 0;
    background: var(--blue);
    border: none;
    border-radius: 8px;
    color: #fff;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.12s;
  }
  :global(.btn-primary:hover) { opacity: 0.86; }
  :global(.btn-primary:active) { opacity: 0.75; }
</style>
