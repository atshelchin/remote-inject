import { PORT_NAME_CONTENT } from '../lib/constants'
import { MSG_SOURCE_INJECTED, MSG_SOURCE_CONTENT } from '../lib/types'
import type { ContentToBackgroundMessage, BackgroundToContentMessage } from '../lib/types'

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',

  main() {
    // 1. Inject the main-world script immediately
    injectScript('/injected.js', { keepInDom: true })

    // 2. Buffer the latest state_update so we can re-send it when injected.js is ready.
    //    The initial state_update from background often arrives before injected.js has
    //    set up its message listener, causing the state to be lost.
    let lastStateUpdate: BackgroundToContentMessage | null = null
    let injectedReady = false

    // 3. Connect to background
    let port = connectPort()

    function connectPort(): chrome.runtime.Port {
      const p = chrome.runtime.connect({ name: PORT_NAME_CONTENT })

      p.onMessage.addListener((msg: BackgroundToContentMessage) => {
        // Buffer state_update messages
        if (msg.type === 'state_update') {
          lastStateUpdate = msg
        }

        // Forward from background → injected script
        window.postMessage({ ...msg, source: MSG_SOURCE_CONTENT }, '*')
      })

      p.onDisconnect.addListener(() => {
        // Service worker restarted; reconnect after a short delay
        setTimeout(() => {
          port = connectPort()
        }, 500)
      })

      return p
    }

    // 4. Forward debug mode setting to injected script
    chrome.storage.local.get('debugMode', (result) => {
      if (result.debugMode) {
        window.postMessage({ source: MSG_SOURCE_CONTENT, type: 'debug_mode', enabled: true }, '*')
      }
    })
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.debugMode) {
        window.postMessage({ source: MSG_SOURCE_CONTENT, type: 'debug_mode', enabled: !!changes.debugMode.newValue }, '*')
      }
    })

    // 5. Listen for messages from injected script
    window.addEventListener('message', (event) => {
      if (event.source !== window) return
      const data = event.data
      if (!data || data.source !== MSG_SOURCE_INJECTED) return

      // Injected.js signals it's ready — re-send the buffered state + debug mode
      if (data.type === 'ready') {
        injectedReady = true
        if (lastStateUpdate) {
          window.postMessage({ ...lastStateUpdate, source: MSG_SOURCE_CONTENT }, '*')
        }
        // Replay debug mode setting (initial send may have been lost before injected.js was ready)
        chrome.storage.local.get('debugMode', (result) => {
          window.postMessage({ source: MSG_SOURCE_CONTENT, type: 'debug_mode', enabled: !!result.debugMode }, '*')
        })
        return
      }

      if (data.type === 'rpc_request') {
        const msg: ContentToBackgroundMessage = {
          type: 'rpc_request',
          requestId: data.requestId,
          method: data.method,
          params: data.params,
        }
        try {
          port.postMessage(msg)
        } catch {
          // Port disconnected; send error back
          window.postMessage(
            {
              source: MSG_SOURCE_CONTENT,
              type: 'rpc_response',
              requestId: data.requestId,
              error: { code: -32000, message: 'Extension disconnected, retrying...' },
            },
            '*',
          )
        }
      }
    })
  },
})
