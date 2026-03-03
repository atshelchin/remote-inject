import { RemoteProvider } from '@shelchin/remote-inject-sdk'
import type { BackgroundToOffscreenMessage, OffscreenProviderState } from '../../lib/types'

const provider = new RemoteProvider()

// ------- Send helpers -------

function sendToBackground(msg: Record<string, unknown>) {
  chrome.runtime.sendMessage({ ...msg, target: 'background' })
}

function broadcastState() {
  const state: OffscreenProviderState = {
    status: provider.isConnected ? 'connected' : 'disconnected',
    sessionId: provider.session.id || undefined,
    sessionUrl: provider.session.url || undefined,
    account: provider.accounts[0],
    chainId: provider.chainId,
  }
  sendToBackground({ type: 'state_update', state })
}

// ------- Provider event forwarding -------

provider.on('connect', (info) => {
  sendToBackground({ type: 'event', event: 'connect', data: info })
  broadcastState()
})

provider.on('disconnect', (info) => {
  sendToBackground({ type: 'event', event: 'disconnect', data: info })
  broadcastState()
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
      handleConnect(msg.serverUrl)
      break
    case 'disconnect':
      provider.disconnect()
      broadcastState()
      break
    case 'request':
      handleRequest(msg.requestId, msg.method, msg.params)
      break
    case 'resume':
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
      url: 'chrome-extension://' + chrome.runtime.id,
    })

    // result.url may be absolute (from server) or relative
    const sessionUrl = result.url.startsWith('http')
      ? result.url
      : `${serverUrl}${result.url}`

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

async function handleResume(serverUrl: string, sessionId: string, sessionUrl: string) {
  try {
    sendToBackground({
      type: 'state_update',
      state: { status: 'connecting' } as OffscreenProviderState,
    })

    await provider.resumeSession({ serverUrl, sessionId, sessionUrl })
    broadcastState()
  } catch (err: any) {
    sendToBackground({
      type: 'state_update',
      state: { status: 'disconnected', error: err.message } as OffscreenProviderState,
    })
  }
}

async function handleRequest(requestId: string, method: string, params?: unknown) {
  try {
    const result = await provider.request({ method, params: params as any })
    sendToBackground({ type: 'response', requestId, result })
  } catch (err: any) {
    sendToBackground({
      type: 'response',
      requestId,
      error: { code: err.code || -32603, message: err.message },
    })
  }
}
