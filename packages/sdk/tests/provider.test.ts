import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test'
import { RemoteProvider, type DAppMetadata, type DisconnectInfo, type ReconnectInfo } from '../src/provider'

// Mock WebSocket
class MockWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3

  url: string
  readyState: number = MockWebSocket.CONNECTING
  onopen: ((event: Event) => void) | null = null
  onclose: ((event: CloseEvent) => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null

  sentMessages: string[] = []

  constructor(url: string) {
    this.url = url
    // Simulate async connection
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN
      this.onopen?.(new Event('open'))
    }, 10)
  }

  send(data: string) {
    this.sentMessages.push(data)
  }

  close(code?: number, reason?: string) {
    this.readyState = MockWebSocket.CLOSED
    this.onclose?.({ code: code || 1000, reason: reason || '' } as CloseEvent)
  }

  // Test helpers
  simulateMessage(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent)
  }

  simulateError() {
    this.onerror?.(new Event('error'))
  }
}

// Store original globals
let originalFetch: typeof fetch
let originalWebSocket: typeof WebSocket

// Mock fetch
function createMockFetch(responses: Record<string, { ok: boolean; status: number; json?: () => unknown; statusText?: string }>) {
  return mock(async (url: string, options?: RequestInit) => {
    const urlPath = new URL(url).pathname
    const response = responses[urlPath] || { ok: false, status: 404, statusText: 'Not Found' }
    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText || '',
      json: async () => response.json?.() || {},
    }
  }) as unknown as typeof fetch
}

