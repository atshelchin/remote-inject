import { RemoteProvider } from '@shelchin/remote-inject-sdk'
import type { BackgroundToOffscreenMessage, OffscreenProviderState } from '../../lib/types'
// @ts-ignore — Vite ?inline returns a base64 data URI at build time
import iconDataUrl from '../../assets/icon-48.png?inline'

const provider = new RemoteProvider()

// ------- Connection state -------

let userDisconnected = false

// Session data for on-demand reconnection
let lastServerUrl = ''
let lastSessionId = ''
let lastSessionUrl = ''

// Shared reconnection promise — multiple requests wait on the same attempt
let reconnectPromise: Promise<boolean> | null = null

// ------- Wait for connect event -------
// SDK's resumeSession() resolves on 'ready' SSE event, but provider.isConnected
// is only set to true when the 'connect' message arrives (with account/chain data).
// On reconnect, the server pushes 'connect' from cached walletInfo immediately after 'ready'.
// This helper waits for that connect event with a timeout.

function waitForConnect(timeoutMs = 5000): Promise<boolean> {
  if (provider.isConnected) return Promise.resolve(true)
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      provider.removeListener('connect', onConnect)
      resolve(provider.isConnected)
    }, timeoutMs)

    function onConnect() {
      clearTimeout(timer)
      provider.removeListener('connect', onConnect)
      resolve(true)
    }
    provider.on('connect', onConnect)
  })
}

// ------- Send helpers -------

function sendToBackground(msg: Record<string, unknown>) {
  chrome.runtime.sendMessage({ ...msg, target: 'background' })
}

function broadcastState() {
  // Determine status carefully:
  // - 'connected' if the provider is connected
  // - 'reconnecting' if not connected but we have session data (transient disconnect)
  // - 'disconnected' only if we truly have no session
  // Sending 'disconnected' prematurely causes background to clear storage,
  // which breaks the reconnection flow.
  let status: OffscreenProviderState['status'] = 'disconnected'
  if (provider.isConnected) {
    status = 'connected'
  } else if (lastSessionId && !userDisconnected) {
    status = 'reconnecting'
  }

  const state: OffscreenProviderState = {
    status,
    sessionId: provider.session.id || lastSessionId || undefined,
    sessionUrl: provider.session.url || lastSessionUrl || undefined,
    account: provider.accounts[0],
    chainId: provider.chainId,
  }
  sendToBackground({ type: 'state_update', state })
}

// ------- On-demand reconnection -------

function ensureConnected(): Promise<boolean> {
  if (provider.isConnected) return Promise.resolve(true)
  if (userDisconnected || !lastServerUrl || !lastSessionId) return Promise.resolve(false)

  // If already reconnecting, share the same promise — don't pile up attempts
  if (reconnectPromise) return reconnectPromise

  reconnectPromise = doReconnect().finally(() => {
    reconnectPromise = null
  })
  return reconnectPromise
}

async function doReconnect(): Promise<boolean> {
  sendToBackground({
    type: 'state_update',
    state: {
      status: 'reconnecting',
      sessionId: lastSessionId,
      sessionUrl: lastSessionUrl,
    } as OffscreenProviderState,
  })

  try {
    await provider.resumeSession({
      serverUrl: lastServerUrl,
      sessionId: lastSessionId,
      sessionUrl: lastSessionUrl,
    })

    // resumeSession resolves on 'ready' but isConnected is still false
    // until the 'connect' message arrives. Wait for it.
    const connected = await waitForConnect(5000)
    if (connected) {
      broadcastState()
    }
    return connected
  } catch (err: any) {
    console.log('[offscreen] On-demand reconnect failed:', err.message)
    // Stay in reconnecting state — don't auto-create new session.
    // User can manually retry via the popup's refresh button.
    return false
  }
}

// ------- Provider event forwarding -------

provider.on('connect', (info) => {
  sendToBackground({ type: 'event', event: 'connect', data: info })
  broadcastState()
})

provider.on('disconnect', (info: any) => {
  if (userDisconnected || info?.userInitiated) {
    // Permanent disconnect — notify DApps so they clear state
    sendToBackground({ type: 'event', event: 'disconnect', data: info })
    broadcastState()
    return
  }

  if (info?.code === 4901) {
    // Max reconnect attempts reached — SDK closed EventSource.
    // Stay in 'reconnecting' status (preserve cached accounts for DApps),
    // but the popup will show the user can manually retry.
    // On-demand reconnection via ensureConnected() still works when DApps make requests.
    console.log('[offscreen] Max reconnect attempts reached, waiting for manual retry or on-demand reconnect')
    sendToBackground({
      type: 'state_update',
      state: {
        status: 'reconnecting',
        sessionId: lastSessionId,
        sessionUrl: lastSessionUrl,
        error: 'max_retries',
      } as OffscreenProviderState,
    })
    return
  }

  // Transient disconnect (SSE drop) — DON'T send disconnect event to DApps.
  // Sending disconnect would clear accounts in injected.ts, causing DApps to restart
  // auth flows and trigger /nonce 409 errors. Instead, just update status to
  // 'reconnecting' which preserves cached accounts for DApps.
  sendToBackground({
    type: 'state_update',
    state: {
      status: 'reconnecting',
      sessionId: lastSessionId,
      sessionUrl: lastSessionUrl,
    } as OffscreenProviderState,
  })
})

