/**
 * Injected into the page's main world.
 * Creates an EIP-1193 compliant provider and announces it via EIP-6963.
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

  // ---- Forward to content script ----
  function forwardRequest(method: string, params?: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const requestId = crypto.randomUUID()
      pendingRequests.set(requestId, { resolve, reject })

      window.postMessage(
        { source: SOURCE_INJECTED, type: 'rpc_request', requestId, method, params },
        '*',
      )

      setTimeout(() => {
        if (pendingRequests.has(requestId)) {
          pendingRequests.delete(requestId)
          const err: any = new Error('Request timeout')
          err.code = -32003
          reject(err)
        }
      }, 60_000)
    })
  }

  // ---- EIP-1193 Provider ----
  const provider = {
    // Standard flags
    isRemoteInject: true,
    isMetaMask: false,

    // EIP-1193 required method
    isConnected(): boolean {
      return isConnected
    },

    // Dynamic properties for legacy DApp compatibility
    get selectedAddress(): string | null {
      return currentAccounts[0] ?? null
    },

    get chainId(): string {
      return currentChainId
    },

    get networkVersion(): string {
      return String(parseInt(currentChainId, 16))
    },

    // EIP-1193 request method
    request(args: { method: string; params?: unknown }): Promise<unknown> {
      const { method, params } = args

      switch (method) {
        // ---- Locally handled: state reads ----
        case 'eth_accounts':
          return Promise.resolve([...currentAccounts])

        case 'eth_chainId':
          return Promise.resolve(currentChainId)

        case 'net_version':
          return Promise.resolve(String(parseInt(currentChainId, 16)))

        case 'eth_coinbase':
          return Promise.resolve(currentAccounts[0] ?? null)

        case 'web3_clientVersion':
          return Promise.resolve('RemoteInjectBridge/0.1.0')

        // ---- Locally handled: permissions (Uniswap calls these) ----
        case 'wallet_getPermissions':
          return Promise.resolve(
            isConnected
              ? [{ parentCapability: 'eth_accounts', caveats: [{ type: 'restrictReturnedAccounts', value: currentAccounts }] }]
              : [],
          )

        case 'wallet_requestPermissions': {
          if (isConnected && currentAccounts.length > 0) {
            return Promise.resolve([
              { parentCapability: 'eth_accounts', caveats: [{ type: 'restrictReturnedAccounts', value: currentAccounts }] },
            ])
          }
          // Fall through to remote if not connected
          return forwardRequest(method, params)
        }

        // ---- Connection request ----
        case 'eth_requestAccounts': {
          if (isConnected && currentAccounts.length > 0) {
            return Promise.resolve([...currentAccounts])
          }
          // Fall through to remote — SDK will wait for mobile to connect
          return forwardRequest(method, params)
        }

        // ---- Methods that MUST go to mobile (signing, chain management) ----
        case 'personal_sign':
        case 'eth_sign':
        case 'eth_signTypedData':
        case 'eth_signTypedData_v3':
        case 'eth_signTypedData_v4':
        case 'eth_sendTransaction':
        case 'eth_sendRawTransaction':
        case 'wallet_switchEthereumChain':
        case 'wallet_addEthereumChain':
        case 'wallet_watchAsset':
          return forwardRequest(method, params)

        // ---- All other methods: forward to mobile (eth_call, eth_getBalance, etc.) ----
        default:
          return forwardRequest(method, params)
      }
    },

    // EIP-1193 event methods
    on(event: string, fn: (...args: any[]) => void) {
      const name = event as EventName
      if (!listeners.has(name)) listeners.set(name, new Set())
      listeners.get(name)!.add(fn)
      return provider
    },

    removeListener(event: string, fn: (...args: any[]) => void) {
      listeners.get(event as EventName)?.delete(fn)
      return provider
    },

    // Alias for removeListener
    off(event: string, fn: (...args: any[]) => void) {
      return provider.removeListener(event, fn)
    },

    addListener(event: string, fn: (...args: any[]) => void) {
      return provider.on(event, fn)
    },

    once(event: string, fn: (...args: any[]) => void) {
      const wrapped = (...args: any[]) => {
        provider.removeListener(event, wrapped)
        fn(...args)
      }
      return provider.on(event, wrapped)
    },

    // Legacy methods
    enable() {
      return provider.request({ method: 'eth_requestAccounts' })
    },

    send(methodOrPayload: string | any, paramsOrCallback?: any) {
      if (typeof methodOrPayload === 'string') {
        return provider.request({ method: methodOrPayload, params: paramsOrCallback })
      }
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
        const wasConnected = isConnected
        currentAccounts = data.accounts || []
        currentChainId = data.chainId || '0x1'
        isConnected = data.connected || false

        if (isConnected && currentAccounts.length > 0) {
          if (!wasConnected) {
            emit('connect', { chainId: currentChainId })
          }
          emit('accountsChanged', [...currentAccounts])
        } else if (wasConnected && !isConnected) {
          emit('disconnect', { code: 4900, message: 'Disconnected' })
        }
        break
      }
    }
  })

  // ---- EIP-6963 ----

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

  announceProvider()
  window.addEventListener('eip6963:requestProvider', announceProvider)

  // ---- window.ethereum fallback for legacy DApps ----
  if (typeof (window as any).ethereum === 'undefined') {
    Object.defineProperty(window, 'ethereum', {
      value: provider,
      writable: true,
      configurable: true,
    })
  }
})
