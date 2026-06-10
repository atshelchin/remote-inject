/**
 * Injected into the page's main world.
 * Creates an EIP-1193 compliant provider and announces it via EIP-6963.
 * Communicates with the content script via window.postMessage.
 */

// @ts-ignore — Vite ?inline returns a base64 data URI at build time
import iconDataUrl from '../assets/icon.png?inline'

const SOURCE_INJECTED = 'remote-inject-injected'
const SOURCE_CONTENT = 'remote-inject-content'

export default defineUnlistedScript(() => {
  // ---- Logging (gated behind debug mode, toggled from extension popup) ----
  let debugEnabled = false
  const TAG = '%c[RemoteInject]'
  const STYLE = 'color: #3b82f6; font-weight: bold'
  const STYLE_EVENT = 'color: #22c55e; font-weight: bold'
  const STYLE_WARN = 'color: #f59e0b; font-weight: bold'
  const STYLE_ERR = 'color: #ef4444; font-weight: bold'

  function log(...args: any[]) { if (debugEnabled) console.log(TAG, STYLE, ...args) }
  function logEvent(...args: any[]) { if (debugEnabled) console.log(TAG, STYLE_EVENT, ...args) }
  function logWarn(...args: any[]) { if (debugEnabled) console.warn(TAG, STYLE_WARN, ...args) }
  function logErr(...args: any[]) { if (debugEnabled) console.error(TAG, STYLE_ERR, ...args) }

  // ---- State ----
  let currentAccounts: string[] = []
  let currentChainId = '0x1'
  let isConnected = false

  // ---- State readiness (wait for first state_update from extension) ----
  let stateReady = false
  let stateReadyCallbacks: (() => void)[] = []
  // Callbacks invoked on every state_update (used by eth_requestAccounts to wait for connection)
  const stateUpdateWaiters = new Set<() => void>()

  function waitForState(): Promise<void> {
    if (stateReady) return Promise.resolve()
    log('⏳ waitForState: waiting for initial state...')
    return new Promise((resolve) => {
      stateReadyCallbacks.push(resolve)
    })
  }

  function markStateReady() {
    if (stateReady) return
    stateReady = true
    log('✅ State ready:', { accounts: currentAccounts, chainId: currentChainId, connected: isConnected })
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
    { resolve: (v: unknown) => void; reject: (e: any) => void; method: string; startTime: number }
  >()

  // ---- Event emitter ----
  type EventName = 'connect' | 'disconnect' | 'chainChanged' | 'accountsChanged' | 'message'
  const listeners = new Map<EventName, Set<(...args: any[]) => void>>()

  function emit(event: EventName, ...args: any[]) {
    const count = listeners.get(event)?.size ?? 0
    logEvent(`📢 emit('${event}') → ${count} listener(s)`, ...args)
    listeners.get(event)?.forEach((fn) => {
      try {
        fn(...args)
      } catch (e) {
        logErr(`Event listener error for '${event}':`, e)
      }
    })
  }

  // ---- Forward to content script ----
  function forwardRequest(method: string, params?: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const requestId = crypto.randomUUID()
      const startTime = Date.now()
      pendingRequests.set(requestId, { resolve, reject, method, startTime })

      log(`📤 FORWARD ${method} [${requestId.slice(0, 8)}]`, params ?? '')

      window.postMessage(
        { source: SOURCE_INJECTED, type: 'rpc_request', requestId, method, params },
        '*',
      )

      setTimeout(() => {
        if (pendingRequests.has(requestId)) {
          pendingRequests.delete(requestId)
          const err: any = new Error('Request timeout')
          err.code = -32003
          logErr(`⏰ TIMEOUT ${method} [${requestId.slice(0, 8)}] after 60s`)
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

      log(`📥 REQUEST ${method}`, params ?? '')
      log(`   state: connected=${isConnected}, accounts=[${currentAccounts.join(',')}], chain=${currentChainId}, stateReady=${stateReady}`)

      const result = provider._handleRequest(method, params)
      result.then(
        (res) => log(`✅ ${method} →`, res),
        (err) => logWarn(`❌ ${method} ✗`, err.code, err.message),
      )
      return result
    },

    _handleRequest(method: string, params?: unknown): Promise<unknown> {
      switch (method) {
        // ---- Locally handled: state reads (wait for initial state) ----
        case 'eth_accounts':
          log(`   → LOCAL (cached accounts)`)
          return waitForState().then(() => [...currentAccounts])

        case 'eth_chainId':
          log(`   → LOCAL (cached chainId)`)
          return waitForState().then(() => currentChainId)

        case 'net_version':
          log(`   → LOCAL (cached net_version)`)
          return waitForState().then(() => String(parseInt(currentChainId, 16)))

        case 'eth_coinbase':
          log(`   → LOCAL (cached coinbase)`)
          return waitForState().then(() => currentAccounts[0] ?? null)

        case 'web3_clientVersion':
          return Promise.resolve('RemoteInjectBridge/0.1.0')

        // ---- Locally handled: permissions (Uniswap calls these) ----
        case 'wallet_getPermissions':
          log(`   → LOCAL (getPermissions)`)
          return waitForState().then(() =>
            isConnected
              ? [{ parentCapability: 'eth_accounts', caveats: [{ type: 'restrictReturnedAccounts', value: currentAccounts }] }]
              : [],
          )

        case 'wallet_requestPermissions': {
          if (currentAccounts.length > 0) {
            log(`   → LOCAL (requestPermissions, have cached accounts)`)
            return Promise.resolve([
              { parentCapability: 'eth_accounts', caveats: [{ type: 'restrictReturnedAccounts', value: currentAccounts }] },
            ])
          }
          // No cached accounts — delegate to eth_requestAccounts which waits for wallet connection
          log(`   → DELEGATE to eth_requestAccounts (no cached accounts)`)
          return provider._handleRequest('eth_requestAccounts').then((accounts: any) => [
            { parentCapability: 'eth_accounts', caveats: [{ type: 'restrictReturnedAccounts', value: accounts }] },
          ])
        }

        case 'wallet_revokePermissions':
          log(`   → LOCAL (revokePermissions, no-op)`)
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
          return waitForState().then(() => {
            if (isConnected && currentAccounts.length > 0) {
              log(`   → LOCAL (requestAccounts, already connected)`)
              return [...currentAccounts]
            }
            // Wallet not connected yet — wait for connect event instead of forwarding
            // to offscreen (which would fail immediately). This handles the case where
            // the user clicks "connect" on the DApp while scanning QR / wallet is connecting.
            log(`   → WAITING for wallet connection (requestAccounts)`)
            // Signal extension to open side panel so user can connect
            window.postMessage({ source: SOURCE_INJECTED, type: 'connection_request' }, '*')

            return new Promise<unknown>((resolve, reject) => {
              const timeout = setTimeout(() => {
                cleanup()
                log(`   → requestAccounts TIMEOUT (60s)`)
                const err: any = new Error('User rejected the request')
                err.code = 4001
                reject(err)
              }, 60_000)

              function onStateUpdate() {
                if (isConnected && currentAccounts.length > 0) {
                  cleanup()
                  log(`   → requestAccounts resolved from state_update: accounts=${currentAccounts[0]}`)
                  resolve([...currentAccounts])
                }
              }

              function cleanup() {
                clearTimeout(timeout)
                provider.removeListener('accountsChanged', onAccountsChanged)
                stateUpdateWaiters.delete(onStateUpdate)
              }

              function onAccountsChanged(accounts: string[]) {
                if (accounts.length > 0) {
                  cleanup()
                  log(`   → requestAccounts resolved from accountsChanged: accounts=${accounts[0]}`)
                  resolve([...accounts])
                }
              }

              provider.on('accountsChanged', onAccountsChanged)
              // Also listen for state_update (fires before individual events)
              stateUpdateWaiters.add(onStateUpdate)
            })
          })
        }

        // ---- Chain management (update local state immediately on success) ----
        case 'wallet_switchEthereumChain': {
          const targetChainId = (params as any)?.[0]?.chainId
          log(`   → FORWARD to mobile wallet (switch to ${targetChainId})`)
          return forwardRequest(method, params).then((result) => {
            // Update chainId immediately on success — don't wait for async chainChanged event.
            // DApps call eth_chainId right after switchChain and expect the new chain.
            // IMPORTANT: Do NOT emit chainChanged here. The DApp called switchChain itself,
            // so it already knows the chain changed. Emitting would trigger DApp listeners
            // (e.g., Polymarket restarts SIWE auth flow → /nonce 409 conflict).
            // The chainChanged event will come through the relay if needed, and dedup
            // will skip it since currentChainId is already updated.
            if (targetChainId && currentChainId !== targetChainId) {
              log(`   → Chain updated silently: ${currentChainId} → ${targetChainId} (no emit — DApp initiated)`)
              currentChainId = targetChainId
            }
            return result
          })
        }

        // ---- Methods that MUST go to mobile (signing, transactions) ----
        case 'personal_sign':
        case 'eth_sign':
        case 'eth_signTypedData':
        case 'eth_signTypedData_v1':
        case 'eth_signTypedData_v3':
        case 'eth_signTypedData_v4':
        case 'eth_sendTransaction':
        case 'eth_sendRawTransaction':
        case 'eth_signTransaction':
        case 'wallet_addEthereumChain':
        case 'wallet_watchAsset':
          log(`   → FORWARD to mobile wallet`)
          return forwardRequest(method, params)

        // ---- All other methods: forward to wallet ----
        default:
          log(`   → FORWARD (default)`)
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
      case 'debug_mode':
        debugEnabled = !!data.enabled
        if (debugEnabled) console.log(TAG, STYLE, 'Debug logging enabled')
        break

      case 'skip_ethereum':
        skipEthereum = true
        log('Server page detected — window.ethereum will not be set')
        break

      case 'override_ethereum':
        overrideEthereum = !!data.enabled
        log(`Override ethereum: ${overrideEthereum}`)
        if (overrideEthereum && !ethereumSet) {
          maybeSetWindowEthereum()
        }
        break

      case 'rpc_response': {
        const pending = pendingRequests.get(data.requestId)
        if (!pending) {
          logWarn(`📨 RESPONSE [${data.requestId?.slice(0, 8)}] — no pending request found (stale?)`)
          break
        }
        const elapsed = Date.now() - pending.startTime
        pendingRequests.delete(data.requestId)
        if (data.error) {
          logWarn(`📨 RESPONSE ${pending.method} [${data.requestId.slice(0, 8)}] ERROR (${elapsed}ms):`, data.error)
          const err: any = new Error(data.error.message)
          err.code = data.error.code
          pending.reject(err)
        } else {
          log(`📨 RESPONSE ${pending.method} [${data.requestId.slice(0, 8)}] OK (${elapsed}ms):`, data.result)
          pending.resolve(data.result)
        }
        break
      }

      case 'event': {
        switch (data.event) {
          case 'connect':
            if (!isConnected) {
              log(`📡 EVENT connect — activating`)
              isConnected = true
              emit('connect', data.data)
            } else {
              log(`📡 EVENT connect — already connected, skipped`)
            }
            break
          case 'disconnect':
            if (isConnected) {
              logWarn(`📡 EVENT disconnect — deactivating`)
              isConnected = false
              currentAccounts = []
              emit('disconnect', data.data)
            } else {
              log(`📡 EVENT disconnect — already disconnected, skipped`)
            }
            break
          case 'chainChanged': {
            const newChain = data.data as string
            if (currentChainId !== newChain) {
              log(`📡 EVENT chainChanged: ${currentChainId} → ${newChain}`)
              currentChainId = newChain
              emit('chainChanged', currentChainId)
            } else {
              log(`📡 EVENT chainChanged: same chain ${newChain}, skipped`)
            }
            break
          }
          case 'accountsChanged': {
            const newAccounts = (data.data as string[]) || []
            const changed = currentAccounts.length !== newAccounts.length ||
              currentAccounts.some((a, i) => a !== newAccounts[i])
            currentAccounts = newAccounts
            if (changed) {
              log(`📡 EVENT accountsChanged:`, newAccounts)
              emit('accountsChanged', [...currentAccounts])
            } else {
              log(`📡 EVENT accountsChanged: same accounts, skipped`)
            }
            break
          }
        }
        break
      }

      case 'state_update': {
        const wasConnected = isConnected
        const prevAccounts = currentAccounts
        const prevChainId = currentChainId

        currentAccounts = data.accounts || []
        currentChainId = data.chainId || '0x1'
        isConnected = data.connected || false

        log(`📡 STATE_UPDATE: connected=${isConnected}, accounts=[${currentAccounts.join(',')}], chain=${currentChainId}`)
        log(`   prev: connected=${wasConnected}, accounts=[${prevAccounts.join(',')}], chain=${prevChainId}`)

        if (isConnected && currentAccounts.length > 0) {
          if (!wasConnected) {
            emit('connect', { chainId: currentChainId })
            // Re-announce via EIP-6963 so DApps discover the now-connected provider.
            log('🔔 Re-announcing EIP-6963 (provider connected)')
            announceProvider()
          }
          // Only emit accountsChanged when accounts actually change
          const accountsChanged = prevAccounts.length !== currentAccounts.length ||
            prevAccounts.some((a, i) => a !== currentAccounts[i])
          if (accountsChanged) {
            emit('accountsChanged', [...currentAccounts])
          } else {
            log(`   accountsChanged skipped (same accounts)`)
          }
          // Only emit chainChanged when chain actually changes
          if (prevChainId !== currentChainId) {
            emit('chainChanged', currentChainId)
          } else {
            log(`   chainChanged skipped (same chain)`)
          }
        } else if (wasConnected && !isConnected) {
          emit('disconnect', { code: 4900, message: 'Disconnected' })
        }

        // Mark state as ready so waiting requests can resolve
        markStateReady()
        // Try setting window.ethereum now that we have state
        maybeSetWindowEthereum()
        // Notify any eth_requestAccounts waiters
        stateUpdateWaiters.forEach((fn) => fn())
        break
      }
    }
  })

  // ---- EIP-6963 (announce immediately for timing) ----

  const providerInfo = Object.freeze({
    uuid: 'f81d4fae-7dec-11d0-a765-00a0c91e6bf6',
    name: 'Remote Inject Bridge',
    icon: iconDataUrl as string,
    rdns: 'com.remote-inject.bridge',
  })

  function announceProvider() {
    log('🔔 EIP-6963 announceProvider')
    window.dispatchEvent(
      new CustomEvent('eip6963:announceProvider', {
        detail: Object.freeze({ info: providerInfo, provider }),
      }),
    )
  }

  // Announce immediately at injection time — don't wait for state.
  // DApps that call eth_accounts will get [] (correct: not connected yet).
  // When state arrives, accountsChanged/connect events fire naturally.
  announceProvider()
  window.addEventListener('eip6963:requestProvider', announceProvider)

  // ---- window.ethereum (deferred, gated by flags) ----

  let skipEthereum = false      // Set by content script if on server page
  let overrideEthereum = false  // Set by content script from user setting
  let ethereumSet = false       // Track if we already set window.ethereum

  function maybeSetWindowEthereum() {
    if (ethereumSet || skipEthereum) return
    if (overrideEthereum || typeof (window as any).ethereum === 'undefined') {
      Object.defineProperty(window, 'ethereum', {
        value: provider,
        writable: true,
        configurable: true,
      })
      ethereumSet = true
      log('Set window.ethereum' + (overrideEthereum ? ' (override mode)' : ''))
    }
  }

  // Signal to content script that we're ready to receive messages.
  // Content script buffers the latest state_update and re-sends it when it sees this.
  window.postMessage({ source: SOURCE_INJECTED, type: 'ready' }, '*')
  log('🤝 Sent ready signal to content script')

  // Fallback: if state_update doesn't arrive within 500ms, try setting window.ethereum anyway
  // (e.g., extension is disconnected and has no state to send)
  setTimeout(maybeSetWindowEthereum, 500)
})
