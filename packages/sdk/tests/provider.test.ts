import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test'
import { RemoteProvider, type DAppMetadata, type DisconnectInfo, type ReconnectInfo } from '../src/provider'

// Mock EventSource (替代原来的 MockWebSocket)
class MockEventSource {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSED = 2

  url: string
  readyState: number = MockEventSource.CONNECTING
  onopen: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onerror: ((event: Event) => void) | null = null

  constructor(url: string) {
    this.url = url
    // 模拟异步连接
    setTimeout(() => {
      this.readyState = MockEventSource.OPEN
      this.onopen?.()
    }, 10)
  }

  close() {
    this.readyState = MockEventSource.CLOSED
    // EventSource.close() 不触发 onerror
  }

  // 测试辅助：模拟收到 SSE 消息
  simulateMessage(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) })
  }

  // 测试辅助：模拟连接错误
  // permanent=true → readyState=CLOSED（服务端拒绝，停止重试）
  // permanent=false → readyState=CONNECTING（网络抖动，自动重连）
  simulateError(permanent = false) {
    this.readyState = permanent ? MockEventSource.CLOSED : MockEventSource.CONNECTING
    this.onerror?.(new Event('error'))
  }
}

// 用于追踪 fetch 调用的帮助函数
interface FetchCall {
  url: string
  method: string
  body: any
}

function createTrackingFetch(
  responses: Record<string, { ok: boolean; status: number; json?: () => unknown; statusText?: string }>
) {
  const calls: FetchCall[] = []
  const fetchFn = mock(async (url: string, options?: RequestInit) => {
    const urlObj = new URL(url)
    const urlPath = urlObj.pathname
    const body = options?.body ? JSON.parse(options.body as string) : undefined
    calls.push({ url: urlPath, method: options?.method || 'GET', body })
    const response = responses[urlPath] || { ok: true, status: 200 }
    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText || '',
      json: async () => response.json?.() || {},
      text: async () => 'OK',
    }
  }) as unknown as typeof fetch
  return { fetchFn, calls }
}

// Store original globals
let originalFetch: typeof fetch
let originalEventSource: typeof EventSource

let mockES: MockEventSource | null = null

