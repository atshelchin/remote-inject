import { test, expect } from '@playwright/test'

test.describe('API Endpoints', () => {
  test.describe('Health Check', () => {
    test('should return status ok', async ({ request }) => {
      const response = await request.get('/health')
      expect(response.ok()).toBeTruthy()

      const data = await response.json()
      expect(data.status).toBe('ok')
      expect(data).toHaveProperty('uptime')
      expect(data).toHaveProperty('sessions')
    })
  })

  test.describe('Metrics', () => {
    test('should return detailed stats', async ({ request }) => {
      const response = await request.get('/metrics')
      expect(response.ok()).toBeTruthy()

      const data = await response.json()
      expect(data).toHaveProperty('totalSessions')
      expect(data).toHaveProperty('connectedSessions')
      expect(data).toHaveProperty('uptime')
    })
  })

  test.describe('Session API', () => {
    test('should create session and get info', async ({ request }) => {
      // Create a session
      const createResponse = await request.post('/session', {
        data: {
          name: 'Test DApp',
          url: 'https://example.com',
          icon: 'https://example.com/icon.png',
        },
      })

      expect(createResponse.ok()).toBeTruthy()

      const session = await createResponse.json()
      expect(session).toHaveProperty('id')
      expect(session).toHaveProperty('url')
      expect(session).toHaveProperty('expiresAt')
      expect(session.id.length).toBe(4)
      expect(session.url).toContain(`/s/${session.id}`)
      expect(session.url).toContain('k=')

      // Get session info
      const infoResponse = await request.get(`/session/${session.id}`)
      expect(infoResponse.ok()).toBeTruthy()

      const info = await infoResponse.json()
      expect(info.id).toBe(session.id)
      expect(info).toHaveProperty('status')
      expect(info).toHaveProperty('metadata')
      expect(info).toHaveProperty('expiresAt')
    })

    test('should return 404 for non-existent session', async ({ request }) => {
      const response = await request.get('/session/ZZZZ')
      expect(response.status()).toBe(404)
    })
  })

  test.describe('Static Files', () => {
    test('should serve theme.css via page load', async ({ page }) => {
      await page.goto('/')

      // Check that theme.css link exists
      const themeLink = await page.locator('link[href*="theme.css"]').count()
      expect(themeLink).toBeGreaterThan(0)
    })

    test('should serve JS files via page load', async ({ page }) => {
      await page.goto('/')

      // Check that common.js script exists
      const jsScript = await page.locator('script[src*="common.js"]').count()
      expect(jsScript).toBeGreaterThan(0)
    })
  })

  test.describe('Custom Theme CSS', () => {
    test('should return custom theme CSS endpoint', async ({ request }) => {
      const response = await request.get('/css/custom-theme.css')
      expect(response.ok()).toBeTruthy()
      expect(response.headers()['content-type']).toContain('text/css')
    })
  })

  test.describe('Short URL', () => {
    test('should return 404 for invalid session', async ({ request }) => {
      const response = await request.get('/s/INVALID?k=test')
      expect(response.status()).toBe(404)
    })
  })
})
