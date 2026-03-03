/**
 * Injected into the page's main world.
 * Creates an EIP-1193 provider and announces it via EIP-6963.
 * Communicates with the content script via window.postMessage.
 */

const SOURCE_INJECTED = 'remote-inject-injected'
const SOURCE_CONTENT = 'remote-inject-content'

export default defineUnlistedScript(() => {
  // ---- State ----
  let currentAccounts: string[] = []
  let currentChainId = '0x1'
  let isConnected = false

  // ---- Pending requests ----
  const pendingRequests = new Map<
    string,
    { resolve: (v: unknown) => void; reject: (e: any) => void }
  >()

  // ---- Event emitter ----
  type EventName = 'connect' | 'disconnect' | 'chainChanged' | 'accountsChanged' | 'message'
  const listeners = new Map<EventName, Set<(...args: any[]) => void>>()

  function emit(event: EventName, ...args: any[]) {
    listeners.get(event)?.forEach((fn) => {
      try {
        fn(...args)
      } catch {}
    })
  }

  // ---- EIP-1193 Provider ----
  const provider = {
    isRemoteInject: true,

    request(args: { method: string; params?: unknown }): Promise<unknown> {
      const { method, params } = args

      // Local state reads
      if (method === 'eth_accounts') return Promise.resolve([...currentAccounts])
      if (method === 'eth_chainId') return Promise.resolve(currentChainId)
      if (method === 'net_version') {
        return Promise.resolve(String(parseInt(currentChainId, 16)))
      }
      if (method === 'eth_requestAccounts') {
        if (isConnected && currentAccounts.length > 0) {
          return Promise.resolve([...currentAccounts])
        }
        // Fall through — wait for mobile to connect via remote request
      }

      // Forward to content script
      return new Promise((resolve, reject) => {
        const requestId = crypto.randomUUID()
        pendingRequests.set(requestId, { resolve, reject })

        window.postMessage(
          { source: SOURCE_INJECTED, type: 'rpc_request', requestId, method, params },
          '*',
        )

        // 60s timeout
        setTimeout(() => {
          if (pendingRequests.has(requestId)) {
            pendingRequests.delete(requestId)
            reject({ code: -32003, message: 'Request timeout' })
          }
        }, 60_000)
      })
    },

    on(event: EventName, fn: (...args: any[]) => void) {
      if (!listeners.has(event)) listeners.set(event, new Set())
      listeners.get(event)!.add(fn)
    },

    removeListener(event: EventName, fn: (...args: any[]) => void) {
      listeners.get(event)?.delete(fn)
    },

    // Legacy methods
    enable() {
      return provider.request({ method: 'eth_requestAccounts' })
    },

    send(methodOrPayload: string | any, paramsOrCallback?: any) {
      if (typeof methodOrPayload === 'string') {
        return provider.request({ method: methodOrPayload, params: paramsOrCallback })
      }
      // Legacy payload format
      return provider
        .request({ method: methodOrPayload.method, params: methodOrPayload.params })
        .then((result) => paramsOrCallback?.(null, { id: methodOrPayload.id, jsonrpc: '2.0', result }))
        .catch((err: any) => paramsOrCallback?.(err))
    },

    sendAsync(payload: any, callback: any) {
      provider
        .request({ method: payload.method, params: payload.params })
        .then((result) => callback(null, { id: payload.id, jsonrpc: '2.0', result }))
        .catch((err: any) => callback(err))
    },
  }

  // ---- Listen for messages from content script ----
  window.addEventListener('message', (event) => {
    if (event.source !== window) return
    const data = event.data
    if (!data || data.source !== SOURCE_CONTENT) return

    switch (data.type) {
      case 'rpc_response': {
        const pending = pendingRequests.get(data.requestId)
        if (!pending) break
        pendingRequests.delete(data.requestId)
        if (data.error) {
          const err: any = new Error(data.error.message)
          err.code = data.error.code
          pending.reject(err)
        } else {
          pending.resolve(data.result)
        }
        break
      }

      case 'event': {
        switch (data.event) {
          case 'connect':
            isConnected = true
            emit('connect', data.data)
            break
          case 'disconnect':
            isConnected = false
            currentAccounts = []
            emit('disconnect', data.data)
            break
          case 'chainChanged':
            currentChainId = data.data as string
            emit('chainChanged', currentChainId)
            break
          case 'accountsChanged':
            currentAccounts = (data.data as string[]) || []
            emit('accountsChanged', [...currentAccounts])
            break
        }
        break
      }

      case 'state_update': {
        currentAccounts = data.accounts || []
        currentChainId = data.chainId || '0x1'
        isConnected = data.connected || false

        if (isConnected && currentAccounts.length > 0) {
          emit('connect', { chainId: currentChainId })
          emit('accountsChanged', [...currentAccounts])
        }
        break
      }
    }
  })

  // ---- EIP-6963 ----

  // Inline SVG icon as data URI
  const ICON_SVG = `data:image/svg+xml;base64,${btoa('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" fill="none"><rect width="128" height="128" rx="24" fill="#3b82f6"/><path d="M40 48h48M40 64h48M40 80h32" stroke="#fff" stroke-width="8" stroke-linecap="round"/><circle cx="88" cy="80" r="16" fill="#22c55e"/><path d="M82 80l4 4 8-8" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>')}`

  const providerInfo = Object.freeze({
    uuid: 'f81d4fae-7dec-11d0-a765-00a0c91e6bf6',
    name: 'Remote Inject Bridge',
    icon: ICON_SVG,
    rdns: 'com.remote-inject.bridge',
  })

  function announceProvider() {
    window.dispatchEvent(
      new CustomEvent('eip6963:announceProvider', {
        detail: Object.freeze({ info: providerInfo, provider }),
      }),
    )
  }

  // Announce immediately and on request
  announceProvider()
  window.addEventListener('eip6963:requestProvider', announceProvider)

  // ---- window.ethereum fallback for legacy DApps ----
  // Only set if nothing else is there. Don't fight with MetaMask etc.
  if (typeof (window as any).ethereum === 'undefined') {
    Object.defineProperty(window, 'ethereum', {
      value: provider,
      writable: true,
      configurable: true,
    })
  }
})
