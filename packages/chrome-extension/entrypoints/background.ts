import { PORT_NAME_CONTENT } from '../lib/constants'
import { getState, updateState, addRequestLog, updateRequestLog } from '../lib/storage'
import type {
  ContentToBackgroundMessage,
  BackgroundToContentMessage,
  OffscreenToBackgroundMessage,
  PopupToBackgroundMessage,
  OffscreenProviderState,
} from '../lib/types'

export default defineBackground(() => {
  // ---- Tab port registry ----
  const tabPorts = new Map<number, chrome.runtime.Port>()
  // ---- Request routing: requestId → tabId ----
  const requestOrigins = new Map<string, number>()

  // ---- Offscreen document management ----

  async function ensureOffscreen() {
    if (await chrome.offscreen.hasDocument?.()) return
    await chrome.offscreen.createDocument({
      url: chrome.runtime.getURL('/offscreen.html'),
      reasons: [chrome.offscreen.Reason.WORKERS],
      justification: 'Maintaining persistent WebSocket connection to relay server',
    })
  }

  function sendToOffscreen(msg: Record<string, unknown>) {
    chrome.runtime.sendMessage({ ...msg, target: 'offscreen' })
  }

  // ---- Badge ----

  function updateBadge(connected: boolean) {
    if (connected) {
      chrome.action.setBadgeBackgroundColor({ color: '#22c55e' })
      chrome.action.setBadgeText({ text: ' ' })
    } else {
      chrome.action.setBadgeText({ text: '' })
    }
  }

  // ---- Broadcast to all content script tabs ----

  function broadcastToTabs(msg: BackgroundToContentMessage) {
    for (const [, port] of tabPorts) {
      try {
        port.postMessage(msg)
      } catch {}
    }
  }

  // ---- Handle state update from offscreen ----

  async function handleOffscreenStateUpdate(providerState: OffscreenProviderState) {
    const current = await getState()
    const isDisconnecting = providerState.status === 'disconnected'

    const updated = await updateState({
      status: providerState.status,
      sessionId: providerState.sessionId ?? current.sessionId,
      sessionUrl: providerState.sessionUrl ?? current.sessionUrl,
      account: isDisconnecting ? undefined : (providerState.account ?? current.account),
      chainId: isDisconnecting ? undefined : (providerState.chainId ?? current.chainId),
      error: providerState.error,
      // Keep sessionId and sessionUrl even on disconnect for reconnection
    })

    updateBadge(providerState.status === 'connected')

    // Always broadcast state changes to all tabs
    broadcastToTabs({
      type: 'state_update',
      accounts: updated.account ? [updated.account] : [],
      chainId: updated.chainId ?? '0x1',
      connected: providerState.status === 'connected',
    })
  }

  // ---- Content script port connections ----

  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== PORT_NAME_CONTENT) return

    const tabId = port.sender?.tab?.id
    if (!tabId) return

    tabPorts.set(tabId, port)

    // Send current state to newly connected tab
    getState().then((state) => {
      port.postMessage({
        type: 'state_update',
        accounts: state.account ? [state.account] : [],
        chainId: state.chainId ?? '0x1',
        connected: state.status === 'connected',
      } satisfies BackgroundToContentMessage)
    })

    port.onMessage.addListener(async (msg: ContentToBackgroundMessage) => {
      if (msg.type === 'rpc_request') {
        requestOrigins.set(msg.requestId, tabId)

        await addRequestLog({
          id: msg.requestId,
          method: msg.method,
          status: 'pending',
          timestamp: Date.now(),
        })

        await ensureOffscreen()
        sendToOffscreen({
          type: 'request',
          requestId: msg.requestId,
          method: msg.method,
          params: msg.params,
        })
      }
    })

    port.onDisconnect.addListener(() => {
      tabPorts.delete(tabId)
    })
  })

  // ---- Messages from offscreen document & popup ----

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    // From offscreen document
    if (msg.target === 'background') {
      const offMsg = msg as OffscreenToBackgroundMessage
      switch (offMsg.type) {
        case 'state_update':
          handleOffscreenStateUpdate(offMsg.state)
          break

        case 'response': {
          const tabId = requestOrigins.get(offMsg.requestId)
          requestOrigins.delete(offMsg.requestId)

          updateRequestLog(offMsg.requestId, {
            status: offMsg.error ? 'failed' : 'completed',
            error: offMsg.error?.message,
          })

          if (tabId !== undefined) {
            const port = tabPorts.get(tabId)
            port?.postMessage({
              type: 'rpc_response',
              requestId: offMsg.requestId,
              result: offMsg.result,
              error: offMsg.error,
            } satisfies BackgroundToContentMessage)
          }
          break
        }

        case 'event':
          broadcastToTabs({
            type: 'event',
            event: offMsg.event as any,
            data: offMsg.data,
          })
          break
      }
      return
    }

    // From popup
    const popMsg = msg as PopupToBackgroundMessage
    switch (popMsg.type) {
      case 'popup_connect': {
        handlePopupConnect(popMsg.serverUrl)
        return
      }

      case 'popup_disconnect':
        ensureOffscreen().then(() => {
          sendToOffscreen({ type: 'disconnect' })
        })
        // Clear session data so next connect creates a fresh session
        updateState({
          status: 'disconnected',
          sessionId: undefined,
          sessionUrl: undefined,
          account: undefined,
          chainId: undefined,
          error: undefined,
        })
        return

      case 'popup_get_state':
        getState().then((state) => sendResponse({ state }))
        return true // keep sendResponse channel open for async
    }
  })

  // ---- Connect handler ----

  async function handlePopupConnect(serverUrl: string) {
    const current = await getState()

    await updateState({
      serverUrl,
      status: 'connecting',
      error: undefined,
    })

    await ensureOffscreen()

    // If we have an existing session for the same server, try to resume it
    if (current.sessionId && current.sessionUrl && current.serverUrl === serverUrl) {
      sendToOffscreen({
        type: 'resume',
        serverUrl,
        sessionId: current.sessionId,
        sessionUrl: current.sessionUrl,
      })
    } else {
      sendToOffscreen({ type: 'connect', serverUrl })
    }
  }

  // ---- Session resume on SW restart ----

  async function tryResumeSession() {
    const state = await getState()
    if ((state.status === 'connected' || state.status === 'waiting') && state.sessionId && state.serverUrl) {
      await ensureOffscreen()
      sendToOffscreen({
        type: 'resume',
        serverUrl: state.serverUrl,
        sessionId: state.sessionId,
        sessionUrl: state.sessionUrl ?? '',
      })
    }
  }

  tryResumeSession()
})
