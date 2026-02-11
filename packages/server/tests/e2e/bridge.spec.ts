import { test, expect } from '@playwright/test'

test.describe('Bridge Page', () => {
  test('should show error when session parameter is missing', async ({ page }) => {
    await page.goto('/bridge')

    // Should show 400 error
    const content = await page.content()
    expect(content).toContain('Missing session parameter')
  })

  test('should show error view for invalid session', async ({ page }) => {
    await page.goto('/bridge?session=INVALID&k=test')

    // Wait for error view to appear
    const errorView = page.locator('#errorView')
    await expect(errorView).not.toHaveClass(/hidden/, { timeout: 5000 })

    const errorTitle = page.locator('#errorTitle')
    await expect(errorTitle).toBeVisible()
  })

  // Single comprehensive test that checks all UI elements
  test('should display all UI elements with valid session', async ({ page }) => {
    // Create a session first
    const response = await page.request.post('/session', {
      data: {
        name: 'Test DApp',
        url: 'https://testdapp.com',
        icon: 'https://testdapp.com/icon.png',
      },
    })
    const session = await response.json()

    const sessionUrl = new URL(session.url)
    const secret = sessionUrl.searchParams.get('k')

    await page.goto(`/bridge?session=${session.id}&k=${secret}`)

    // Container should be visible
    await expect(page.locator('.container')).toBeVisible()

    // DApp info should be displayed
    await expect(page.locator('#dappName')).toContainText('Test DApp')
    await expect(page.locator('#dappUrl')).toContainText('testdapp.com')

    // Status area should be visible
    await expect(page.locator('.status-area')).toBeVisible()

    // Wallet info should exist but be hidden
    await expect(page.locator('#walletInfo')).toHaveClass(/hidden/)

    // Disconnect button should exist but be hidden
    await expect(page.locator('#disconnectBtn')).toHaveClass(/hidden/)

    // Hint text should be visible
    await expect(page.locator('#hint')).toBeVisible()

    // Footer should be visible
    await expect(page.locator('.brand-footer')).toBeVisible()

    // Should eventually show error (no wallet in test environment)
    const errorView = page.locator('#errorView')
    await expect(errorView).not.toHaveClass(/hidden/, { timeout: 10000 })
  })

  test('should preserve theme and lang from query parameters', async ({ page }) => {
    // Create a session first
    const response = await page.request.post('/session', {
      data: { name: 'Test App', url: 'https://test.com' },
    })
    const session = await response.json()

    const sessionUrl = new URL(session.url)
    const secret = sessionUrl.searchParams.get('k')

    // Navigate with theme=dark and lang=zh
    await page.goto(`/bridge?session=${session.id}&k=${secret}&theme=dark&lang=zh`)

    // HTML should have correct attributes
    const html = page.locator('html')
    await expect(html).toHaveAttribute('data-theme', 'dark')
    await expect(html).toHaveAttribute('lang', 'zh')
  })
})
