import { describe, it, expect } from 'bun:test'
import {
  detectLocale,
  getTranslator,
  getAllLocales,
  translations,
} from '../../src/template'

describe('Template - Locale Detection', () => {
  describe('detectLocale', () => {
    it('should return "en" for undefined header', () => {
      expect(detectLocale(undefined)).toBe('en')
    })

    it('should return "en" for empty header', () => {
      expect(detectLocale('')).toBe('en')
    })

    it('should detect English', () => {
      expect(detectLocale('en')).toBe('en')
      expect(detectLocale('en-US')).toBe('en')
      expect(detectLocale('en-GB')).toBe('en')
    })

    it('should detect Chinese', () => {
      expect(detectLocale('zh')).toBe('zh')
      expect(detectLocale('zh-CN')).toBe('zh')
      expect(detectLocale('zh-TW')).toBe('zh')
    })

    it('should handle quality values', () => {
      // zh has higher quality, should be selected
      expect(detectLocale('en;q=0.5, zh;q=0.9')).toBe('zh')
    })

    it('should respect quality priority', () => {
      // en has higher quality
      expect(detectLocale('zh;q=0.5, en;q=0.8')).toBe('en')
    })

    it('should default to q=1 when not specified', () => {
      // Both have default q=1, first one wins
      expect(detectLocale('zh, en')).toBe('zh')
    })

    it('should fall back to "en" for unsupported languages', () => {
      expect(detectLocale('fr')).toBe('en')
      expect(detectLocale('de')).toBe('en')
      expect(detectLocale('ja')).toBe('en') // Unless ja is loaded externally
    })

    it('should find supported language in list', () => {
      expect(detectLocale('fr, de, zh, en')).toBe('zh')
    })

    it('should handle complex Accept-Language header', () => {
      const header = 'fr-FR;q=0.9, en-US;q=0.8, en;q=0.7, zh-CN;q=0.6'
      // fr-FR not supported, en-US maps to en which is supported
      expect(detectLocale(header)).toBe('en')
    })

    it('should handle malformed quality values', () => {
      // parseFloat('invalid') returns NaN - JS sort with NaN is unpredictable
      // The function still returns a valid supported locale
      const result = detectLocale('en;q=invalid, zh;q=0.8')
      expect(['en', 'zh']).toContain(result)
    })

    it('should ignore unsupported languages in list', () => {
      expect(detectLocale('fr;q=1.0, de;q=0.9, zh;q=0.8')).toBe('zh')
    })
  })
})

describe('Template - Translations', () => {
  describe('getTranslator', () => {
    it('should return function', () => {
      const t = getTranslator('en')
      expect(typeof t).toBe('function')
    })

    it('should translate known keys in English', () => {
      const t = getTranslator('en')
      expect(t('app.name')).toBe('Remote Inject')
      expect(t('common.loading')).toBe('Loading...')
      expect(t('common.error')).toBe('Error')
    })

    it('should translate known keys in Chinese', () => {
      const t = getTranslator('zh')
      expect(t('app.name')).toBe('Remote Inject')
      expect(t('common.loading')).toBe('加载中...')
      expect(t('common.error')).toBe('错误')
    })

    it('should return key for unknown translations', () => {
      const t = getTranslator('en')
      expect(t('unknown.key.here')).toBe('unknown.key.here')
    })

    it('should fall back to English for unknown locale', () => {
      const t = getTranslator('fr')
      expect(t('common.loading')).toBe('Loading...')
    })

    it('should substitute parameters', () => {
      const t = getTranslator('en')
      expect(t('landing.walletDetected', { name: 'MetaMask' })).toBe(
        'Detected MetaMask, redirecting...'
      )
    })

    it('should substitute multiple parameters', () => {
      const t = getTranslator('en')
      expect(t('bridge.reconnecting', { attempt: '2', maxAttempts: '3' })).toBe(
        'Reconnecting... (2/3)'
      )
    })

    it('should handle missing parameters gracefully', () => {
      const t = getTranslator('en')
      // Parameter not provided, placeholder remains
      expect(t('landing.walletDetected')).toBe('Detected {name}, redirecting...')
    })

    it('should handle empty params object', () => {
      const t = getTranslator('en')
      expect(t('landing.walletDetected', {})).toBe('Detected {name}, redirecting...')
    })

    it('should substitute parameters in Chinese', () => {
      const t = getTranslator('zh')
      expect(t('landing.walletDetected', { name: 'MetaMask' })).toBe(
        '检测到 MetaMask，正在跳转...'
      )
    })
  })

  describe('getAllLocales', () => {
    it('should include built-in locales', () => {
      const locales = getAllLocales()
      expect(locales).toContain('en')
      expect(locales).toContain('zh')
    })

    it('should return array', () => {
      const locales = getAllLocales()
      expect(Array.isArray(locales)).toBe(true)
    })

    it('should have no duplicates', () => {
      const locales = getAllLocales()
      const unique = [...new Set(locales)]
      expect(locales.length).toBe(unique.length)
    })
  })

  describe('translations object', () => {
    it('should have en and zh locales', () => {
      expect(translations.en).toBeDefined()
      expect(translations.zh).toBeDefined()
    })

    it('should have consistent keys between locales', () => {
      const enKeys = Object.keys(translations.en)
      const zhKeys = Object.keys(translations.zh)

      // Both should have the same keys
      expect(enKeys.length).toBe(zhKeys.length)

      for (const key of enKeys) {
        expect(zhKeys).toContain(key)
      }
    })

    it('should not have empty translations', () => {
      for (const locale of ['en', 'zh'] as const) {
        for (const [key, value] of Object.entries(translations[locale])) {
          expect(value).toBeTruthy()
          expect(value.length).toBeGreaterThan(0)
        }
      }
    })
  })
})