provider.on('chainChanged', (chainId) => {
  sendToBackground({ type: 'event', event: 'chainChanged', data: chainId })
  broadcastState()
})

provider.on('accountsChanged', (accounts) => {
  sendToBackground({ type: 'event', event: 'accountsChanged', data: accounts })
  broadcastState()
})

provider.on('reconnecting', (info) => {
  sendToBackground({ type: 'event', event: 'reconnecting', data: info })
})

// ------- Message handler -------

chrome.runtime.onMessage.addListener((msg: BackgroundToOffscreenMessage, _sender, sendResponse) => {
  if (msg.target !== 'offscreen') return

  switch (msg.type) {
    case 'connect':
      userDisconnected = false
      handleConnect(msg.serverUrl)
      break
    case 'disconnect':
      userDisconnected = true
      reconnectPromise = null
      provider.disconnect()
      lastServerUrl = ''
      lastSessionId = ''
      lastSessionUrl = ''
      broadcastState()
      break
    case 'request':
      handleRequest(msg.requestId, msg.method, msg.params)
      break
    case 'resume':
      userDisconnected = false
      handleResume(msg.serverUrl, msg.sessionId, msg.sessionUrl)
      break
  }
})

async function handleConnect(serverUrl: string) {
  try {
    sendToBackground({
      type: 'state_update',
      state: { status: 'connecting' } as OffscreenProviderState,
    })

    const result = await provider.connect(serverUrl, {
      name: 'Remote Inject Bridge',
      url: serverUrl,
      icon: iconDataUrl as string,
    })

    // result.url may be absolute (from server) or relative
    const sessionUrl = result.url.startsWith('http')
      ? result.url
      : `${serverUrl}${result.url}`

    // Save for on-demand reconnection
    lastServerUrl = serverUrl
    lastSessionId = result.sessionId
    lastSessionUrl = sessionUrl

    const state: OffscreenProviderState = {
      status: 'waiting',
      sessionId: result.sessionId,
      sessionUrl,
    }
    sendToBackground({ type: 'state_update', state })
  } catch (err: any) {
    sendToBackground({
      type: 'state_update',
      state: { status: 'disconnected', error: err.message } as OffscreenProviderState,
    })
  }
}

let resumeInProgress = false

async function handleResume(serverUrl: string, sessionId: string, sessionUrl: string) {
  if (resumeInProgress) {
    console.log('[offscreen] Resume already in progress, skipping')
    return
  }
  resumeInProgress = true

  // Save for on-demand reconnection
  lastServerUrl = serverUrl
  lastSessionId = sessionId
  lastSessionUrl = sessionUrl

  try {
    // Use 'reconnecting' (not 'connecting') to preserve cached account/session info in popup.
    // 'connecting' shows a bare spinner; 'reconnecting' keeps the connected view visible.
    sendToBackground({
      type: 'state_update',
      state: { status: 'reconnecting', sessionId, sessionUrl } as OffscreenProviderState,
    })

    await provider.resumeSession({ serverUrl, sessionId, sessionUrl })

    // SSE is up. broadcastState() will reflect 'connected' if the server pushed
    // cached walletInfo (connect event), or 'reconnecting' if wallet is offline.
    // The global provider.on('connect') listener handles the transition once
    // wallet data arrives — no need to block here.
    broadcastState()
  } catch (err: any) {
    console.log('[offscreen] Resume failed:', err.message)

    // Session expired on server — fall back to creating a new session
    if (err.message?.includes('Session not found') || err.message?.includes('expired') || err.message?.includes('404')) {
      console.log('[offscreen] Session expired, creating new session...')
      lastSessionId = ''
      lastSessionUrl = ''
      await handleConnect(serverUrl)
      return
    }

    // Network error or other transient issue — stay in reconnecting
    sendToBackground({
      type: 'state_update',
      state: { status: 'reconnecting', sessionId, sessionUrl } as OffscreenProviderState,
    })
  } finally {
    resumeInProgress = false
  }
}

async function handleRequest(requestId: string, method: string, params?: unknown) {
  console.log(`[offscreen] request: ${method}`, { connected: provider.isConnected, userDisconnected, lastSessionId: !!lastSessionId, reconnecting: !!reconnectPromise })

  // Try to reconnect on-demand if SSE connection is down
  if (!provider.isConnected) {
    const reconnected = await ensureConnected()
    if (!reconnected) {
      console.warn(`[offscreen] ${method} rejected: not connected, reconnect failed`)
      sendToBackground({
        type: 'response',
        requestId,
        error: { code: -32002, message: 'Wallet not connected. Please reconnect.' },
      })
      return
    }
    console.log(`[offscreen] ${method}: reconnected successfully`)
  }

  try {
    console.log(`[offscreen] ${method}: forwarding to SDK...`)
    const result = await provider.request({ method, params: params as any })
    console.log(`[offscreen] ${method} → result:`, result)
    sendToBackground({ type: 'response', requestId, result })
  } catch (err: any) {
    console.warn(`[offscreen] ${method} → error:`, err.code, err.message)
    sendToBackground({
      type: 'response',
      requestId,
      error: { code: err.code || -32603, message: err.message },
    })
  }
}
