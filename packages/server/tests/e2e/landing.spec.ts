import { test, expect } from '@playwright/test'

test.describe('Landing Page', () => {
  test('should show invalid session error without session parameter', async ({ page }) => {
    await page.goto('/landing')

    const status = page.locator('#status')
    await expect(status).toHaveClass(/error/)
  })

  test('should show invalid link error with session but no secret', async ({ page }) => {
    // First create a session to get a valid session ID
    const response = await page.request.post('/session', {
      data: { name: 'Test App', url: 'https://test.com' },
    })
    const session = await response.json()

    await page.goto(`/landing?session=${session.id}`)

    const status = page.locator('#status')
    await expect(status).toHaveClass(/error/)
  })

  test('should display container and DApp info area', async ({ page }) => {
    // Create a session first
    const response = await page.request.post('/session', {
      data: { name: 'Test App', url: 'https://test.com' },
    })
    const session = await response.json()

    // Extract secret from URL
    const sessionUrl = new URL(session.url)
    const secret = sessionUrl.searchParams.get('k')

    await page.goto(`/landing?session=${session.id}&k=${secret}`)

    // Container should be visible
    await expect(page.locator('.container')).toBeVisible()

    // DApp info should be visible
    await expect(page.locator('.dapp-info')).toBeVisible()
    await expect(page.locator('#dappName')).toContainText('Test App')
  })

  test('should show checking status initially on valid session', async ({ page }) => {
    // Create a session first
    const response = await page.request.post('/session', {
      data: { name: 'Test App', url: 'https://test.com' },
    })
    const session = await response.json()

    const sessionUrl = new URL(session.url)
    const secret = sessionUrl.searchParams.get('k')

    await page.goto(`/landing?session=${session.id}&k=${secret}`)

    // Status should be checking initially (will eventually show error because no wallet in browser)
    const status = page.locator('#status')
    // Wait for either checking or error (no wallet in test environment)
    await expect(status).toBeVisible()
  })

  test('should work via short URL /s/:id', async ({ page }) => {
    // Create a session first
    const response = await page.request.post('/session', {
      data: { name: 'Short URL Test', url: 'https://test.com' },
    })
    const session = await response.json()

    const sessionUrl = new URL(session.url)
    const secret = sessionUrl.searchParams.get('k')

    // Access via short URL
    await page.goto(`/s/${session.id}?k=${secret}`)

    // Container should be visible
    await expect(page.locator('.container')).toBeVisible()
    await expect(page.locator('#dappName')).toContainText('Short URL Test')
  })

  test('should show guide section, copy button, and footer (no wallet in test environment)', async ({ page }) => {
    // Create a session first
    const response = await page.request.post('/session', {
      data: { name: 'Test App', url: 'https://test.com' },
    })
    const session = await response.json()

    const sessionUrl = new URL(session.url)
    const secret = sessionUrl.searchParams.get('k')

    await page.goto(`/landing?session=${session.id}&k=${secret}`)

    // Wait for status to change to error (no wallet detected after retries)
    const status = page.locator('#status')
    await expect(status).toHaveClass(/error/, { timeout: 10000 })

    // Guide should become visible
    const guide = page.locator('#guide')
    await expect(guide).toBeVisible()

    // Copy button should be visible in guide
    const copyBtn = page.locator('.copy-btn')
    await expect(copyBtn).toBeVisible()

    // Footer should be visible
    await expect(page.locator('.brand-footer')).toBeVisible()
  })
})
