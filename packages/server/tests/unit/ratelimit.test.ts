import { describe, it, expect, beforeEach } from 'bun:test'
import { RateLimiter, getClientIP, sessionRateLimiter } from '../../src/ratelimit'

describe('RateLimiter', () => {
  describe('check', () => {
    it('should allow first request', () => {
      const limiter = new RateLimiter({ windowMs: 60000, maxRequests: 5 })
      expect(limiter.check('test-key')).toBe(true)
    })

    it('should allow requests up to max count', () => {
      const limiter = new RateLimiter({ windowMs: 60000, maxRequests: 5 })
      const key = 'test-key-' + Date.now()

      for (let i = 0; i < 5; i++) {
        expect(limiter.check(key)).toBe(true)
      }
    })

    it('should reject request exceeding limit', () => {
      const limiter = new RateLimiter({ windowMs: 60000, maxRequests: 3 })
      const key = 'test-key-' + Date.now()

      // Use up the limit
      expect(limiter.check(key)).toBe(true)
      expect(limiter.check(key)).toBe(true)
      expect(limiter.check(key)).toBe(true)

      // Should be rejected
      expect(limiter.check(key)).toBe(false)
      expect(limiter.check(key)).toBe(false)
    })

    it('should track different keys independently', () => {
      const limiter = new RateLimiter({ windowMs: 60000, maxRequests: 2 })
      const key1 = 'key1-' + Date.now()
      const key2 = 'key2-' + Date.now()

      // Use up key1's limit
      expect(limiter.check(key1)).toBe(true)
      expect(limiter.check(key1)).toBe(true)
      expect(limiter.check(key1)).toBe(false)

      // key2 should still have quota
      expect(limiter.check(key2)).toBe(true)
      expect(limiter.check(key2)).toBe(true)
      expect(limiter.check(key2)).toBe(false)
    })

    it('should reset after window expires', async () => {
      const limiter = new RateLimiter({ windowMs: 100, maxRequests: 2 }) // 100ms window
      const key = 'test-key-' + Date.now()

      // Use up the limit
      expect(limiter.check(key)).toBe(true)
      expect(limiter.check(key)).toBe(true)
      expect(limiter.check(key)).toBe(false)

      // Wait for window to expire
      await new Promise((resolve) => setTimeout(resolve, 150))

      // Should be allowed again
      expect(limiter.check(key)).toBe(true)
    })
  })

  describe('getInfo', () => {
    it('should return max quota for new key', () => {
      const limiter = new RateLimiter({ windowMs: 60000, maxRequests: 10 })
      const key = 'new-key-' + Date.now()

      const info = limiter.getInfo(key)
      expect(info.remaining).toBe(10)
    })

    it('should return correct remaining count', () => {
      const limiter = new RateLimiter({ windowMs: 60000, maxRequests: 5 })
      const key = 'test-key-' + Date.now()

      limiter.check(key)
      limiter.check(key)

      const info = limiter.getInfo(key)
      expect(info.remaining).toBe(3)
    })

    it('should return 0 when limit exhausted', () => {
      const limiter = new RateLimiter({ windowMs: 60000, maxRequests: 2 })
      const key = 'test-key-' + Date.now()

      limiter.check(key)
      limiter.check(key)
      limiter.check(key) // This one is rejected

      const info = limiter.getInfo(key)
      expect(info.remaining).toBe(0)
    })

    it('should return reset timestamp', () => {
      const limiter = new RateLimiter({ windowMs: 60000, maxRequests: 5 })
      const key = 'test-key-' + Date.now()

      const before = Date.now()
      limiter.check(key)
      const after = Date.now()

      const info = limiter.getInfo(key)

      expect(info.resetAt).toBeGreaterThanOrEqual(before + 60000)
      expect(info.resetAt).toBeLessThanOrEqual(after + 60000)
    })

    it('should return future reset time for fresh window', () => {
      const limiter = new RateLimiter({ windowMs: 60000, maxRequests: 5 })
      const key = 'new-key-' + Date.now()

      const now = Date.now()
      const info = limiter.getInfo(key)

      expect(info.resetAt).toBeGreaterThanOrEqual(now + 60000 - 100)
    })

    it('should reset quota after window expires', async () => {
      const limiter = new RateLimiter({ windowMs: 100, maxRequests: 3 }) // 100ms window
      const key = 'test-key-' + Date.now()

      // Use up the limit
      limiter.check(key)
      limiter.check(key)
      limiter.check(key)

      let info = limiter.getInfo(key)
      expect(info.remaining).toBe(0)

      // Wait for window to expire
      await new Promise((resolve) => setTimeout(resolve, 150))

      info = limiter.getInfo(key)
      expect(info.remaining).toBe(3)
    })
  })

  describe('edge cases', () => {
    it('should handle rapid requests', () => {
      const limiter = new RateLimiter({ windowMs: 60000, maxRequests: 100 })
      const key = 'rapid-' + Date.now()

      let allowed = 0
      for (let i = 0; i < 150; i++) {
        if (limiter.check(key)) {
          allowed++
        }
      }

      expect(allowed).toBe(100)
    })

    it('should handle empty key', () => {
      const limiter = new RateLimiter({ windowMs: 60000, maxRequests: 5 })
      expect(limiter.check('')).toBe(true)
      expect(limiter.getInfo('').remaining).toBe(4)
    })

    it('should handle special characters in key', () => {
      const limiter = new RateLimiter({ windowMs: 60000, maxRequests: 5 })
      const key = '192.168.1.1:test@example.com'

      expect(limiter.check(key)).toBe(true)
      expect(limiter.getInfo(key).remaining).toBe(4)
    })
  })
})