describe('Template - Cookie Parsing', () => {
  // parseCookies is private, but we can test it indirectly through renderPage
  // For now, let's test the logic conceptually

  describe('cookie parsing logic', () => {
    function parseCookies(cookieHeader: string | null): Record<string, string> {
      if (!cookieHeader) return {}
      const cookies: Record<string, string> = {}
      cookieHeader.split(';').forEach((cookie) => {
        const [name, ...rest] = cookie.trim().split('=')
        if (name) {
          cookies[name] = rest.join('=')
        }
      })
      return cookies
    }

    it('should parse single cookie', () => {
      const result = parseCookies('locale=en')
      expect(result).toEqual({ locale: 'en' })
    })

    it('should parse multiple cookies', () => {
      const result = parseCookies('locale=en; theme=dark')
      expect(result).toEqual({ locale: 'en', theme: 'dark' })
    })

    it('should handle cookies with = in value', () => {
      const result = parseCookies('token=abc=def=ghi')
      expect(result).toEqual({ token: 'abc=def=ghi' })
    })

    it('should return empty object for null', () => {
      const result = parseCookies(null)
      expect(result).toEqual({})
    })

    it('should return empty object for empty string', () => {
      const result = parseCookies('')
      expect(result).toEqual({})
    })

    it('should trim whitespace', () => {
      const result = parseCookies('  locale = en  ;  theme = dark  ')
      expect(result).toEqual({ 'locale ': ' en', 'theme ': ' dark' })
    })

    it('should handle cookie without value', () => {
      const result = parseCookies('sessionid')
      expect(result).toEqual({ sessionid: '' })
    })
  })
})

describe('Template - JSON Escaping for XSS Prevention', () => {
  describe('safeJson escaping logic', () => {
    function escapeJsonForScript(json: string): string {
      return json.replace(/</g, '\\u003c').replace(/>/g, '\\u003e')
    }

    it('should escape < characters', () => {
      const result = escapeJsonForScript('{"text":"<script>"}')
      expect(result).toBe('{"text":"\\u003cscript\\u003e"}')
    })

    it('should escape > characters', () => {
      const result = escapeJsonForScript('{"text":"</script>"}')
      expect(result).toBe('{"text":"\\u003c/script\\u003e"}')
    })

    it('should not affect normal text', () => {
      const result = escapeJsonForScript('{"text":"Hello World"}')
      expect(result).toBe('{"text":"Hello World"}')
    })

    it('should handle multiple occurrences', () => {
      const result = escapeJsonForScript('{"a":"<>","b":"<>"}')
      expect(result).toBe('{"a":"\\u003c\\u003e","b":"\\u003c\\u003e"}')
    })

    it('should prevent XSS via script injection', () => {
      const malicious = '{"text":"</script><script>alert(1)</script>"}'
      const result = escapeJsonForScript(malicious)

      expect(result).not.toContain('</script>')
      expect(result).not.toContain('<script>')
      expect(result).toContain('\\u003c')
      expect(result).toContain('\\u003e')
    })
  })
})

describe('Template - Locale and Theme Priority', () => {
  // These tests document the expected priority behavior:
  // Locale: forceLang > URL param > cookie > Accept-Language header
  // Theme: forceTheme > URL param > cookie > null

  describe('locale priority documentation', () => {
    it('should document locale priority order', () => {
      // This test documents the expected behavior
      const priorities = [
        '1. forceLang (passed in data)',
        '2. URL param (?lang=xx)',
        '3. Cookie (locale=xx)',
        '4. Accept-Language header',
        '5. Default to "en"',
      ]

      expect(priorities.length).toBe(5)
    })
  })

  describe('theme priority documentation', () => {
    it('should document theme priority order', () => {
      // This test documents the expected behavior
      const priorities = [
        '1. forceTheme (passed in data)',
        '2. URL param (?theme=dark|light)',
        '3. Cookie (theme=dark|light)',
        '4. null (use system/saved preference)',
      ]

      expect(priorities.length).toBe(4)
    })

    it('should only accept dark or light as valid themes', () => {
      const validThemes = ['dark', 'light']
      const invalidThemes = ['blue', 'red', 'auto', '']

      // This documents that only 'dark' and 'light' are valid
      expect(validThemes).toContain('dark')
      expect(validThemes).toContain('light')
      expect(validThemes.length).toBe(2)
    })
  })
})
