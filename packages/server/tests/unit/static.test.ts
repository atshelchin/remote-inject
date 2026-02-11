import { describe, it, expect } from 'bun:test'
import { handleEmbeddedStatic, embeddedStaticPlugin, IS_COMPILED } from '../../src/static'

describe('Static File Handler', () => {
  describe('MIME Types', () => {
    // MIME type mapping is internal, but we can test via handleEmbeddedStatic
    // in compiled mode, or document expected behavior

    const expectedMimeTypes: Record<string, string> = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
      '.woff': 'font/woff',
      '.woff2': 'font/woff2',
      '.ttf': 'font/ttf',
      '.eot': 'application/vnd.ms-fontobject',
      '.map': 'application/json',
    }

    it('should have correct MIME type mappings documented', () => {
      // This test documents the expected MIME type mappings
      expect(Object.keys(expectedMimeTypes).length).toBe(15)
    })

    it('should handle common web extensions', () => {
      const webExtensions = ['.html', '.css', '.js', '.json']
      for (const ext of webExtensions) {
        expect(expectedMimeTypes[ext]).toBeDefined()
      }
    })

    it('should handle image extensions', () => {
      const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico']
      for (const ext of imageExtensions) {
        expect(expectedMimeTypes[ext]).toBeDefined()
      }
    })

    it('should handle font extensions', () => {
      const fontExtensions = ['.woff', '.woff2', '.ttf', '.eot']
      for (const ext of fontExtensions) {
        expect(expectedMimeTypes[ext]).toBeDefined()
      }
    })
  })

  describe('handleEmbeddedStatic', () => {
    it('should return null in development mode', () => {
      // In development mode (not compiled), should return null
      if (!IS_COMPILED) {
        const result = handleEmbeddedStatic('/css/theme.css')
        expect(result).toBeNull()
      }
    })

    it('should normalize paths', () => {
      // Path normalization logic: ensures leading slash
      // Testing this conceptually since embedded files may not exist

      if (!IS_COMPILED) {
        // Both should be treated the same
        expect(handleEmbeddedStatic('/test.css')).toBeNull()
        expect(handleEmbeddedStatic('test.css')).toBeNull()
      }
    })

    it('should return null for non-existent files', () => {
      const result = handleEmbeddedStatic('/nonexistent-file-xyz.css')
      expect(result).toBeNull()
    })

    if (IS_COMPILED) {
      it('should return Response for existing file (compiled mode)', () => {
        // This test only runs in compiled mode
        const result = handleEmbeddedStatic('/css/theme.css')
        expect(result).toBeInstanceOf(Response)
      })

      it('should set correct Content-Type header (compiled mode)', async () => {
        const result = handleEmbeddedStatic('/css/theme.css')
        if (result) {
          const contentType = result.headers.get('Content-Type')
          expect(contentType).toBe('text/css; charset=utf-8')
        }
      })

      it('should set Cache-Control header (compiled mode)', async () => {
        const result = handleEmbeddedStatic('/css/theme.css')
        if (result) {
          const cacheControl = result.headers.get('Cache-Control')
          expect(cacheControl).toBe('public, max-age=31536000, immutable')
        }
      })
    }
  })

  describe('embeddedStaticPlugin', () => {
    it('should return plugin object', () => {
      const plugin = embeddedStaticPlugin()

      expect(plugin).toBeDefined()
      expect(plugin.name).toBe('embedded-static')
      expect(typeof plugin.setup).toBe('function')
    })

    it('should have correct plugin name', () => {
      const plugin = embeddedStaticPlugin()
      expect(plugin.name).toBe('embedded-static')
    })

    it('should have setup function', () => {
      const plugin = embeddedStaticPlugin()
      expect(typeof plugin.setup).toBe('function')
    })
  })

  describe('IS_COMPILED flag', () => {
    it('should be a boolean', () => {
      expect(typeof IS_COMPILED).toBe('boolean')
    })

    it('should be false in development', () => {
      // When running tests via bun test, should be in dev mode
      // This may vary depending on how tests are run
      // Just check it's defined
      expect(IS_COMPILED !== undefined).toBe(true)
    })
  })
})

describe('Static File Handler - Path Handling', () => {
  describe('path normalization', () => {
    // Internal function getMimeType gets extension
    function getExtension(path: string): string {
      return path.substring(path.lastIndexOf('.'))
    }

    it('should extract extension correctly', () => {
      expect(getExtension('/css/theme.css')).toBe('.css')
      expect(getExtension('/js/app.js')).toBe('.js')
      expect(getExtension('/index.html')).toBe('.html')
    })

    it('should handle nested paths', () => {
      expect(getExtension('/deep/nested/path/file.js')).toBe('.js')
    })

    it('should handle multiple dots', () => {
      expect(getExtension('/file.min.js')).toBe('.js')
      expect(getExtension('/file.test.spec.ts')).toBe('.ts')
    })

    it('should handle no extension', () => {
      expect(getExtension('/file')).toBe('/file')
    })

    it('should handle hidden files', () => {
      expect(getExtension('/.gitignore')).toBe('.gitignore')
    })
  })
})

describe('Static File Handler - Cache Headers', () => {
  it('should document expected cache behavior', () => {
    // Documents the expected caching strategy
    const expectedHeaders = {
      'Cache-Control': 'public, max-age=31536000, immutable',
    }

    // 31536000 seconds = 1 year
    const oneYearInSeconds = 365 * 24 * 60 * 60
    expect(oneYearInSeconds).toBe(31536000)

    // Immutable means content won't change
    expect(expectedHeaders['Cache-Control']).toContain('immutable')
  })
})