describe('getClientIP', () => {
  function createMockRequest(headers: Record<string, string>): Request {
    return {
      headers: {
        get: (name: string) => headers[name.toLowerCase()] || null,
      },
    } as any
  }

  it('should extract IP from X-Forwarded-For header', () => {
    const request = createMockRequest({
      'x-forwarded-for': '192.168.1.1',
    })

    expect(getClientIP(request)).toBe('192.168.1.1')
  })

  it('should extract first IP from X-Forwarded-For with multiple IPs', () => {
    const request = createMockRequest({
      'x-forwarded-for': '192.168.1.1, 10.0.0.1, 172.16.0.1',
    })

    expect(getClientIP(request)).toBe('192.168.1.1')
  })

  it('should trim whitespace from IP', () => {
    const request = createMockRequest({
      'x-forwarded-for': '  192.168.1.1  , 10.0.0.1',
    })

    expect(getClientIP(request)).toBe('192.168.1.1')
  })

  it('should use X-Real-IP as fallback', () => {
    const request = createMockRequest({
      'x-real-ip': '192.168.1.100',
    })

    expect(getClientIP(request)).toBe('192.168.1.100')
  })

  it('should prefer X-Forwarded-For over X-Real-IP', () => {
    const request = createMockRequest({
      'x-forwarded-for': '192.168.1.1',
      'x-real-ip': '192.168.1.100',
    })

    expect(getClientIP(request)).toBe('192.168.1.1')
  })

  it('should return unknown when no headers present', () => {
    const request = createMockRequest({})
    expect(getClientIP(request)).toBe('unknown')
  })

  it('should handle IPv6 addresses', () => {
    const request = createMockRequest({
      'x-forwarded-for': '2001:db8::1',
    })

    expect(getClientIP(request)).toBe('2001:db8::1')
  })

  it('should handle IPv6 with port notation', () => {
    const request = createMockRequest({
      'x-forwarded-for': '::ffff:192.168.1.1',
    })

    expect(getClientIP(request)).toBe('::ffff:192.168.1.1')
  })
})

describe('sessionRateLimiter', () => {
  it('should be configured for 10 requests per minute', () => {
    const key = 'session-test-' + Date.now()

    // Should allow 10 requests
    for (let i = 0; i < 10; i++) {
      expect(sessionRateLimiter.check(key)).toBe(true)
    }

    // 11th should be rejected
    expect(sessionRateLimiter.check(key)).toBe(false)
  })

  it('should have 60 second window', () => {
    const key = 'window-test-' + Date.now()

    sessionRateLimiter.check(key)
    const info = sessionRateLimiter.getInfo(key)

    // Reset should be approximately 60 seconds in the future
    const resetIn = info.resetAt - Date.now()
    expect(resetIn).toBeLessThanOrEqual(60000)
    expect(resetIn).toBeGreaterThan(59000)
  })
})
