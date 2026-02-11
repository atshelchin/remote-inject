import { describe, it, expect, beforeAll } from 'bun:test'
import {
  getExternalTranslations,
  getExternalLocales,
  hasExternalTranslations,
  getCustomThemeCSS,
  hasCustomTheme,
} from '../../src/config'

// Note: loadExternalConfig is called at module load time by template.ts
// These tests verify the external config functions work correctly

describe('Config - External Translations', () => {
  describe('getExternalTranslations', () => {
    it('should return object for any locale', () => {
      const result = getExternalTranslations('en')
      expect(typeof result).toBe('object')
    })

    it('should return empty object for non-existent locale', () => {
      const result = getExternalTranslations('nonexistent-locale-xyz')
      expect(result).toEqual({})
    })

    it('should return translations if locale was loaded externally', () => {
      const locales = getExternalLocales()

      if (locales.length > 0) {
        const result = getExternalTranslations(locales[0])
        expect(typeof result).toBe('object')
        expect(Object.keys(result).length).toBeGreaterThan(0)
      }
    })
  })

  describe('getExternalLocales', () => {
    it('should return array', () => {
      const result = getExternalLocales()
      expect(Array.isArray(result)).toBe(true)
    })

    it('should return locale strings', () => {
      const result = getExternalLocales()

      for (const locale of result) {
        expect(typeof locale).toBe('string')
        expect(locale.length).toBeGreaterThan(0)
      }
    })
  })

  describe('hasExternalTranslations', () => {
    it('should return boolean', () => {
      const result = hasExternalTranslations('en')
      expect(typeof result).toBe('boolean')
    })

    it('should return false for non-existent locale', () => {
      const result = hasExternalTranslations('nonexistent-locale-xyz')
      expect(result).toBe(false)
    })

    it('should be consistent with getExternalLocales', () => {
      const locales = getExternalLocales()

      for (const locale of locales) {
        expect(hasExternalTranslations(locale)).toBe(true)
      }
    })
  })
})

describe('Config - Custom Theme', () => {
  describe('getCustomThemeCSS', () => {
    it('should return string or null', () => {
      const result = getCustomThemeCSS()
      expect(result === null || typeof result === 'string').toBe(true)
    })

    it('should return valid CSS if theme exists', () => {
      const css = getCustomThemeCSS()

      if (css !== null) {
        // Basic CSS validation - should be non-empty
        expect(css.length).toBeGreaterThan(0)
      }
    })
  })

  describe('hasCustomTheme', () => {
    it('should return boolean', () => {
      const result = hasCustomTheme()
      expect(typeof result).toBe('boolean')
    })

    it('should be consistent with getCustomThemeCSS', () => {
      const css = getCustomThemeCSS()
      const hasTheme = hasCustomTheme()

      if (css !== null) {
        expect(hasTheme).toBe(true)
      } else {
        expect(hasTheme).toBe(false)
      }
    })
  })
})

describe('Config - Integration with Template', () => {
  // These tests verify that external config integrates correctly with templates

  it('should allow external translations to override built-in', async () => {
    // Import template module which uses config
    const { getTranslator, getAllLocales } = await import('../../src/template')

    const locales = getAllLocales()
    expect(locales).toContain('en')
    expect(locales).toContain('zh')

    // External locales should be included
    const externalLocales = getExternalLocales()
    for (const locale of externalLocales) {
      expect(locales).toContain(locale)
    }
  })

  it('should merge external translations with built-in', async () => {
    const { getTranslator } = await import('../../src/template')

    // Get translator for a locale with external translations
    const externalLocales = getExternalLocales()

    if (externalLocales.length > 0) {
      const locale = externalLocales[0]
      const t = getTranslator(locale)
      const external = getExternalTranslations(locale)

      // External keys should be accessible via translator
      for (const key of Object.keys(external)) {
        expect(t(key)).toBe(external[key])
      }
    }
  })
})

describe('Config - Edge Cases', () => {
  it('should handle empty locale string', () => {
    const result = getExternalTranslations('')
    expect(result).toEqual({})
  })

  it('should handle special characters in locale', () => {
    const result = getExternalTranslations('../../../etc/passwd')
    expect(result).toEqual({})
  })

  it('should be idempotent', () => {
    // Multiple calls should return consistent results
    const result1 = getExternalLocales()
    const result2 = getExternalLocales()

    expect(result1).toEqual(result2)
  })

  it('should return same reference for same locale', () => {
    const locales = getExternalLocales()

    if (locales.length > 0) {
      const locale = locales[0]
      const result1 = getExternalTranslations(locale)
      const result2 = getExternalTranslations(locale)

      // Should return same object reference
      expect(result1).toBe(result2)
    }
  })
})
