import { test, expect } from '@playwright/test'

test.describe('Index Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('should display the main hero section', async ({ page }) => {
    await expect(page.locator('.hero h1')).toContainText('Remote Inject')
    await expect(page.locator('.hero-badge')).toBeVisible()
    await expect(page.locator('.hero-desc')).toBeVisible()
  })

  test('should have working navigation buttons', async ({ page }) => {
    const demoLink = page.locator('a.btn-primary[href="/demo"]')
    await expect(demoLink).toBeVisible()

    const githubLink = page.locator('a.btn-ghost[href*="github.com"]')
    await expect(githubLink).toBeVisible()
  })

  test('should display feature cards', async ({ page }) => {
    const features = page.locator('.feature')
    await expect(features).toHaveCount(4)
  })

  test('should display the flow diagram', async ({ page }) => {
    const flowBoxes = page.locator('.flow-box')
    await expect(flowBoxes).toHaveCount(3)
  })

  test('should have working theme toggle', async ({ page }) => {
    const themeBtn = page.locator('#themeBtn')
    await expect(themeBtn).toBeVisible()

    // Get initial theme
    const initialTheme = await page.locator('html').getAttribute('data-theme')

    // Click toggle
    await themeBtn.click()

    // Theme should change
    const newTheme = await page.locator('html').getAttribute('data-theme')
    expect(newTheme).not.toBe(initialTheme)

    // Toggle back
    await themeBtn.click()
    const restoredTheme = await page.locator('html').getAttribute('data-theme')
    expect(restoredTheme).toBe(initialTheme)
  })

  test('should have working language selector', async ({ page }) => {
    const langSelect = page.locator('#langSelect')
    await expect(langSelect).toBeVisible()

    // Check that options exist
    const options = langSelect.locator('option')
    const count = await options.count()
    expect(count).toBeGreaterThanOrEqual(2)
  })

  test('should display code blocks with copy buttons', async ({ page }) => {
    const codeBlocks = page.locator('.code-block')
    await expect(codeBlocks.first()).toBeVisible()

    const copyButtons = page.locator('.code-copy')
    const count = await copyButtons.count()
    expect(count).toBeGreaterThan(0)
  })

  test('should display install command section', async ({ page }) => {
    const installCmd = page.locator('.install-cmd')
    await expect(installCmd).toBeVisible()
    await expect(installCmd.locator('code')).toContainText('npm i @shelchin/remote-inject-sdk')
  })

  test('should have footer with link', async ({ page }) => {
    const footer = page.locator('.footer')
    await expect(footer).toBeVisible()
    await expect(footer.locator('a')).toBeVisible()
  })

  test('should be responsive on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await expect(page.locator('.hero h1')).toBeVisible()
    await expect(page.locator('.hero')).toBeVisible()
  })
})
