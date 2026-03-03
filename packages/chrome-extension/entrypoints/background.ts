import { PORT_NAME_CONTENT } from '../lib/constants'
import { getState, updateState, clearStateKeys, addRequestLog, updateRequestLog } from '../lib/storage'
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
    const isReconnecting = providerState.status === 'reconnecting'
    const isDisconnected = providerState.status === 'disconnected'

    // Preserve account/chainId during reconnecting; clear on full disconnect
    const updated = await updateState({
      status: providerState.status,
      sessionId: providerState.sessionId,
      sessionUrl: providerState.sessionUrl,
      account: isDisconnected ? undefined : (providerState.account ?? current.account),
      chainId: isDisconnected ? undefined : (providerState.chainId ?? current.chainId),
      error: providerState.error,
    })

    // updateState ignores undefined, so explicitly clear on disconnect
    if (isDisconnected) {
      await clearStateKeys(['account', 'chainId', 'sessionId', 'sessionUrl', 'error'])
    }

    const finalState = isDisconnected ? await getState() : updated

    updateBadge(providerState.status === 'connected')

    // DApps see cached state during reconnecting (accounts/chainId remain valid)
    const dappConnected = providerState.status === 'connected' || (isReconnecting && !!finalState.account)
    broadcastToTabs({
      type: 'state_update',
      accounts: finalState.account ? [finalState.account] : [],
      chainId: finalState.chainId ?? '0x1',
      connected: dappConnected,
    })
  }

  // ---- Content script port connections ----

  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== PORT_NAME_CONTENT) return

    const tabId = port.sender?.tab?.id
    if (!tabId) return

    tabPorts.set(tabId, port)

    // Send current state to newly connected tab
    // During reconnecting, DApps still see cached accounts (WS will reconnect on-demand)
    getState().then((state) => {
      const dappConnected = (state.status === 'connected' || state.status === 'reconnecting') && !!state.account
      port.postMessage({
        type: 'state_update',
        accounts: state.account ? [state.account] : [],
        chainId: state.chainId ?? '0x1',
        connected: dappConnected,
      } satisfies BackgroundToContentMessage)
    })

    port.onMessage.addListener(async (msg: ContentToBackgroundMessage) => {
      if (msg.type === 'rpc_request') {
        console.log(`[background] rpc_request: ${msg.method} from tab ${tabId}`)
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

          console.log(`[background] response for ${offMsg.requestId} → tab ${tabId}`, offMsg.error ? `error: ${offMsg.error.message}` : 'ok')

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
        // Tell offscreen to disconnect first — its state_update will clear storage via handleOffscreenStateUpdate
        ensureOffscreen().then(() => {
          sendToOffscreen({ type: 'disconnect' })
        })
        updateBadge(false)
        return

      case 'popup_reconnect':
        getState().then((st) => {
          if (st.serverUrl) {
            handlePopupConnect(st.serverUrl)
          }
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
    if (
      (state.status === 'connected' || state.status === 'waiting' || state.status === 'reconnecting') &&
      state.sessionId &&
      state.serverUrl
    ) {
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
