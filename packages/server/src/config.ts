/**
 * External configuration loader
 * Loads custom i18n translations and themes from CONFIG_DIR
 */

import { readdir, readFile } from 'fs/promises'
import { join, basename } from 'path'

// Default config directory (relative to working directory or executable)
const CONFIG_DIR = process.env.CONFIG_DIR || './config'

// External translations loaded from CONFIG_DIR/i18n/*.json
let externalTranslations: Record<string, Record<string, string>> = {}

// Custom theme CSS loaded from CONFIG_DIR/themes/custom.css
let customThemeCSS: string | null = null

// Config load status
let configLoaded = false

/**
 * Load all external configuration files
 * Call this once at startup
 */
export async function loadExternalConfig(): Promise<void> {
  if (configLoaded) return

  console.log(`[Config] Loading external config from: ${CONFIG_DIR}`)

  await Promise.all([
    loadExternalTranslations(),
    loadCustomTheme(),
  ])

  configLoaded = true
}

/**
 * Load external translation files from CONFIG_DIR/i18n/
 * Each file should be named {locale}.json (e.g., zh.json, en.json)
 */
async function loadExternalTranslations(): Promise<void> {
  const i18nDir = join(CONFIG_DIR, 'i18n')

  try {
    const files = await readdir(i18nDir)
    const jsonFiles = files.filter(f => f.endsWith('.json'))

    for (const file of jsonFiles) {
      const locale = basename(file, '.json')
      const filePath = join(i18nDir, file)

      try {
        const content = await readFile(filePath, 'utf-8')
        const translations = JSON.parse(content)

        if (typeof translations === 'object' && translations !== null) {
          externalTranslations[locale] = translations
          console.log(`[Config] Loaded i18n: ${locale} (${Object.keys(translations).length} keys)`)
        }
      } catch (e) {
        console.error(`[Config] Failed to load i18n file ${file}:`, e)
      }
    }
  } catch {
    // i18n directory doesn't exist, that's fine
    console.log('[Config] No external i18n directory found')
  }
}

/**
 * Load custom theme CSS from CONFIG_DIR/themes/custom.css
 */
async function loadCustomTheme(): Promise<void> {
  const themePath = join(CONFIG_DIR, 'themes', 'custom.css')

  try {
    customThemeCSS = await readFile(themePath, 'utf-8')
    console.log(`[Config] Loaded custom theme (${customThemeCSS.length} bytes)`)
  } catch {
    // No custom theme, that's fine
    console.log('[Config] No custom theme found')
  }
}

/**
 * Get external translations for a locale
 * Returns empty object if no external translations exist
 */
export function getExternalTranslations(locale: string): Record<string, string> {
  return externalTranslations[locale] || {}
}

/**
 * Get all external translation locales
 */
export function getExternalLocales(): string[] {
  return Object.keys(externalTranslations)
}

/**
 * Check if a locale has external translations
 */
export function hasExternalTranslations(locale: string): boolean {
  return locale in externalTranslations
}

/**
 * Get custom theme CSS
 * Returns null if no custom theme is configured
 */
export function getCustomThemeCSS(): string | null {
  return customThemeCSS
}

/**
 * Check if custom theme is loaded
 */
export function hasCustomTheme(): boolean {
  return customThemeCSS !== null
}
