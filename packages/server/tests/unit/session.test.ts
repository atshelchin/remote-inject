import { describe, it, expect, beforeEach, mock, spyOn } from 'bun:test'
import {
  createSession,
  getSession,
  deleteSession,
  verifySecret,
  isMobileLocked,
  registerConnection,
  unregisterConnection,
  terminateSession,
  getPeer,
  cleanupExpiredSessions,
  getStats,
  isAtCapacity,
  type Session,
  type DAppMetadata,
} from '../../src/session'

// Mock SSE controller (替代原来的 MockWebSocket)
function createMockSSEController() {
  return {
    enqueue: mock(() => {}),
    close: mock(() => {}),
    error: mock(() => {}),
  } as any
}

describe('Session Management', () => {
  describe('createSession', () => {
    it('should create a session with valid ID', () => {
      const session = createSession()
      expect(session.id).toBeDefined()
      expect(session.id.length).toBe(4)
    })

    it('should create a session with valid secret', () => {
      const session = createSession()
      expect(session.secret).toBeDefined()
      expect(session.secret.length).toBe(16)
    })

    it('should use correct charset (no confusing characters)', () => {
      // Create multiple sessions and check charset
      // Charset excludes 0, O, 1, I (easy to confuse)
      const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
      const confusingChars = '01OI' // Note: L is allowed in charset

      for (let i = 0; i < 20; i++) {
        const session = createSession()

        // Check ID
        for (const char of session.id) {
          expect(charset).toContain(char)
          expect(confusingChars).not.toContain(char)
        }

        // Check secret
        for (const char of session.secret) {
          expect(charset).toContain(char)
          expect(confusingChars).not.toContain(char)
        }

        // Cleanup
        deleteSession(session.id)
      }
    })

    it('should set initial status to pending', () => {
      const session = createSession()
      expect(session.status).toBe('pending')
      deleteSession(session.id)
    })

    it('should set credential expiration to ~1 year and state expiration to ~5 minutes', () => {
      const before = Date.now()
      const session = createSession()
      const after = Date.now()

      // expiresAt = credential TTL (1 year)
      const oneYear = 365 * 24 * 60 * 60 * 1000
      expect(session.expiresAt).toBeGreaterThanOrEqual(before + oneYear)
      expect(session.expiresAt).toBeLessThanOrEqual(after + oneYear)

      // stateExpiresAt = pending TTL (5 minutes)
      const fiveMin = 5 * 60 * 1000
      expect(session.stateExpiresAt).toBeGreaterThanOrEqual(before + fiveMin)
      expect(session.stateExpiresAt).toBeLessThanOrEqual(after + fiveMin)

      deleteSession(session.id)
    })

    it('should store metadata when provided', () => {
      const metadata: DAppMetadata = {
        name: 'Test DApp',
        url: 'https://example.com',
        icon: 'https://example.com/icon.png',
      }
      const session = createSession(metadata)

      expect(session.metadata).toEqual(metadata)
      deleteSession(session.id)
    })

    it('should initialize with no connections', () => {
      const session = createSession()
      expect(session.dapp).toBeNull()
      expect(session.mobile).toBeNull()
      deleteSession(session.id)
    })

    it('should initialize mobileLocked as false', () => {
      const session = createSession()
      expect(session.mobileLocked).toBe(false)
      deleteSession(session.id)
    })

    it('should initialize terminated as false', () => {
      const session = createSession()
      expect(session.terminated).toBe(false)
      deleteSession(session.id)
    })

    it('should generate unique session IDs', () => {
      const ids = new Set<string>()
      const sessions: Session[] = []

      for (let i = 0; i < 100; i++) {
        const session = createSession()
        expect(ids.has(session.id)).toBe(false)
        ids.add(session.id)
        sessions.push(session)
      }

      // Cleanup
      sessions.forEach((s) => deleteSession(s.id))
    })
  })

  describe('getSession', () => {
    it('should return session when it exists', () => {
      const created = createSession()
      const retrieved = getSession(created.id)

      expect(retrieved).toBeDefined()
      expect(retrieved?.id).toBe(created.id)
      expect(retrieved?.secret).toBe(created.secret)

      deleteSession(created.id)
    })

    it('should return undefined for non-existent session', () => {
      const retrieved = getSession('ZZZZ')
      expect(retrieved).toBeUndefined()
    })
  })

  describe('deleteSession', () => {
    it('should remove session from storage', () => {
      const session = createSession()
      const id = session.id

      expect(getSession(id)).toBeDefined()
      deleteSession(id)
      expect(getSession(id)).toBeUndefined()
    })

    it('should not throw for non-existent session', () => {
      expect(() => deleteSession('ZZZZ')).not.toThrow()
    })
  })

  describe('verifySecret', () => {
    it('should return true for valid secret', () => {
      const session = createSession()
      expect(verifySecret(session.id, session.secret)).toBe(true)
      deleteSession(session.id)
    })

    it('should return false for invalid secret', () => {
      const session = createSession()
      expect(verifySecret(session.id, 'WRONG_SECRET_1234')).toBe(false)
      deleteSession(session.id)
    })

    it('should return false for non-existent session', () => {
      expect(verifySecret('ZZZZ', 'any_secret')).toBe(false)
    })

    it('should be case sensitive', () => {
      const session = createSession()
      const lowerSecret = session.secret.toLowerCase()

      // Since charset is uppercase, lowercase should fail
      if (lowerSecret !== session.secret) {
        expect(verifySecret(session.id, lowerSecret)).toBe(false)
      }

      deleteSession(session.id)
    })
  })

  describe('isMobileLocked', () => {
    it('should return false for new session', () => {
      const session = createSession()
      expect(isMobileLocked(session.id)).toBe(false)
      deleteSession(session.id)
    })

    it('should return false for non-existent session', () => {
      expect(isMobileLocked('ZZZZ')).toBe(false)
    })

    it('should return true after mobile connects', () => {
      const session = createSession()
      const mockController = createMockSSEController()

      registerConnection(session.id, 'mobile', mockController)
      expect(isMobileLocked(session.id)).toBe(true)

      deleteSession(session.id)
    })
  })

  describe('registerConnection', () => {
    it('should register dapp connection', () => {
      const session = createSession()
      const mockController = createMockSSEController()

      const result = registerConnection(session.id, 'dapp', mockController)

      expect(result).toBeDefined()
      expect(result?.dapp).toBe(mockController)

      deleteSession(session.id)
    })

    it('should register mobile connection', () => {
      const session = createSession()
      const mockController = createMockSSEController()

      const result = registerConnection(session.id, 'mobile', mockController)

      expect(result).toBeDefined()
      expect(result?.mobile).toBe(mockController)
      expect(result?.mobileLocked).toBe(true)

      deleteSession(session.id)
    })

    it('should return null for non-existent session', () => {
      const mockController = createMockSSEController()
      const result = registerConnection('ZZZZ', 'dapp', mockController)
      expect(result).toBeNull()
    })

    it('should return null for terminated session', () => {
      const session = createSession()
      terminateSession(session.id)

      const mockController = createMockSSEController()
      const result = registerConnection(session.id, 'dapp', mockController)
      expect(result).toBeNull()
    })

    it('should reject second mobile connection when locked', () => {
      const session = createSession()
      const mockController1 = createMockSSEController()
      const mockController2 = createMockSSEController()

      // First mobile connects
      registerConnection(session.id, 'mobile', mockController1)

      // Second mobile should be rejected
      const result = registerConnection(session.id, 'mobile', mockController2)
      expect(result).toBeNull()

      deleteSession(session.id)
    })

    it('should update status to connected when both connect', () => {
      const session = createSession()
      const dappWs = createMockSSEController()
      const mobileWs = createMockSSEController()

      registerConnection(session.id, 'dapp', dappWs)
      expect(getSession(session.id)?.status).toBe('pending')

      registerConnection(session.id, 'mobile', mobileWs)
      expect(getSession(session.id)?.status).toBe('connected')

      deleteSession(session.id)
    })

    it('should extend stateExpiresAt to 7 days when both sides connected', () => {
      const session = createSession()
      const dappWs = createMockSSEController()
      const mobileWs = createMockSSEController()

      const originalStateExpiry = session.stateExpiresAt

      registerConnection(session.id, 'dapp', dappWs)
      registerConnection(session.id, 'mobile', mobileWs)

      const updatedSession = getSession(session.id)!
      // stateExpiresAt should extend to 7 days (much longer than initial 5 min)
      expect(updatedSession.stateExpiresAt).toBeGreaterThan(originalStateExpiry)
      expect(updatedSession.stateExpiresAt - Date.now()).toBeGreaterThan(6 * 24 * 60 * 60 * 1000) // At least 6 days
      // credential expiresAt should remain unchanged (still 1 year)
      expect(updatedSession.expiresAt).toBe(session.expiresAt)

      deleteSession(session.id)
    })

    it('should allow dapp reconnection', () => {
      const session = createSession()
      const dappWs1 = createMockSSEController()
      const dappWs2 = createMockSSEController()

      registerConnection(session.id, 'dapp', dappWs1)
      const result = registerConnection(session.id, 'dapp', dappWs2)

      expect(result).toBeDefined()
      expect(result?.dapp).toBe(dappWs2)

      deleteSession(session.id)
    })
  })

  describe('unregisterConnection', () => {
    it('should clear dapp connection', () => {
      const session = createSession()
      const mockController = createMockSSEController()

      registerConnection(session.id, 'dapp', mockController)
      expect(getSession(session.id)?.dapp).toBe(mockController)

      unregisterConnection(session.id, 'dapp')
      expect(getSession(session.id)?.dapp).toBeNull()

      deleteSession(session.id)
    })

    it('should clear mobile connection and unlock', () => {
      const session = createSession()
      const mockController = createMockSSEController()

      registerConnection(session.id, 'mobile', mockController)
      expect(getSession(session.id)?.mobile).toBe(mockController)
      expect(getSession(session.id)?.mobileLocked).toBe(true)

      unregisterConnection(session.id, 'mobile')
      expect(getSession(session.id)?.mobile).toBeNull()
      expect(getSession(session.id)?.mobileLocked).toBe(false)

      deleteSession(session.id)
    })

    it('should update status to disconnected', () => {
      const session = createSession()
      const dappWs = createMockSSEController()
      const mobileWs = createMockSSEController()

      registerConnection(session.id, 'dapp', dappWs)
      registerConnection(session.id, 'mobile', mobileWs)
      expect(getSession(session.id)?.status).toBe('connected')

      unregisterConnection(session.id, 'dapp')
      expect(getSession(session.id)?.status).toBe('disconnected')

      deleteSession(session.id)
    })

    it('should not throw for non-existent session', () => {
      expect(() => unregisterConnection('ZZZZ', 'dapp')).not.toThrow()
    })

    it('should allow mobile reconnection after unregister', () => {
      const session = createSession()
      const mobileWs1 = createMockSSEController()
      const mobileWs2 = createMockSSEController()

      registerConnection(session.id, 'mobile', mobileWs1)
      unregisterConnection(session.id, 'mobile')

      // Should be able to connect again
      const result = registerConnection(session.id, 'mobile', mobileWs2)
      expect(result).toBeDefined()
      expect(result?.mobile).toBe(mobileWs2)

      deleteSession(session.id)
    })
  })

  describe('terminateSession', () => {
    it('should set terminated flag', () => {
      const session = createSession()
      terminateSession(session.id)

      expect(getSession(session.id)?.terminated).toBe(true)
    })

    it('should set status to disconnected', () => {
      const session = createSession()
      terminateSession(session.id)

      expect(getSession(session.id)?.status).toBe('disconnected')
    })

    it('should close dapp connection', () => {
      const session = createSession()
      const mockController = createMockSSEController()

      registerConnection(session.id, 'dapp', mockController)
      terminateSession(session.id)

      expect(mockController.close).toHaveBeenCalled()
    })

    it('should close mobile connection', () => {
      const session = createSession()
      const mockController = createMockSSEController()

      registerConnection(session.id, 'mobile', mockController)
      terminateSession(session.id)

      expect(mockController.close).toHaveBeenCalled()
    })

    it('should not throw for non-existent session', () => {
      expect(() => terminateSession('ZZZZ')).not.toThrow()
    })

    it('should prevent new connections after termination', () => {
      const session = createSession()
      terminateSession(session.id)

      const mockController = createMockSSEController()
      const result = registerConnection(session.id, 'dapp', mockController)

      expect(result).toBeNull()
    })
  })

  describe('getPeer', () => {
    it('should return mobile when called from dapp', () => {
      const session = createSession()
      const dappWs = createMockSSEController()
      const mobileWs = createMockSSEController()

      registerConnection(session.id, 'dapp', dappWs)
      registerConnection(session.id, 'mobile', mobileWs)

      const peer = getPeer(session.id, 'dapp')
      expect(peer).toBe(mobileWs)

      deleteSession(session.id)
    })

    it('should return dapp when called from mobile', () => {
      const session = createSession()
      const dappWs = createMockSSEController()
      const mobileWs = createMockSSEController()

      registerConnection(session.id, 'dapp', dappWs)
      registerConnection(session.id, 'mobile', mobileWs)

      const peer = getPeer(session.id, 'mobile')
      expect(peer).toBe(dappWs)

      deleteSession(session.id)
    })

    it('should return null for non-existent session', () => {
      const peer = getPeer('ZZZZ', 'dapp')
      expect(peer).toBeNull()
    })

    it('should return null when peer not connected', () => {
      const session = createSession()
      const dappWs = createMockSSEController()

      registerConnection(session.id, 'dapp', dappWs)

      const peer = getPeer(session.id, 'dapp')
      expect(peer).toBeNull()

      deleteSession(session.id)
    })
  })

  describe('cleanupExpiredSessions', () => {
    it('should remove expired sessions', async () => {
      // Create a session with very short expiry
      const session = createSession()
      const id = session.id

      // Manually set expiry to past
      const storedSession = getSession(id)
      if (storedSession) {
        storedSession.expiresAt = Date.now() - 1000
      }

      cleanupExpiredSessions()

      expect(getSession(id)).toBeUndefined()
    })

    it('should keep non-expired sessions', () => {
      const session = createSession()
      const id = session.id

      cleanupExpiredSessions()

      expect(getSession(id)).toBeDefined()
      deleteSession(id)
    })

    it('should close connections on cleanup', async () => {
      const session = createSession()
      const mockController = createMockSSEController()

      registerConnection(session.id, 'dapp', mockController)

      // Manually set expiry to past
      const storedSession = getSession(session.id)
      if (storedSession) {
        storedSession.expiresAt = Date.now() - 1000
      }

      cleanupExpiredSessions()

      expect(mockController.close).toHaveBeenCalled()
    })
  })

  describe('getStats', () => {
    it('should return correct total sessions count', () => {
      const sessions: Session[] = []

      for (let i = 0; i < 5; i++) {
        sessions.push(createSession())
      }

      const stats = getStats()
      expect(stats.totalSessions).toBeGreaterThanOrEqual(5)

      // Cleanup
      sessions.forEach((s) => deleteSession(s.id))
    })

    it('should count pending sessions correctly', () => {
      const session = createSession()

      const stats = getStats()
      expect(stats.pendingSessions).toBeGreaterThanOrEqual(1)

      deleteSession(session.id)
    })

    it('should count connected sessions correctly', () => {
      const session = createSession()
      const dappWs = createMockSSEController()
      const mobileWs = createMockSSEController()

      registerConnection(session.id, 'dapp', dappWs)
      registerConnection(session.id, 'mobile', mobileWs)

      const stats = getStats()
      expect(stats.connectedSessions).toBeGreaterThanOrEqual(1)

      deleteSession(session.id)
    })

    it('should return uptime', () => {
      const stats = getStats()
      expect(stats.uptime).toBeGreaterThan(0)
    })

    it('should return maxSessions', () => {
      const stats = getStats()
      expect(stats.maxSessions).toBeGreaterThan(0)
    })
  })

  describe('isAtCapacity', () => {
    it('should return false when under limit', () => {
      // Assuming MAX_SESSIONS is at least 10000
      expect(isAtCapacity()).toBe(false)
    })
  })
})
