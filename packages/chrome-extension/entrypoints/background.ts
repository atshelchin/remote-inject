import { PORT_NAME_CONTENT } from '../lib/constants'
import { getState, saveState, addRequestLog, updateRequestLog } from '../lib/storage'
import type {
  ContentToBackgroundMessage,
  BackgroundToContentMessage,
  OffscreenToBackgroundMessage,
  PopupToBackgroundMessage,
  ExtensionState,
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
    const updated: ExtensionState = {
      ...current,
      status: providerState.status,
      sessionId: providerState.sessionId ?? current.sessionId,
      sessionUrl: providerState.sessionUrl ?? current.sessionUrl,
      account: providerState.account ?? current.account,
      chainId: providerState.chainId ?? current.chainId,
    }

    // Clear session data on disconnect
    if (providerState.status === 'disconnected') {
      updated.sessionId = undefined
      updated.sessionUrl = undefined
      updated.account = undefined
      updated.chainId = undefined
    }

    await saveState(updated)
    updateBadge(providerState.status === 'connected')

    // Broadcast state to all tabs
    if (providerState.account || providerState.chainId) {
      broadcastToTabs({
        type: 'state_update',
        accounts: providerState.account ? [providerState.account] : [],
        chainId: providerState.chainId ?? '0x1',
        connected: providerState.status === 'connected',
      })
    }
  }

  // ---- Content script port connections ----

  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== PORT_NAME_CONTENT) return

    const tabId = port.sender?.tab?.id
    if (!tabId) return

    tabPorts.set(tabId, port)

    // Send current state to newly connected tab
    getState().then((state) => {
      if (state.status === 'connected' && state.account) {
        port.postMessage({
          type: 'state_update',
          accounts: [state.account],
          chainId: state.chainId ?? '0x1',
          connected: true,
        } satisfies BackgroundToContentMessage)
      }
    })

    port.onMessage.addListener(async (msg: ContentToBackgroundMessage) => {
      if (msg.type === 'rpc_request') {
        requestOrigins.set(msg.requestId, tabId)

        // Log the request
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

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
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

          // Update request log
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
      case 'popup_connect':
        saveState({
          ...(undefined as any), // will be merged
          serverUrl: popMsg.serverUrl,
          status: 'connecting',
          requests: [],
        }).then(() => getState()).then(async (state) => {
          await saveState({ ...state, serverUrl: popMsg.serverUrl, status: 'connecting' })
          await ensureOffscreen()
          sendToOffscreen({ type: 'connect', serverUrl: popMsg.serverUrl })
        })
        return

      case 'popup_disconnect':
        ensureOffscreen().then(() => {
          sendToOffscreen({ type: 'disconnect' })
        })
        return

      case 'popup_get_state':
        getState().then((state) => sendResponse({ state }))
        return true // async response
    }
  })

  // ---- Session resume on SW restart ----

  async function tryResumeSession() {
    const state = await getState()
    if (state.status === 'connected' || state.status === 'waiting') {
      if (state.sessionId && state.serverUrl) {
        await ensureOffscreen()
        sendToOffscreen({
          type: 'resume',
          serverUrl: state.serverUrl,
          sessionId: state.sessionId,
          sessionUrl: state.sessionUrl ?? '',
        })
      }
    }
  }

  tryResumeSession()
})
