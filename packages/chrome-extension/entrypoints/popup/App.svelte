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
  let showQR = $state(false)
  let theme = $state<'light' | 'dark'>('dark')

  // Sync theme to document so CSS variables cascade correctly
  $effect(() => {
    document.documentElement.dataset.theme = theme
  })

  function queryTabTheme(tabId?: number) {
    const send = (id: number) => {
      chrome.tabs.sendMessage(id, { type: 'query_page_theme' }, (response) => {
        if (chrome.runtime.lastError) return
        if (response?.theme === 'light' || response?.theme === 'dark') theme = response.theme
      })
    }
    if (tabId != null) {
      send(tabId)
    } else {
      chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
        if (tab?.id != null) send(tab.id)
      })
    }
  }

  onMount(() => {
    queryTabTheme()

    chrome.runtime.sendMessage({ type: 'popup_get_state' }, (response) => {
      if (response?.state) {
        state = response.state
        if (response.state.error) error = response.state.error
      }
    })

    chrome.storage.onChanged.addListener((changes) => {
      if (changes.extensionState?.newValue) {
        const newState = changes.extensionState.newValue
        state = newState
        if (newState.error) error = newState.error
      }
    })

    // Sidepanel: re-query theme whenever the active tab changes
    if (sidepanel) {
      chrome.tabs.onActivated.addListener(({ tabId }) => queryTabTheme(tabId))
    }
  })

  function connect(serverUrl: string) {
    error = ''
    chrome.runtime.sendMessage({ type: 'popup_connect', serverUrl })
  }

  function disconnect() {
    chrome.runtime.sendMessage({ type: 'popup_disconnect' })
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

  function closeSidepanel() {
    window.close()
  }

  let statusLabel = $derived(
    state.status === 'connected'      ? 'Connected'
    : state.status === 'waiting'      ? 'Waiting'
    : state.status === 'connecting'   ? 'Connecting'
    : state.status === 'reconnecting' ? 'Reconnecting'
    : 'Offline'
  )

</script>

<div class="app" class:sidepanel>
  <!-- ── Header ── -->
  <header>
    {#if !sidepanel}
      <img src="/assets/icon.png" alt="" class="logo" />
      <span class="brand">Remote Inject Bridge</span>
    {/if}
    <div class="header-right">
      {#if sidepanel}
        <button class="icon-btn" onclick={closeSidepanel} title="Close side panel">
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
            <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" stroke-width="1.35" stroke-linecap="round"/>
          </svg>
        </button>
      {:else}
        <button class="icon-btn" onclick={openSidepanel} title="Open in side panel">
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
            <rect x="0.65" y="0.65" width="12.7" height="12.7" rx="2" stroke="currentColor" stroke-width="1.3"/>
            <line x1="9" y1="0.65" x2="9" y2="13.35" stroke="currentColor" stroke-width="1.3"/>
          </svg>
        </button>
      {/if}
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
        <QRCode url={state.sessionUrl} {theme} />
      {/if}
      {#if state.sessionId}
        <div class="session-strip">
          <span class="strip-label">Session</span>
          <span class="strip-code">{state.sessionId}</span>
        </div>
      {/if}
      <button class="btn-outline" onclick={disconnect}>Cancel</button>
    </div>

  <!-- ── Reconnecting ── -->
  {:else if state.status === 'reconnecting'}
    {#if state.account}
      <!-- SSE dropped but walletInfo is cached — show as connected, reconnects automatically -->
      <div class="main-view">
        <ConnectedView account={state.account} chainId={state.chainId ?? '0x1'} sessionId={state.sessionId} />
        <RequestLog requests={state.requests} />
        <button class="btn-disconnect" onclick={disconnect}>Disconnect</button>
      </div>
    {:else}
      <!-- No wallet data yet — show QR so wallet can connect -->
      <div class="qr-view">
        <p class="qr-hint">Open in your mobile wallet's DApp browser</p>
        {#if state.sessionUrl}
          <QRCode url={state.sessionUrl} {theme} />
        {/if}
        {#if state.sessionId}
          <div class="session-strip">
            <span class="strip-label">Session</span>
            <span class="strip-code">{state.sessionId}</span>
          </div>
        {/if}
        <button class="btn-outline" onclick={disconnect}>Cancel</button>
      </div>
    {/if}

  <!-- ── Connected ── -->
  {:else if state.status === 'connected'}
    <div class="main-view">
      <ConnectedView account={state.account ?? ''} chainId={state.chainId ?? '0x1'} sessionId={state.sessionId} />
      {#if state.sessionUrl}
        <button class="qr-toggle" onclick={() => (showQR = !showQR)}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 3h3v3H2zM7 3h3v3H7zM2 7h3v3H2z" stroke="currentColor" stroke-width="1.1"/>
            <path d="M8 7h.5M9.5 7H10M8 8.5v.5M8 10v.5M10 8.5v.5M10 10v.5M9.5 9h.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
          </svg>
          {showQR ? 'Hide QR' : 'Show QR code'}
          <svg class="chevron" class:open={showQR} width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M2 3.5l3 3 3-3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        {#if showQR}
          <div class="qr-view">
            <QRCode url={state.sessionUrl} {theme} />
          </div>
        {/if}
      {/if}
      <RequestLog requests={state.requests} />
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

  /* ── Design tokens: dark (default) ── */
  :global(:root) {
    --bg:        #121210;
    --s1:        #1c1c1a;
    --s2:        #252523;
    --ln:        rgba(255,255,255,0.08);
    --ln2:       rgba(255,255,255,0.18);
    --t1:        #f0f0ed;
    --t2:        #b4b4ac;
    --t3:        #888880;
    --accent:    #e07040;
    --accent-bg: rgba(224,112,64,0.12);
    --green:     #4caf78;
    --green-bg:  rgba(76,175,120,0.12);
    --amber:     #d4901a;
    --amber-bg:  rgba(212,144,26,0.12);
    --red:       #d94040;
    --red-bg:    rgba(217,64,64,0.12);
    --mono:      'JetBrains Mono', 'Cascadia Code', 'SF Mono', Monaco, monospace;
    --r:         8px;
  }

  /* ── Light theme ── */
  :global([data-theme="light"]) {
    --bg:        #faf9f7;
    --s1:        #f0efe9;
    --s2:        #e4e3dc;
    --ln:        rgba(0,0,0,0.1);
    --ln2:       rgba(0,0,0,0.22);
    --t1:        #1a1a18;
    --t2:        #5a5a52;
    --t3:        #7e7e76;
    --accent:    #c45a2c;
    --accent-bg: rgba(196,90,44,0.1);
    --green:     #2e7d52;
    --green-bg:  rgba(46,125,82,0.1);
    --amber:     #a07020;
    --amber-bg:  rgba(160,112,32,0.1);
    --red:       #c03030;
    --red-bg:    rgba(192,48,48,0.1);
  }

  :global(html) {
    background: var(--bg);
    min-height: 100%;
  }

  :global(body) {
    font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
    background: var(--bg);
    color: var(--t1);
    -webkit-font-smoothing: antialiased;
    line-height: 1.5;
  }

  :global(body.is-popup)    { width: 360px; }
  :global(body.is-sidepanel){ min-height: 100vh; }

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
    font-size: 14px;
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
    margin-left: auto;
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

  .status-chip {
    font-size: 11px;
    font-weight: 500;
    padding: 2px 7px;
    border-radius: 99px;
    background: var(--s1);
    color: var(--t3);
    margin-left: 2px;
    white-space: nowrap;
  }
  .status-chip.connected { background: var(--green-bg);  color: var(--green);  }
  .status-chip.pending   { background: var(--accent-bg); color: var(--accent); }
  .status-chip.warning   { background: var(--amber-bg);  color: var(--amber);  }

  /* ── Error bar ── */
  .error-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--red-bg);
    border: 1px solid rgba(217,64,64,0.2);
    border-radius: 8px;
    padding: 8px 10px;
    font-size: 13px;
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
    font-size: 13px;
    color: var(--t2);
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
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.65s linear infinite;
    display: block;
  }

  @keyframes spin { to { transform: rotate(360deg); } }

  .state-text {
    font-size: 14px;
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
    font-size: 13px;
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
    font-size: 11px;
    color: var(--t3);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    flex-shrink: 0;
  }

  .strip-code {
    font-size: 17px;
    font-weight: 700;
    font-family: var(--mono);
    color: var(--accent);
    letter-spacing: 3px;
    flex: 1;
    text-align: center;
  }

  /* ── Main view ── */
  .main-view {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .tip {
    font-size: 12px;
    color: var(--t3);
    text-align: center;
  }

  /* ── QR toggle ── */
  .qr-toggle {
    display: flex;
    align-items: center;
    gap: 6px;
    background: none;
    border: 1px solid var(--ln);
    border-radius: 7px;
    color: var(--t2);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    padding: 8px 11px;
    width: 100%;
    transition: border-color 0.12s, color 0.12s, background 0.12s;
  }
  .qr-toggle:hover { border-color: var(--ln2); color: var(--t1); background: var(--s1); }

  .chevron {
    margin-left: auto;
    transition: transform 0.18s;
    color: var(--t3);
    flex-shrink: 0;
  }
  .chevron.open { transform: rotate(180deg); }

  /* ── Buttons ── */
  .btn-outline {
    width: 100%;
    padding: 9px 0;
    background: none;
    border: 1px solid var(--ln);
    border-radius: 8px;
    color: var(--t2);
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: border-color 0.12s, color 0.12s;
  }
  .btn-outline:hover { border-color: var(--ln2); color: var(--t1); }

  .btn-disconnect {
    width: 100%;
    padding: 10px 0;
    background: var(--s1);
    border: 1px solid var(--ln);
    border-radius: 8px;
    color: var(--t2);
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.12s;
  }
  .btn-disconnect:hover {
    background: var(--red-bg);
    border-color: rgba(217,64,64,0.2);
    color: var(--red);
  }

  /* ── Global: primary button (used by ServerConfig) ── */
  :global(.btn-primary) {
    width: 100%;
    padding: 9px 0;
    background: var(--accent);
    border: none;
    border-radius: 8px;
    color: #fff;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.12s;
  }
  :global(.btn-primary:hover)  { opacity: 0.86; }
  :global(.btn-primary:active) { opacity: 0.74; }
</style>