describe('RemoteProvider', () => {
  let provider: RemoteProvider
  let mockWs: MockWebSocket | null = null

  beforeEach(() => {
    provider = new RemoteProvider()

    // Mock WebSocket
    originalWebSocket = globalThis.WebSocket
    ;(globalThis as any).WebSocket = class extends MockWebSocket {
      constructor(url: string) {
        super(url)
        mockWs = this
      }
    }

    // Mock fetch
    originalFetch = globalThis.fetch
  })

  afterEach(() => {
    provider.disconnect()
    globalThis.WebSocket = originalWebSocket
    globalThis.fetch = originalFetch
    mockWs = null
  })

  describe('constructor', () => {
    it('should initialize with default values', () => {
      expect(provider.isConnected).toBe(false)
      expect(provider.accounts).toEqual([])
      expect(provider.chainId).toBe('0x1')
    })

    it('should initialize event listeners', () => {
      // Should not throw when adding listeners
      expect(() => provider.on('connect', () => {})).not.toThrow()
      expect(() => provider.on('disconnect', () => {})).not.toThrow()
      expect(() => provider.on('chainChanged', () => {})).not.toThrow()
      expect(() => provider.on('accountsChanged', () => {})).not.toThrow()
    })
  })

  describe('connect', () => {
    it('should create session and connect WebSocket', async () => {
      globalThis.fetch = createMockFetch({
        '/session': {
          ok: true,
          status: 200,
          json: () => ({ id: 'ABCD', url: 'http://localhost:3000/s/ABCD?k=secret123' }),
        },
      })

      const connectPromise = provider.connect('http://localhost:3000', { name: 'Test App', url: 'http://test.com' })

      // Wait for WebSocket to connect
      await new Promise((r) => setTimeout(r, 20))

      // Simulate ready message
      mockWs?.simulateMessage({ type: 'ready' })

      const result = await connectPromise

      expect(result.sessionId).toBe('ABCD')
      expect(result.url).toContain('/s/ABCD')
    })

    it('should throw error if session creation fails', async () => {
      globalThis.fetch = createMockFetch({
        '/session': {
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
        },
      })

      await expect(provider.connect('http://localhost:3000')).rejects.toThrow('Failed to create session')
    })

    it('should strip trailing slash from server URL', async () => {
      globalThis.fetch = createMockFetch({
        '/session': {
          ok: true,
          status: 200,
          json: () => ({ id: 'ABCD', url: 'http://localhost:3000/s/ABCD?k=secret' }),
        },
      })

      const connectPromise = provider.connect('http://localhost:3000/')

      await new Promise((r) => setTimeout(r, 20))
      mockWs?.simulateMessage({ type: 'ready' })

      await connectPromise

      // WebSocket URL path should not have double slashes (ignore protocol ://)
      // Check that path portion doesn't start with //
      const urlPath = mockWs?.url?.replace(/^wss?:\/\/[^/]+/, '') || ''
      expect(urlPath).not.toMatch(/^\/\//)
    })

    it('should send metadata in POST body', async () => {
      let capturedBody: string | undefined

      globalThis.fetch = mock(async (url: string, options?: RequestInit) => {
        capturedBody = options?.body as string
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: 'ABCD', url: 'http://localhost:3000/s/ABCD?k=secret' }),
        }
      }) as unknown as typeof fetch

      const metadata: DAppMetadata = {
        name: 'Test DApp',
        url: 'https://testdapp.com',
        icon: 'https://testdapp.com/icon.png',
      }

      const connectPromise = provider.connect('http://localhost:3000', metadata)

      await new Promise((r) => setTimeout(r, 20))
      mockWs?.simulateMessage({ type: 'ready' })

      await connectPromise

      expect(capturedBody).toBeDefined()
      const parsed = JSON.parse(capturedBody!)
      expect(parsed.name).toBe('Test DApp')
      expect(parsed.url).toBe('https://testdapp.com')
      expect(parsed.icon).toBe('https://testdapp.com/icon.png')
    })
  })

  describe('resumeSession', () => {
    it('should check session exists and connect', async () => {
      globalThis.fetch = createMockFetch({
        '/session/ABCD': { ok: true, status: 200, json: () => ({ id: 'ABCD' }) },
      })

      const resumePromise = provider.resumeSession({
        serverUrl: 'http://localhost:3000',
        sessionId: 'ABCD',
        sessionUrl: 'http://localhost:3000/s/ABCD?k=secret',
      })

      await new Promise((r) => setTimeout(r, 20))
      mockWs?.simulateMessage({ type: 'ready' })

      await resumePromise

      expect(provider.session.id).toBe('ABCD')
    })

    it('should throw if session not found', async () => {
      globalThis.fetch = createMockFetch({
        '/session/ABCD': { ok: false, status: 404 },
      })

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
    it('should close WebSocket and reset state', async () => {
      globalThis.fetch = createMockFetch({
        '/session': { ok: true, status: 200, json: () => ({ id: 'ABCD', url: 'http://localhost:3000/s/ABCD?k=secret' }) },
      })

      const connectPromise = provider.connect('http://localhost:3000')
      await new Promise((r) => setTimeout(r, 20))
      mockWs?.simulateMessage({ type: 'ready' })
      await connectPromise

      // Simulate mobile connection
      mockWs?.simulateMessage({ type: 'connect', address: '0x123', chainId: 1 })

      expect(provider.isConnected).toBe(true)

      provider.disconnect()

      expect(provider.isConnected).toBe(false)
      expect(provider.accounts).toEqual([])
    })

    it('should send disconnect message before closing', async () => {
      globalThis.fetch = createMockFetch({
        '/session': { ok: true, status: 200, json: () => ({ id: 'ABCD', url: 'http://localhost:3000/s/ABCD?k=secret' }) },
      })

      const connectPromise = provider.connect('http://localhost:3000')
      await new Promise((r) => setTimeout(r, 20))
      mockWs?.simulateMessage({ type: 'ready' })
      await connectPromise

      provider.disconnect()

      const lastMessage = mockWs?.sentMessages[mockWs.sentMessages.length - 1]
      expect(lastMessage).toBeDefined()
      const parsed = JSON.parse(lastMessage!)
      expect(parsed.type).toBe('disconnect')
    })

    it('should emit disconnect event with userInitiated flag', async () => {
      globalThis.fetch = createMockFetch({
        '/session': { ok: true, status: 200, json: () => ({ id: 'ABCD', url: 'http://localhost:3000/s/ABCD?k=secret' }) },
      })

      const connectPromise = provider.connect('http://localhost:3000')
      await new Promise((r) => setTimeout(r, 20))
      mockWs?.simulateMessage({ type: 'ready' })
      await connectPromise

      let disconnectInfo: DisconnectInfo | null = null
      provider.on('disconnect', (info: DisconnectInfo) => {
        disconnectInfo = info
      })

      provider.disconnect()

      // Wait for async event
      await new Promise((r) => setTimeout(r, 10))

      expect(disconnectInfo).toBeDefined()
      expect(disconnectInfo!.userInitiated).toBe(true)
    })
  })

  describe('request', () => {
    beforeEach(async () => {
      globalThis.fetch = createMockFetch({
        '/session': { ok: true, status: 200, json: () => ({ id: 'ABCD', url: 'http://localhost:3000/s/ABCD?k=secret' }) },
      })

      const connectPromise = provider.connect('http://localhost:3000')
      await new Promise((r) => setTimeout(r, 20))
      mockWs?.simulateMessage({ type: 'ready' })
      await connectPromise

      // Simulate mobile connection
      mockWs?.simulateMessage({ type: 'connect', address: '0x1234567890abcdef', chainId: 1 })
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

    it('should send request via WebSocket for personal_sign', async () => {
      const requestPromise = provider.request({
        method: 'personal_sign',
        params: ['0x48656c6c6f', '0x1234567890abcdef'],
      })

      // Wait for request to be sent
      await new Promise((r) => setTimeout(r, 10))

      // Find the request message
      const requestMsg = mockWs?.sentMessages.find((m) => {
        const parsed = JSON.parse(m)
        return parsed.type === 'request' && parsed.method === 'personal_sign'
      })

      expect(requestMsg).toBeDefined()

      // Simulate response
      const parsed = JSON.parse(requestMsg!)
      mockWs?.simulateMessage({ type: 'response', id: parsed.id, result: '0xsignature123' })

      const result = await requestPromise
      expect(result).toBe('0xsignature123')
    })

    it('should reject with error from mobile', async () => {
      const requestPromise = provider.request({
        method: 'eth_sendTransaction',
        params: [{ to: '0x123', value: '0x0' }],
      })

      await new Promise((r) => setTimeout(r, 10))

      const requestMsg = mockWs?.sentMessages.find((m) => {
        const parsed = JSON.parse(m)
        return parsed.type === 'request'
      })

      const parsed = JSON.parse(requestMsg!)
      mockWs?.simulateMessage({
        type: 'response',
        id: parsed.id,
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
        message: 'Not connected',
      })
    })
  })

  describe('event handling', () => {
    it('should emit connect event with chainId', async () => {
      globalThis.fetch = createMockFetch({
        '/session': { ok: true, status: 200, json: () => ({ id: 'ABCD', url: 'http://localhost:3000/s/ABCD?k=secret' }) },
      })

      const connectPromise = provider.connect('http://localhost:3000')
      await new Promise((r) => setTimeout(r, 20))
      mockWs?.simulateMessage({ type: 'ready' })
      await connectPromise

      let connectInfo: { chainId: string } | null = null
      provider.on('connect', (info) => {
        connectInfo = info
      })

      mockWs?.simulateMessage({ type: 'connect', address: '0x123', chainId: 137 })

      expect(connectInfo).toEqual({ chainId: '0x89' })
    })

    it('should emit accountsChanged on connect', async () => {
      globalThis.fetch = createMockFetch({
        '/session': { ok: true, status: 200, json: () => ({ id: 'ABCD', url: 'http://localhost:3000/s/ABCD?k=secret' }) },
      })

      const connectPromise = provider.connect('http://localhost:3000')
      await new Promise((r) => setTimeout(r, 20))
      mockWs?.simulateMessage({ type: 'ready' })
      await connectPromise

      let accounts: string[] = []
      provider.on('accountsChanged', (accts) => {
        accounts = accts
      })

      mockWs?.simulateMessage({ type: 'connect', address: '0xabcdef', chainId: 1 })

      expect(accounts).toEqual(['0xabcdef'])
    })

    it('should emit chainChanged event', async () => {
      globalThis.fetch = createMockFetch({
        '/session': { ok: true, status: 200, json: () => ({ id: 'ABCD', url: 'http://localhost:3000/s/ABCD?k=secret' }) },
      })

      const connectPromise = provider.connect('http://localhost:3000')
      await new Promise((r) => setTimeout(r, 20))
      mockWs?.simulateMessage({ type: 'ready' })
      await connectPromise
      mockWs?.simulateMessage({ type: 'connect', address: '0x123', chainId: 1 })

      let newChainId = ''
      provider.on('chainChanged', (chainId) => {
        newChainId = chainId
      })

      mockWs?.simulateMessage({ type: 'chainChanged', chainId: 56 })

      expect(newChainId).toBe('0x38')
      expect(provider.chainId).toBe('0x38')
    })

    it('should remove listener correctly', async () => {
      let callCount = 0
      const listener = () => {
        callCount++
      }

      provider.on('chainChanged', listener)
      provider.removeListener('chainChanged', listener)

      // Manually trigger event (simulate message won't work without connection)
      // This tests the event system directly
      ;(provider as any).emit('chainChanged', '0x1')

      expect(callCount).toBe(0)
    })
  })

  describe('state getters', () => {
    it('should return session info', async () => {
      globalThis.fetch = createMockFetch({
        '/session': { ok: true, status: 200, json: () => ({ id: 'WXYZ', url: 'http://localhost:3000/s/WXYZ?k=key123' }) },
      })

      const connectPromise = provider.connect('http://localhost:3000')
      await new Promise((r) => setTimeout(r, 20))
      mockWs?.simulateMessage({ type: 'ready' })
      await connectPromise

      expect(provider.session.id).toBe('WXYZ')
      expect(provider.session.url).toContain('WXYZ')
    })

    it('should return session data for persistence', async () => {
      globalThis.fetch = createMockFetch({
        '/session': { ok: true, status: 200, json: () => ({ id: 'WXYZ', url: 'http://localhost:3000/s/WXYZ?k=key123' }) },
      })

      const connectPromise = provider.connect('http://localhost:3000')
      await new Promise((r) => setTimeout(r, 20))
      mockWs?.simulateMessage({ type: 'ready' })
      await connectPromise

      const data = provider.getSessionData()

      expect(data.serverUrl).toBe('http://localhost:3000')
      expect(data.sessionId).toBe('WXYZ')
      expect(data.sessionUrl).toContain('WXYZ')
    })
  })

  describe('reconnection logic', () => {
    it('should not reconnect on user-initiated disconnect', async () => {
      globalThis.fetch = createMockFetch({
        '/session': { ok: true, status: 200, json: () => ({ id: 'ABCD', url: 'http://localhost:3000/s/ABCD?k=secret' }) },
      })

      const connectPromise = provider.connect('http://localhost:3000')
      await new Promise((r) => setTimeout(r, 20))
      mockWs?.simulateMessage({ type: 'ready' })
      await connectPromise

      provider.disconnect()

      // _reconnecting should be false
      expect((provider as any)._reconnecting).toBe(false)
    })

    it('should not reconnect on session rejected (code 1008)', async () => {
      globalThis.fetch = createMockFetch({
        '/session': { ok: true, status: 200, json: () => ({ id: 'ABCD', url: 'http://localhost:3000/s/ABCD?k=secret' }) },
      })

      const connectPromise = provider.connect('http://localhost:3000')
      await new Promise((r) => setTimeout(r, 20))
      mockWs?.simulateMessage({ type: 'ready' })
      await connectPromise

      let disconnectInfo: DisconnectInfo | null = null
      provider.on('disconnect', (info) => {
        disconnectInfo = info
      })

      // Simulate server closing connection with 1008 (policy violation)
      mockWs?.close(1008, 'Session rejected')

      await new Promise((r) => setTimeout(r, 10))

      expect(disconnectInfo?.code).toBe(1008)
      expect((provider as any)._reconnecting).toBe(false)
    })

    it('should emit reconnecting event on connection loss', async () => {
      globalThis.fetch = createMockFetch({
        '/session': { ok: true, status: 200, json: () => ({ id: 'ABCD', url: 'http://localhost:3000/s/ABCD?k=secret' }) },
      })

      const connectPromise = provider.connect('http://localhost:3000')
      await new Promise((r) => setTimeout(r, 20))
      mockWs?.simulateMessage({ type: 'ready' })
      await connectPromise

      let reconnectInfo: ReconnectInfo | null = null
      provider.on('reconnecting', (info) => {
        reconnectInfo = info
      })

      // Simulate connection lost (not user-initiated, not rejected)
      mockWs?.close(1006, 'Connection lost')

      await new Promise((r) => setTimeout(r, 10))

      expect(reconnectInfo).toBeDefined()
      expect(reconnectInfo!.attempt).toBe(1)
      expect(reconnectInfo!.maxAttempts).toBe(5)
    })
  })

  describe('message handling', () => {
    beforeEach(async () => {
      globalThis.fetch = createMockFetch({
        '/session': { ok: true, status: 200, json: () => ({ id: 'ABCD', url: 'http://localhost:3000/s/ABCD?k=secret' }) },
      })

      const connectPromise = provider.connect('http://localhost:3000')
      await new Promise((r) => setTimeout(r, 20))
      mockWs?.simulateMessage({ type: 'ready' })
      await connectPromise
    })

    it('should handle disconnect message from peer', () => {
      mockWs?.simulateMessage({ type: 'connect', address: '0x123', chainId: 1 })

      let disconnectInfo: DisconnectInfo | null = null
      provider.on('disconnect', (info) => {
        disconnectInfo = info
      })

      mockWs?.simulateMessage({ type: 'disconnect', reason: 'Peer closed' })

      expect(provider.isConnected).toBe(false)
      expect(disconnectInfo?.userInitiated).toBe(false)
    })

    it('should handle accountsChanged with empty accounts', () => {
      mockWs?.simulateMessage({ type: 'connect', address: '0x123', chainId: 1 })

      let disconnectCalled = false
      provider.on('disconnect', () => {
        disconnectCalled = true
      })

      mockWs?.simulateMessage({ type: 'accountsChanged', accounts: [] })

      expect(provider.isConnected).toBe(false)
      expect(provider.accounts).toEqual([])
      expect(disconnectCalled).toBe(true)
    })

    it('should handle malformed messages gracefully', () => {
      // Should not throw
      expect(() => {
        mockWs?.onmessage?.({ data: 'not json' } as MessageEvent)
      }).not.toThrow()

      expect(() => {
        mockWs?.onmessage?.({ data: '{"type": "unknown"}' } as MessageEvent)
      }).not.toThrow()
    })
  })
})

describe('RemoteProvider - Types Export', () => {
  it('should export RemoteProvider class', async () => {
    const module = await import('../src/provider')

    expect(module.RemoteProvider).toBeDefined()
    expect(typeof module.RemoteProvider).toBe('function')

    // Type checking at runtime
    const provider = new module.RemoteProvider()
    expect(provider).toBeInstanceOf(module.RemoteProvider)
  })
})
