import { PORT_NAME_CONTENT, DEFAULT_SERVER_URL, STORAGE_KEYS } from '../lib/constants'
import { MSG_SOURCE_INJECTED, MSG_SOURCE_CONTENT } from '../lib/types'
import type { ContentToBackgroundMessage, BackgroundToContentMessage } from '../lib/types'

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',

  main() {
    // Theme detection: respond to popup/sidepanel requests for the page's color scheme.
    // Runs unconditionally so it works on all pages including the relay server's own pages.
    chrome.runtime.onMessage.addListener((msg: any, _sender, sendResponse) => {
      if (msg.type !== 'query_page_theme') return
      function bgLuminance(el: Element | null): number | null {
        if (!el) return null
        const bg = getComputedStyle(el).backgroundColor
        const m = bg.match(/[\d.]+/g)
        if (!m || m.length < 3) return null
        const [r, g, b] = m.map(Number)
        const a = m.length >= 4 ? Number(m[3]) : 1
        if (a < 0.1) return null
        return (0.299 * r + 0.587 * g + 0.114 * b) / 255
      }
      let theme: 'light' | 'dark' = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
      for (const el of [document.documentElement, document.body]) {
        const lum = bgLuminance(el)
        if (lum != null && lum > 0.02 && lum < 0.98) {
          theme = lum > 0.5 ? 'light' : 'dark'
          break
        }
      }
      sendResponse({ theme })
      return true
    })

    // Inject immediately at document_start for EIP-6963 timing.
    // Previously wrapped in async chrome.storage.local.get() which delayed injection,
    // causing DApps to miss the eip6963:requestProvider announcement window.
    doInject()

    // Asynchronously check if current page is the server's own page.
    // If so, tell injected.ts to skip setting window.ethereum (to avoid breaking MetaMask/OKX).
    // EIP-6963 is safe on all pages since DApps choose which provider to use.
    chrome.storage.local.get(STORAGE_KEYS.STATE, (result: any) => {
      try {
        const serverUrl = result[STORAGE_KEYS.STATE]?.serverUrl || DEFAULT_SERVER_URL
        if (new URL(serverUrl).origin === window.location.origin) {
          window.postMessage({ source: MSG_SOURCE_CONTENT, type: 'skip_ethereum' }, '*')
        }
      } catch {}
    })

    function doInject() {
      // 1. Inject the main-world script immediately
      injectScript('/injected.js', { keepInDom: true })

      // 2. Buffer the latest state_update so we can re-send it when injected.js is ready.
      //    The initial state_update from background often arrives before injected.js has
      //    set up its message listener, causing the state to be lost.
      let lastStateUpdate: BackgroundToContentMessage | null = null

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
          // Extension context invalidated (extension reloaded/updated) — stop retrying
          if (!chrome.runtime?.id) return

          // Service worker restarted; reconnect after a short delay
          setTimeout(() => {
            if (!chrome.runtime?.id) return
            try {
              port = connectPort()
            } catch {
              // Context invalidated between check and connect — give up
            }
          }, 500)
        })

        return p
      }

      // 4. Forward debug mode setting to injected script
      chrome.storage.local.get('debugMode', (result: any) => {
        if (result.debugMode) {
          window.postMessage({ source: MSG_SOURCE_CONTENT, type: 'debug_mode', enabled: true }, '*')
        }
      })
      chrome.storage.onChanged.addListener((changes: any) => {
        if (changes.debugMode) {
          window.postMessage({ source: MSG_SOURCE_CONTENT, type: 'debug_mode', enabled: !!changes.debugMode.newValue }, '*')
        }
        // Forward overrideEthereum setting changes in real-time
        if (changes[STORAGE_KEYS.STATE]) {
          const newState = changes[STORAGE_KEYS.STATE].newValue
          const oldState = changes[STORAGE_KEYS.STATE].oldValue
          if (newState?.overrideEthereum !== oldState?.overrideEthereum) {
            window.postMessage({ source: MSG_SOURCE_CONTENT, type: 'override_ethereum', enabled: !!newState?.overrideEthereum }, '*')
          }
        }
      })

      // 5. Forward overrideEthereum setting to injected script
      chrome.storage.local.get(STORAGE_KEYS.STATE, (result: any) => {
        const overrideEthereum = result[STORAGE_KEYS.STATE]?.overrideEthereum ?? false
        if (overrideEthereum) {
          window.postMessage({ source: MSG_SOURCE_CONTENT, type: 'override_ethereum', enabled: true }, '*')
        }
      })

      // 6. Listen for messages from injected script
      window.addEventListener('message', (event) => {
        if (event.source !== window) return
        const data = event.data
        if (!data || data.source !== MSG_SOURCE_INJECTED) return

        // Injected.js signals it's ready — re-send the buffered state + settings
        if (data.type === 'ready') {
          if (lastStateUpdate) {
            window.postMessage({ ...lastStateUpdate, source: MSG_SOURCE_CONTENT }, '*')
          }
          // Replay debug mode setting (initial send may have been lost before injected.js was ready)
          chrome.storage.local.get('debugMode', (result: any) => {
            window.postMessage({ source: MSG_SOURCE_CONTENT, type: 'debug_mode', enabled: !!result.debugMode }, '*')
          })
          // Replay overrideEthereum setting
          chrome.storage.local.get(STORAGE_KEYS.STATE, (result: any) => {
            const overrideEthereum = result[STORAGE_KEYS.STATE]?.overrideEthereum ?? false
            if (overrideEthereum) {
              window.postMessage({ source: MSG_SOURCE_CONTENT, type: 'override_ethereum', enabled: true }, '*')
            }
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
          return
        }

        if (data.type === 'connection_request') {
          try {
            port.postMessage({ type: 'connection_request' } satisfies ContentToBackgroundMessage)
          } catch {
            // Port disconnected; ignore — user can manually open extension
          }
          return
        }
      })
    }
  },
})
