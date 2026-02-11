import { test, expect } from '@playwright/test'

test.describe('Demo Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/demo')
  })

  test('should display the main container and title', async ({ page }) => {
    await expect(page.locator('h1')).toBeVisible()
    await expect(page.locator('.subtitle')).toBeVisible()
    await expect(page.locator('.container')).toBeVisible()
  })

  test('should display connection config section', async ({ page }) => {
    const configSection = page.locator('#configSection')
    await expect(configSection).toBeVisible()

    // App name input
    const appNameInput = page.locator('#appName')
    await expect(appNameInput).toBeVisible()
    await expect(appNameInput).toHaveValue('Remote Inject Demo')

    // App URL input
    const appUrlInput = page.locator('#appUrl')
    await expect(appUrlInput).toBeVisible()
  })

  test('should have connect button initially enabled', async ({ page }) => {
    const connectBtn = page.locator('#connectBtn')
    await expect(connectBtn).toBeVisible()
    await expect(connectBtn).toBeEnabled()
  })

  test('should have disconnect button initially hidden', async ({ page }) => {
    const disconnectBtn = page.locator('#disconnectBtn')
    await expect(disconnectBtn).toHaveClass(/hidden/)
  })

  test('should display status badge as disconnected initially', async ({ page }) => {
    const statusBadge = page.locator('#statusBadge')
    await expect(statusBadge).toHaveClass(/disconnected/)
  })

  test('should have test action buttons disabled initially', async ({ page }) => {
    const buttons = ['#btnAccounts', '#btnChainId', '#btnBalance', '#btnSign', '#btnSend']
    for (const selector of buttons) {
      await expect(page.locator(selector)).toBeDisabled()
    }
  })

  test('should display result output area', async ({ page }) => {
    const resultOutput = page.locator('#resultOutput')
    await expect(resultOutput).toBeVisible()
  })

  test('should have working theme toggle', async ({ page }) => {
    const themeBtn = page.locator('.fixed-btn:has(#themeIcon)')
    await expect(themeBtn).toBeVisible()

    // Get initial theme
    const initialTheme = await page.locator('html').getAttribute('data-theme')

    // Click toggle
    await themeBtn.click()

    // Theme should change
    const newTheme = await page.locator('html').getAttribute('data-theme')
    expect(newTheme).not.toBe(initialTheme)
  })

  test('should have working language selector', async ({ page }) => {
    const langSelect = page.locator('#langSelect')
    await expect(langSelect).toBeVisible()

    // Check that options exist
    const options = langSelect.locator('option')
    const count = await options.count()
    expect(count).toBeGreaterThanOrEqual(2)
  })

  test('should have wallet language toggle buttons', async ({ page }) => {
    const langGroup = page.locator('#walletLangGroup')
    await expect(langGroup).toBeVisible()

    // Check Auto button is active by default
    const autoBtn = langGroup.locator('.toggle-btn[data-value=""]')
    await expect(autoBtn).toHaveClass(/active/)
  })

  test('should have wallet theme toggle buttons', async ({ page }) => {
    const themeGroup = page.locator('#walletThemeGroup')
    await expect(themeGroup).toBeVisible()

    // Check Auto button is active by default
    const autoBtn = themeGroup.locator('.toggle-btn[data-value=""]')
    await expect(autoBtn).toHaveClass(/active/)
  })

  test('should create session when clicking connect', async ({ page }) => {
    // Click connect button
    const connectBtn = page.locator('#connectBtn')
    await connectBtn.click()

    // Connect button should become hidden
    await expect(connectBtn).toHaveClass(/hidden/)

    // Disconnect button should be visible
    const disconnectBtn = page.locator('#disconnectBtn')
    await expect(disconnectBtn).not.toHaveClass(/hidden/)

    // QR container should be visible
    const qrContainer = page.locator('#qrContainer')
    await expect(qrContainer).not.toHaveClass(/hidden/)

    // Session URL should be populated
    const sessionUrl = page.locator('#sessionUrl')
    await expect(sessionUrl).not.toBeEmpty()

    // Status should change to connecting
    const statusBadge = page.locator('#statusBadge')
    await expect(statusBadge).toHaveClass(/connecting/)
  })

  test('should disconnect when clicking disconnect button', async ({ page }) => {
    // First connect
    const connectBtn = page.locator('#connectBtn')
    await connectBtn.click()

    // Wait for QR container to show
    await expect(page.locator('#qrContainer')).not.toHaveClass(/hidden/)

    // Click disconnect
    const disconnectBtn = page.locator('#disconnectBtn')
    await disconnectBtn.click()

    // Connect button should be visible again
    await expect(connectBtn).not.toHaveClass(/hidden/)

    // Disconnect button should be hidden
    await expect(disconnectBtn).toHaveClass(/hidden/)

    // Status should be disconnected
    const statusBadge = page.locator('#statusBadge')
    await expect(statusBadge).toHaveClass(/disconnected/)
  })

  test('should be responsive on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await expect(page.locator('h1')).toBeVisible()
    await expect(page.locator('.container')).toBeVisible()
  })
})
