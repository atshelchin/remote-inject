import { PORT_NAME_CONTENT } from '../lib/constants'
import { MSG_SOURCE_INJECTED, MSG_SOURCE_CONTENT } from '../lib/types'
import type { ContentToBackgroundMessage, BackgroundToContentMessage } from '../lib/types'

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',

  main() {
    // 1. Inject the main-world script immediately
    injectScript('/injected.js', { keepInDom: true })

    // 2. Connect to background
    let port = connectPort()

    function connectPort(): chrome.runtime.Port {
      const p = chrome.runtime.connect({ name: PORT_NAME_CONTENT })

      p.onMessage.addListener((msg: BackgroundToContentMessage) => {
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

    // 3. Listen for messages from injected script → forward to background
    window.addEventListener('message', (event) => {
      if (event.source !== window) return
      const data = event.data
      if (!data || data.source !== MSG_SOURCE_INJECTED) return

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
          // Port disconnected; queue will be handled on reconnect
          // For now, send error back
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
