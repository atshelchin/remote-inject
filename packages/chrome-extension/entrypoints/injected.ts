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

  // ---- State readiness (wait for first state_update from extension) ----
  let stateReady = false
  let stateReadyCallbacks: (() => void)[] = []

  function waitForState(): Promise<void> {
    if (stateReady) return Promise.resolve()
    return new Promise((resolve) => {
      stateReadyCallbacks.push(resolve)
    })
  }

  function markStateReady() {
    if (stateReady) return
    stateReady = true
    stateReadyCallbacks.forEach((fn) => fn())
    stateReadyCallbacks = []
  }

  // If state_update never arrives (extension not installed / broken), unblock after 2s
  setTimeout(markStateReady, 2000)

  // ---- Capability cache ----
  let cachedCapabilities: unknown = undefined
  let capabilitiesQueried = false

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

      const result = provider._handleRequest(method, params)
      result.then(
        (res) => console.log(`[RemoteInject] ${method} →`, res),
        (err) => console.warn(`[RemoteInject] ${method} ✗`, err),
      )
      return result
    },

    _handleRequest(method: string, params?: unknown): Promise<unknown> {
      switch (method) {
        // ---- Locally handled: state reads (wait for initial state) ----
        case 'eth_accounts':
          return waitForState().then(() => [...currentAccounts])

        case 'eth_chainId':
          return waitForState().then(() => currentChainId)

        case 'net_version':
          return waitForState().then(() => String(parseInt(currentChainId, 16)))

        case 'eth_coinbase':
          return waitForState().then(() => currentAccounts[0] ?? null)

        case 'web3_clientVersion':
          return Promise.resolve('RemoteInjectBridge/0.1.0')

        // ---- Locally handled: permissions (Uniswap calls these) ----
        case 'wallet_getPermissions':
          return waitForState().then(() =>
            isConnected
              ? [{ parentCapability: 'eth_accounts', caveats: [{ type: 'restrictReturnedAccounts', value: currentAccounts }] }]
              : [],
          )

        case 'wallet_requestPermissions': {
          // Return cached permissions if we have accounts (even during reconnecting)
          if (currentAccounts.length > 0) {
            return Promise.resolve([
              { parentCapability: 'eth_accounts', caveats: [{ type: 'restrictReturnedAccounts', value: currentAccounts }] },
            ])
          }
          // Wait for state first — accounts might be on the way
          return waitForState().then(() => {
            if (currentAccounts.length > 0) {
              return [{ parentCapability: 'eth_accounts', caveats: [{ type: 'restrictReturnedAccounts', value: currentAccounts }] }]
            }
            // Many wallets don't support wallet_requestPermissions (EIP-2255).
            // Use eth_requestAccounts instead and wrap result as permissions response.
            return forwardRequest('eth_requestAccounts').then((accounts: any) => [
              { parentCapability: 'eth_accounts', caveats: [{ type: 'restrictReturnedAccounts', value: accounts }] },
            ])
          })
        }

        case 'wallet_revokePermissions':
          // Handle locally — NEVER forward to mobile wallet.
          // Forwarding would disconnect the bridge from the wallet, breaking everything.
          // DApps call this to "disconnect"; we just return success without side effects.
          return Promise.resolve(null)

        // ---- EIP-5792: try wallet first, cache result ----
        case 'wallet_getCapabilities':
          if (capabilitiesQueried) return Promise.resolve(cachedCapabilities)
          return forwardRequest(method, params)
            .then((res) => { cachedCapabilities = res; capabilitiesQueried = true; return res })
            .catch(() => { cachedCapabilities = {}; capabilitiesQueried = true; return {} })

        case 'wallet_getCallsStatus':
        case 'wallet_sendCalls':
        case 'wallet_showCallsStatus':
          return forwardRequest(method, params)

        // ---- Connection request ----
        case 'eth_requestAccounts': {
          // Wait for state first — may already be connected
          return waitForState().then(() => {
            if (isConnected && currentAccounts.length > 0) {
              return [...currentAccounts]
            }
            // Not connected — forward to wallet for initial connection
            return forwardRequest(method, params)
          })
        }

        // ---- Methods that MUST go to mobile (signing, chain management) ----
        case 'personal_sign':
        case 'eth_sign':
        case 'eth_signTypedData':
        case 'eth_signTypedData_v1':
        case 'eth_signTypedData_v3':
        case 'eth_signTypedData_v4':
        case 'eth_sendTransaction':
        case 'eth_sendRawTransaction':
        case 'eth_signTransaction':
        case 'wallet_switchEthereumChain':
        case 'wallet_addEthereumChain':
        case 'wallet_watchAsset':
          return forwardRequest(method, params)

        // ---- All other methods: forward to wallet ----
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

        // Mark state as ready so waiting requests can resolve
        markStateReady()
        // Announce provider after first state_update so DApps see correct accounts
        activateProvider()
        break
      }
    }
  })

  // ---- EIP-6963 (deferred until state is ready) ----

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

  // Delay provider activation until we have state from the extension.
  // This prevents DApps (like Uniswap) from calling eth_accounts before
  // the cached account data arrives, which would return [] and crash them.
  let providerActivated = false

  function activateProvider() {
    if (providerActivated) return
    providerActivated = true

    announceProvider()
    window.addEventListener('eip6963:requestProvider', announceProvider)

    // window.ethereum fallback for legacy DApps
    if (typeof (window as any).ethereum === 'undefined') {
      Object.defineProperty(window, 'ethereum', {
        value: provider,
        writable: true,
        configurable: true,
      })
    }
  }

  // Fallback: if state_update doesn't arrive within 500ms, activate anyway
  // (e.g., extension is disconnected and has no state to send)
  setTimeout(activateProvider, 500)
})