describe('RemoteProvider', () => {
  let provider: RemoteProvider

  beforeEach(() => {
    provider = new RemoteProvider()
    mockES = null

    // Mock EventSource
    originalEventSource = globalThis.EventSource
    ;(globalThis as any).EventSource = class extends MockEventSource {
      constructor(url: string) {
        super(url)
        mockES = this
      }
    }

    // Store original fetch
    originalFetch = globalThis.fetch
  })

  afterEach(() => {
    provider.disconnect()
    globalThis.EventSource = originalEventSource
    globalThis.fetch = originalFetch
    mockES = null
  })

  describe('constructor', () => {
    it('should initialize with default values', () => {
      expect(provider.isConnected).toBe(false)
      expect(provider.accounts).toEqual([])
      expect(provider.chainId).toBe('0x1')
    })

    it('should initialize event listeners', () => {
      expect(() => provider.on('connect', () => {})).not.toThrow()
      expect(() => provider.on('disconnect', () => {})).not.toThrow()
      expect(() => provider.on('chainChanged', () => {})).not.toThrow()
      expect(() => provider.on('accountsChanged', () => {})).not.toThrow()
    })
  })

  describe('connect', () => {
    it('should create session and open SSE connection', async () => {
      const { fetchFn } = createTrackingFetch({
        '/session': {
          ok: true,
          status: 200,
          json: () => ({ id: 'ABCD', url: 'http://localhost:3000/s/ABCD?k=secret123' }),
        },
      })
      globalThis.fetch = fetchFn

      const connectPromise = provider.connect('http://localhost:3000', { name: 'Test App', url: 'http://test.com' })

      // Wait for EventSource to "open"
      await new Promise((r) => setTimeout(r, 20))
      // Simulate ready message from server
      mockES?.simulateMessage({ type: 'ready' })

      const result = await connectPromise

      expect(result.sessionId).toBe('ABCD')
      expect(result.url).toContain('/s/ABCD')
    })

    it('should throw error if session creation fails', async () => {
      const { fetchFn } = createTrackingFetch({
        '/session': {
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
        },
      })
      globalThis.fetch = fetchFn

      await expect(provider.connect('http://localhost:3000')).rejects.toThrow('Failed to create session')
    })

    it('should strip trailing slash from server URL', async () => {
      const { fetchFn } = createTrackingFetch({
        '/session': {
          ok: true,
          status: 200,
          json: () => ({ id: 'ABCD', url: 'http://localhost:3000/s/ABCD?k=secret' }),
        },
      })
      globalThis.fetch = fetchFn

      const connectPromise = provider.connect('http://localhost:3000/')

      await new Promise((r) => setTimeout(r, 20))
      mockES?.simulateMessage({ type: 'ready' })

      await connectPromise

      // SSE URL path should not have double slashes
      const urlPath = mockES?.url?.replace(/^https?:\/\/[^/]+/, '') || ''
      expect(urlPath).not.toMatch(/^\/\//)
    })

    it('should send metadata in POST body', async () => {
      const { fetchFn, calls } = createTrackingFetch({
        '/session': {
          ok: true,
          status: 200,
          json: () => ({ id: 'ABCD', url: 'http://localhost:3000/s/ABCD?k=secret' }),
        },
      })
      globalThis.fetch = fetchFn

      const metadata: DAppMetadata = {
        name: 'Test DApp',
        url: 'https://testdapp.com',
        icon: 'https://testdapp.com/icon.png',
      }

      const connectPromise = provider.connect('http://localhost:3000', metadata)

      await new Promise((r) => setTimeout(r, 20))
      mockES?.simulateMessage({ type: 'ready' })

      await connectPromise

      const sessionCall = calls.find(c => c.url === '/session' && c.method === 'POST')
      expect(sessionCall?.body?.name).toBe('Test DApp')
      expect(sessionCall?.body?.url).toBe('https://testdapp.com')
      expect(sessionCall?.body?.icon).toBe('https://testdapp.com/icon.png')
    })
  })

  describe('resumeSession', () => {
    it('should check session exists and open SSE', async () => {
      const { fetchFn } = createTrackingFetch({
        '/session/ABCD': { ok: true, status: 200, json: () => ({ id: 'ABCD' }) },
      })
      globalThis.fetch = fetchFn

      const resumePromise = provider.resumeSession({
        serverUrl: 'http://localhost:3000',
        sessionId: 'ABCD',
        sessionUrl: 'http://localhost:3000/s/ABCD?k=secret',
      })

      await new Promise((r) => setTimeout(r, 20))
      mockES?.simulateMessage({ type: 'ready' })

      await resumePromise

      expect(provider.session.id).toBe('ABCD')
    })

    it('should throw if session not found', async () => {
      const { fetchFn } = createTrackingFetch({
        '/session/ABCD': { ok: false, status: 404 },
      })
      globalThis.fetch = fetchFn

      await expect(
        provider.resumeSession({
          serverUrl: 'http://localhost:3000',
          sessionId: 'ABCD',
          sessionUrl: 'http://localhost:3000/s/ABCD?k=secret',
        })
      ).rejects.toThrow('Session not found or expired')
    })
  })

  describe('disconnect', () => {
    beforeEach(async () => {
      const { fetchFn } = createTrackingFetch({
        '/session': { ok: true, status: 200, json: () => ({ id: 'ABCD', url: 'http://localhost:3000/s/ABCD?k=secret' }) },
        '/message': { ok: true, status: 200 },
      })
      globalThis.fetch = fetchFn

      const connectPromise = provider.connect('http://localhost:3000')
      await new Promise((r) => setTimeout(r, 20))
      mockES?.simulateMessage({ type: 'ready' })
      await connectPromise

      // Simulate mobile connection
      mockES?.simulateMessage({ type: 'connect', address: '0x123', chainId: 1 })
    })

    it('should close SSE connection and reset state', () => {
      expect(provider.isConnected).toBe(true)

      provider.disconnect()

      expect(provider.isConnected).toBe(false)
      expect(provider.accounts).toEqual([])
    })

    it('should send disconnect message via POST before closing', () => {
      // Set up a fresh tracking fetch that captures disconnect call
      const { fetchFn, calls } = createTrackingFetch({
        '/message': { ok: true, status: 200 },
      })
      globalThis.fetch = fetchFn

      provider.disconnect()

      const disconnectCall = calls.find(c => c.url === '/message' && c.body?.type === 'disconnect')
      expect(disconnectCall).toBeDefined()
    })

    it('should emit disconnect event with userInitiated flag', () => {
      let disconnectInfo: DisconnectInfo | null = null
      provider.on('disconnect', (info: DisconnectInfo) => {
        disconnectInfo = info
      })

      provider.disconnect()

      // disconnect() emits synchronously in new implementation
      expect(disconnectInfo).toBeDefined()
      expect(disconnectInfo!.userInitiated).toBe(true)
    })
  })

  describe('request', () => {
    let capturedMessages: any[]

    beforeEach(async () => {
      capturedMessages = []

      // Comprehensive fetch mock that tracks /message POST calls
      globalThis.fetch = mock(async (url: string, options?: RequestInit) => {
        const urlPath = new URL(url).pathname
        if (urlPath === '/session') {
          return {
            ok: true,
            status: 200,
            json: async () => ({ id: 'ABCD', url: 'http://localhost:3000/s/ABCD?k=secret' }),
          } as any
        }
        if (urlPath === '/message') {
          const body = JSON.parse(options?.body as string)
          capturedMessages.push(body)
          return { ok: true, status: 200, text: async () => 'OK' } as any
        }
        return { ok: false, status: 404, statusText: 'Not Found' } as any
      }) as unknown as typeof fetch

      const connectPromise = provider.connect('http://localhost:3000')
      await new Promise((r) => setTimeout(r, 20))
      mockES?.simulateMessage({ type: 'ready' })
      await connectPromise

      // Simulate mobile connection
      mockES?.simulateMessage({ type: 'connect', address: '0x1234567890abcdef', chainId: 1 })
    })

    it('should return accounts for eth_accounts', async () => {
      const result = await provider.request({ method: 'eth_accounts' })
      expect(result).toEqual(['0x1234567890abcdef'])
    })

    it('should return chainId for eth_chainId', async () => {
      const result = await provider.request({ method: 'eth_chainId' })
      expect(result).toBe('0x1')
    })

    it('should return accounts for eth_requestAccounts when connected', async () => {
      const result = await provider.request({ method: 'eth_requestAccounts' })
      expect(result).toEqual(['0x1234567890abcdef'])
    })

    it('should send request via HTTP POST for personal_sign', async () => {
      const requestPromise = provider.request({
        method: 'personal_sign',
        params: ['0x48656c6c6f', '0x1234567890abcdef'],
      })

      // Wait for the POST to fire
      await new Promise((r) => setTimeout(r, 10))

      const requestMsg = capturedMessages.find(
        (m) => m.type === 'request' && m.method === 'personal_sign'
      )
      expect(requestMsg).toBeDefined()

      // Simulate response arriving via SSE
      mockES?.simulateMessage({ type: 'response', id: requestMsg!.id, result: '0xsignature123' })

      const result = await requestPromise
      expect(result).toBe('0xsignature123')
    })

    it('should reject with error from mobile', async () => {
      const requestPromise = provider.request({
        method: 'eth_sendTransaction',
        params: [{ to: '0x123', value: '0x0' }],
      })

      await new Promise((r) => setTimeout(r, 10))

      const requestMsg = capturedMessages.find((m) => m.type === 'request')
      expect(requestMsg).toBeDefined()

      mockES?.simulateMessage({
        type: 'response',
        id: requestMsg!.id,
        error: { code: 4001, message: 'User rejected' },
      })

      await expect(requestPromise).rejects.toMatchObject({
        code: 4001,
        message: 'User rejected',
      })
    })

    it('should throw if not connected', async () => {
      provider.disconnect()

      await expect(provider.request({ method: 'personal_sign', params: [] })).rejects.toMatchObject({
        code: -32000,
      })
    })
  })

  describe('event handling', () => {
    it('should emit connect event with chainId', async () => {
      const { fetchFn } = createTrackingFetch({
        '/session': { ok: true, status: 200, json: () => ({ id: 'ABCD', url: 'http://localhost:3000/s/ABCD?k=secret' }) },
      })
      globalThis.fetch = fetchFn

      const connectPromise = provider.connect('http://localhost:3000')
      await new Promise((r) => setTimeout(r, 20))
      mockES?.simulateMessage({ type: 'ready' })
      await connectPromise

      let connectInfo: { chainId: string } | null = null
      provider.on('connect', (info) => {
        connectInfo = info
      })

      mockES?.simulateMessage({ type: 'connect', address: '0x123', chainId: 137 })

      expect(connectInfo).toEqual({ chainId: '0x89' })
    })

    it('should emit accountsChanged on connect', async () => {
      const { fetchFn } = createTrackingFetch({
        '/session': { ok: true, status: 200, json: () => ({ id: 'ABCD', url: 'http://localhost:3000/s/ABCD?k=secret' }) },
      })
      globalThis.fetch = fetchFn

      const connectPromise = provider.connect('http://localhost:3000')
      await new Promise((r) => setTimeout(r, 20))
      mockES?.simulateMessage({ type: 'ready' })
      await connectPromise

      let accounts: string[] = []
      provider.on('accountsChanged', (accts) => {
        accounts = accts
      })

      mockES?.simulateMessage({ type: 'connect', address: '0xabcdef', chainId: 1 })

      expect(accounts).toEqual(['0xabcdef'])
    })

    it('should emit chainChanged event', async () => {
      const { fetchFn } = createTrackingFetch({
        '/session': { ok: true, status: 200, json: () => ({ id: 'ABCD', url: 'http://localhost:3000/s/ABCD?k=secret' }) },
      })
      globalThis.fetch = fetchFn

      const connectPromise = provider.connect('http://localhost:3000')
      await new Promise((r) => setTimeout(r, 20))
      mockES?.simulateMessage({ type: 'ready' })
      await connectPromise
      mockES?.simulateMessage({ type: 'connect', address: '0x123', chainId: 1 })

      let newChainId = ''
      provider.on('chainChanged', (chainId) => {
        newChainId = chainId
      })

      mockES?.simulateMessage({ type: 'chainChanged', chainId: 56 })

      expect(newChainId).toBe('0x38')
      expect(provider.chainId).toBe('0x38')
    })

    it('should remove listener correctly', () => {
      let callCount = 0
      const listener = () => { callCount++ }

      provider.on('chainChanged', listener)
      provider.removeListener('chainChanged', listener)

      ;(provider as any).emit('chainChanged', '0x1')

      expect(callCount).toBe(0)
    })
  })

  describe('state getters', () => {
    it('should return session info', async () => {
      const { fetchFn } = createTrackingFetch({
        '/session': { ok: true, status: 200, json: () => ({ id: 'WXYZ', url: 'http://localhost:3000/s/WXYZ?k=key123' }) },
      })
      globalThis.fetch = fetchFn

      const connectPromise = provider.connect('http://localhost:3000')
      await new Promise((r) => setTimeout(r, 20))
      mockES?.simulateMessage({ type: 'ready' })
      await connectPromise

      expect(provider.session.id).toBe('WXYZ')
      expect(provider.session.url).toContain('WXYZ')
    })

    it('should return session data for persistence', async () => {
      const { fetchFn } = createTrackingFetch({
        '/session': { ok: true, status: 200, json: () => ({ id: 'WXYZ', url: 'http://localhost:3000/s/WXYZ?k=key123' }) },
      })
      globalThis.fetch = fetchFn

      const connectPromise = provider.connect('http://localhost:3000')
      await new Promise((r) => setTimeout(r, 20))
      mockES?.simulateMessage({ type: 'ready' })
      await connectPromise

      const data = provider.getSessionData()

      expect(data.serverUrl).toBe('http://localhost:3000')
      expect(data.sessionId).toBe('WXYZ')
      expect(data.sessionUrl).toContain('WXYZ')
    })
  })

  describe('reconnection logic', () => {
    it('should not be reconnecting after user-initiated disconnect', async () => {
      const { fetchFn } = createTrackingFetch({
        '/session': { ok: true, status: 200, json: () => ({ id: 'ABCD', url: 'http://localhost:3000/s/ABCD?k=secret' }) },
        '/message': { ok: true, status: 200 },
      })
      globalThis.fetch = fetchFn

      const connectPromise = provider.connect('http://localhost:3000')
      await new Promise((r) => setTimeout(r, 20))
      mockES?.simulateMessage({ type: 'ready' })
      await connectPromise

      provider.disconnect()

      // _reconnecting should be false (eventSource is null)
      expect((provider as any)._reconnecting).toBe(false)
    })

    it('should not reconnect on permanent SSE close', async () => {
      const { fetchFn } = createTrackingFetch({
        '/session': { ok: true, status: 200, json: () => ({ id: 'ABCD', url: 'http://localhost:3000/s/ABCD?k=secret' }) },
      })
      globalThis.fetch = fetchFn

      const connectPromise = provider.connect('http://localhost:3000')
      await new Promise((r) => setTimeout(r, 20))
      mockES?.simulateMessage({ type: 'ready' })
      await connectPromise

      let disconnectInfo: DisconnectInfo | null = null
      provider.on('disconnect', (info) => {
        disconnectInfo = info
      })

      // Simulate permanent close (e.g. server rejects — readyState = CLOSED)
      mockES?.simulateError(true)

      await new Promise((r) => setTimeout(r, 10))

      expect(disconnectInfo).toBeDefined()
      expect(disconnectInfo!.userInitiated).toBe(false)
      expect((provider as any)._reconnecting).toBe(false)
    })

    it('should emit reconnecting event on transient connection loss', async () => {
      const { fetchFn } = createTrackingFetch({
        '/session': { ok: true, status: 200, json: () => ({ id: 'ABCD', url: 'http://localhost:3000/s/ABCD?k=secret' }) },
      })
      globalThis.fetch = fetchFn

      const connectPromise = provider.connect('http://localhost:3000')
      await new Promise((r) => setTimeout(r, 20))
      mockES?.simulateMessage({ type: 'ready' })
      await connectPromise

      let reconnectInfo: ReconnectInfo | null = null
      provider.on('reconnecting', (info) => {
        reconnectInfo = info
      })

      // Simulate transient drop (EventSource auto-reconnecting)
      mockES?.simulateError(false)

      await new Promise((r) => setTimeout(r, 10))

      expect(reconnectInfo).toBeDefined()
    })
  })

  describe('message handling', () => {
    beforeEach(async () => {
      const { fetchFn } = createTrackingFetch({
        '/session': { ok: true, status: 200, json: () => ({ id: 'ABCD', url: 'http://localhost:3000/s/ABCD?k=secret' }) },
      })
      globalThis.fetch = fetchFn

      const connectPromise = provider.connect('http://localhost:3000')
      await new Promise((r) => setTimeout(r, 20))
      mockES?.simulateMessage({ type: 'ready' })
      await connectPromise
    })

    it('should handle disconnect message from peer', () => {
      mockES?.simulateMessage({ type: 'connect', address: '0x123', chainId: 1 })

      let disconnectInfo: DisconnectInfo | null = null
      provider.on('disconnect', (info) => {
        disconnectInfo = info
      })

      mockES?.simulateMessage({ type: 'disconnect', reason: 'Peer closed' })

      expect(provider.isConnected).toBe(false)
      expect(disconnectInfo?.userInitiated).toBe(false)
    })

    it('should handle accountsChanged with empty accounts', () => {
      mockES?.simulateMessage({ type: 'connect', address: '0x123', chainId: 1 })

      let disconnectCalled = false
      provider.on('disconnect', () => {
        disconnectCalled = true
      })

      mockES?.simulateMessage({ type: 'accountsChanged', accounts: [] })

      expect(provider.isConnected).toBe(false)
      expect(provider.accounts).toEqual([])
      expect(disconnectCalled).toBe(true)
    })

    it('should handle malformed messages gracefully', () => {
      expect(() => {
        mockES?.onmessage?.({ data: 'not json' })
      }).not.toThrow()

      expect(() => {
        mockES?.onmessage?.({ data: '{"type": "unknown"}' })
      }).not.toThrow()
    })
  })
})

describe('RemoteProvider - Types Export', () => {
  it('should export RemoteProvider class', async () => {
    const module = await import('../src/provider')

    expect(module.RemoteProvider).toBeDefined()
    expect(typeof module.RemoteProvider).toBe('function')

    const provider = new module.RemoteProvider()
    expect(provider).toBeInstanceOf(module.RemoteProvider)
  })
})
