/**
 * Static file handler that supports both filesystem and embedded assets
 */

import { IS_COMPILED, getPublicFiles } from './embedded-assets'

// Cache embedded files in memory
let embeddedFiles: Map<string, { content: Buffer; mimeType: string }> | null = null

if (IS_COMPILED) {
  embeddedFiles = getPublicFiles()
  console.log(`[Static] Loaded ${embeddedFiles.size} embedded static files`)
}

// MIME types for common file extensions
const MIME_TYPES: Record<string, string> = {
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

function getMimeType(path: string): string {
  const ext = path.substring(path.lastIndexOf('.'))
  return MIME_TYPES[ext] || 'application/octet-stream'
}

/**
 * Handle static file request from embedded assets
 * Returns Response if file found, null otherwise
 */
export function handleEmbeddedStatic(path: string): Response | null {
  if (!IS_COMPILED || !embeddedFiles) {
    return null
  }

  // Normalize path
  const normalizedPath = path.startsWith('/') ? path : '/' + path

  const file = embeddedFiles.get(normalizedPath)
  if (!file) {
    return null
  }

  return new Response(file.content, {
    headers: {
      'Content-Type': file.mimeType,
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
}

/**
 * Create Elysia plugin for embedded static files
 */
export function embeddedStaticPlugin() {
  return {
    name: 'embedded-static',
    setup(app: any) {
      if (!IS_COMPILED || !embeddedFiles) {
        return app
      }

      // Handle all static file requests
      return app.get('/*', ({ path }: { path: string }) => {
        const response = handleEmbeddedStatic(path)
        if (response) {
          return response
        }
        // Return undefined to let other handlers process the request
        return undefined
      })
    },
  }
}

export { IS_COMPILED }
