import { Elysia } from 'elysia'
import { staticPlugin } from '@elysiajs/static'
import { IS_COMPILED, handleEmbeddedStatic } from './static'
import {
  createSession,
  getSession,
  getStats,
  isAtCapacity,
  registerConnection,
  unregisterConnection,
  getPeer,
  verifySecret,
  isMobileLocked,
  startCleanupInterval,
  type WebSocketData,
} from './session'
import { sessionRateLimiter, getClientIP } from './ratelimit'
import { renderPage, getAllLocales } from './template'
import { getCustomThemeCSS } from './config'

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3700
const HOST = process.env.HOST || 'localhost'

// Safe App manifest helper (with CORS headers for cross-origin iframe access)
function getSafeManifest(request: Request) {
  const protocol = request.headers.get('x-forwarded-proto') || 'http'
  const host = request.headers.get('host') || `${HOST}:${PORT}`
  const baseUrl = `${protocol}://${host}`

  const manifest = {
    name: 'Remote Inject',
    description: 'Connect to DApps using your mobile wallet. Open-source WalletConnect alternative.',
    iconPath: `${baseUrl}/logo.svg`,  // Absolute URL for cross-origin access
  }

  return new Response(JSON.stringify(manifest), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}

const app = new Elysia()
  // 健康检查端点
  .get('/health', () => {
    const stats = getStats()
    return {
      status: 'ok',
      uptime: stats.uptime,
      sessions: stats.totalSessions,
    }
  })

  // 详细统计端点
  .get('/metrics', () => {
    return getStats()
  })

  // Safe App manifest for Safe Wallet compatibility
  // https://docs.safe.global/safe-smart-account/safe-apps/releasing-your-safe-app
  // Safe fetches manifest.json relative to the iframe URL, so we need to handle multiple paths
  .get('/manifest.json', ({ request }) => getSafeManifest(request))
  .get('/s/:id/manifest.json', ({ request }) => getSafeManifest(request))
  .get('/demo/manifest.json', ({ request }) => getSafeManifest(request))
  .get('/bridge/manifest.json', ({ request }) => getSafeManifest(request))
  .get('/landing/manifest.json', ({ request }) => getSafeManifest(request))

  // Logo with CORS headers for Safe App icon
  .get('/logo.svg', async () => {
    const logoPath = import.meta.dir + '/../public/logo.svg'
    const file = Bun.file(logoPath)
    const content = await file.text()
    return new Response(content, {
      headers: {
        'Content-Type': 'image/svg+xml',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=86400',
      },
    })
  })

  // 创建 Session（带速率限制和容量检查）
  .post('/session', async ({ request }: { request: Request }) => {
    // 检查容量
    if (isAtCapacity()) {
      return new Response('Server at capacity', { status: 503 })
    }

    // 检查速率限制
    const clientIP = getClientIP(request)
    if (!sessionRateLimiter.check(clientIP)) {
      const info = sessionRateLimiter.getInfo(clientIP)
      return new Response('Rate limit exceeded', {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil((info.resetAt - Date.now()) / 1000)),
          'X-RateLimit-Remaining': String(info.remaining),
        },
      })
    }

    // 解析 DApp 元数据
    let metadata
    try {
      const body = await request.json()
      if (body.name && body.url) {
        metadata = {
          name: body.name,
          url: body.url,
          icon: body.icon,
        }
      }
    } catch {
      // 没有 body 也可以创建 session
    }

    const session = createSession(metadata)
    const protocol = request.headers.get('x-forwarded-proto') || 'http'
    const host = request.headers.get('host') || `${HOST}:${PORT}`
    // URL 包含 secret，防止暴力枚举
    const url = `${protocol}://${host}/s/${session.id}?k=${session.secret}`

    return {
      id: session.id,
      url,
      expiresAt: session.expiresAt,
    }
  })

  // 获取 Session 信息（供 bridge 页面使用）
  .get('/session/:id', ({ params }: { params: { id: string } }) => {
    const session = getSession(params.id)
    if (!session) {
      return new Response('Session not found', { status: 404 })
    }
    // 已终止的 session 返回 410 Gone
    if (session.terminated) {
      return new Response('Session terminated', { status: 410 })
    }
    return {
      id: session.id,
      status: session.status,
      metadata: session.metadata,
      expiresAt: session.expiresAt,
    }
  })

  // 短链接 - 直接渲染 landing 页面（不用重定向，避免 Safe Wallet iframe 丢失参数）
  .get('/s/:id', ({ params, query, request }: { params: { id: string }; query: { k?: string; lang?: string; theme?: string }; request: Request }) => {
    const session = getSession(params.id)
    if (!session) {
      return new Response('Session not found', { status: 404 })
    }

    const secret = query.k || ''

    // Prepare DApp metadata for SSR
    let dapp = null
    if (session.metadata) {
      try {
        const url = new URL(session.metadata.url)
        dapp = {
          name: session.metadata.name,
          icon: session.metadata.icon,
          host: url.host,
        }
      } catch {
        dapp = {
          name: session.metadata.name,
          icon: session.metadata.icon,
          host: session.metadata.url,
        }
      }
    }

    // Render landing page directly with params embedded in HTML
    const html = renderPage('landing', request, {
      sessionId: params.id,
      secret,
      dapp,
      // Pass lang/theme from URL query to force override
      forceLang: query.lang,
      forceTheme: query.theme,
    })

    return new Response(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  })

  // Landing 页面 (SSR with i18n)
  .get('/landing', ({ query, request }: { query: { session?: string; k?: string }; request: Request }) => {
    const sessionId = query.session
    const secret = query.k || ''

    // Prepare DApp metadata for SSR
    let dapp = null
    if (sessionId) {
      const session = getSession(sessionId)
      if (session?.metadata) {
        try {
          const url = new URL(session.metadata.url)
          dapp = {
            name: session.metadata.name,
            icon: session.metadata.icon,
            host: url.host,
          }
        } catch {
          dapp = {
            name: session.metadata.name,
            icon: session.metadata.icon,
            host: session.metadata.url,
          }
        }
      }
    }

    const html = renderPage('landing', request, {
      sessionId,
      secret,
      dapp,
    })

    return new Response(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  })

  // Bridge 页面 (SSR with i18n)
  .get('/bridge', ({ query, request }: { query: { session?: string; k?: string }; request: Request }) => {
    const sessionId = query.session
    const secret = query.k || ''

    if (!sessionId) {
      return new Response('Missing session parameter', { status: 400 })
    }

    const session = getSession(sessionId)

    // Prepare DApp metadata for SSR
    let dapp = null
    if (session?.metadata) {
      try {
        const url = new URL(session.metadata.url)
        dapp = {
          name: session.metadata.name,
          icon: session.metadata.icon,
          host: url.host,
        }
      } catch {
        dapp = {
          name: session.metadata.name,
          icon: session.metadata.icon,
          host: session.metadata.url,
        }
      }
    }

    const html = renderPage('bridge', request, {
      sessionId,
      secret,
      dapp,
    })

    return new Response(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  })

  // Index 首页 (SSR with i18n)
  .get('/', ({ request }: { request: Request }) => {
    const html = renderPage('index', request, {
      availableLocales: getAllLocales(),
    })

    return new Response(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  })

  // Demo 页面 (SSR with i18n)
  .get('/demo', ({ request }: { request: Request }) => {
    const html = renderPage('demo', request, {
      availableLocales: getAllLocales(),
    })

    return new Response(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  })

  // WebSocket 连接
  .ws('/ws', {
    // 验证查询参数
    beforeHandle({ query }) {
      const { session, role, k } = query as { session?: string; role?: string; k?: string }

      if (!session || !role) {
        return new Response('Missing session or role parameter', { status: 400 })
      }

      if (role !== 'dapp' && role !== 'mobile') {
        return new Response('Invalid role, must be "dapp" or "mobile"', { status: 400 })
      }

      const sessionData = getSession(session)
      if (!sessionData) {
        return new Response('Session not found', { status: 404 })
      }

      // 移动端需要验证密钥
      if (role === 'mobile') {
        if (!k || !verifySecret(session, k)) {
          return new Response('Invalid or missing secret', { status: 403 })
        }
        // 检查是否已被锁定
        if (isMobileLocked(session)) {
          return new Response('Session already has a mobile connection', { status: 409 })
        }
      }
    },

    // 连接打开
    open(ws) {
      const url = new URL(ws.data.request.url)
      const sessionId = url.searchParams.get('session')!
      const role = url.searchParams.get('role') as 'dapp' | 'mobile'

      // 存储连接信息
      ;(ws.data as any).sessionId = sessionId
      ;(ws.data as any).role = role

      // 检查对端是否已连接（用于DApp重连时通知mobile）
      const existingPeer = getPeer(sessionId, role)

      // 注册连接
      const session = registerConnection(sessionId, role, ws.raw as any)
      if (!session) {
        ws.close(1008, 'Session not found or already locked')
        return
      }

      // 发送 ready 消息
      ws.send(JSON.stringify({ type: 'ready' }))

      // 如果DApp重连且mobile已存在，通知mobile重发状态
      if (role === 'dapp' && existingPeer) {
        existingPeer.send(JSON.stringify({ type: 'dapp_reconnected' }))
        console.log(`[WS] Notifying mobile that dapp reconnected to session ${sessionId}`)
      }

      console.log(`[WS] ${role} connected to session ${sessionId}`)
    },

    // 收到消息（透传到对端）
    message(ws, message) {
      const data = ws.data as any
      const { sessionId, role } = data
      const msgStr = typeof message === 'string' ? message : JSON.stringify(message)

      // 获取对端连接
      const peer = getPeer(sessionId, role)

      if (!peer) {
        // 对端未连接，发送错误
        ws.send(JSON.stringify({
          type: 'error',
          code: -32000,
          message: 'Peer not connected',
        }))
        return
      }

      // 透传消息到对端
      peer.send(msgStr)

      console.log(`[WS] ${role} -> ${role === 'dapp' ? 'mobile' : 'dapp'}: ${msgStr.substring(0, 100)}...`)
    },

    // 连接关闭
    close(ws) {
      const data = ws.data as any
      const { sessionId, role } = data

      if (sessionId && role) {
        unregisterConnection(sessionId, role)

        // 通知对端
        const peer = getPeer(sessionId, role === 'dapp' ? 'mobile' : 'dapp')
        if (peer) {
          peer.send(JSON.stringify({
            type: 'disconnect',
            reason: 'Peer disconnected',
          }))
        }

        console.log(`[WS] ${role} disconnected from session ${sessionId}`)
      }
    },
  })

// Custom theme CSS (loaded from CONFIG_DIR/themes/custom.css)
app.get('/css/custom-theme.css', () => {
  const customCSS = getCustomThemeCSS()
  if (!customCSS) {
    return new Response('/* No custom theme configured */', {
      headers: { 'Content-Type': 'text/css; charset=utf-8' },
    })
  }
  return new Response(customCSS, {
    headers: {
      'Content-Type': 'text/css; charset=utf-8',
      'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
    },
  })
})

// 静态文件服务（放在最后，避免与 API 路由冲突）
// 编译模式使用嵌入式资源，开发模式使用文件系统
if (IS_COMPILED) {
  // Compiled mode: serve from embedded assets
  app.get('/*', ({ path }: { path: string }) => {
    const response = handleEmbeddedStatic(path)
    if (response) return response
    // Return 404 for unmatched paths
    return new Response('Not Found', { status: 404 })
  })
  console.log('[Static] Using embedded static files')
} else {
  // Development mode: serve from filesystem
  app.use(staticPlugin({
    assets: 'public',
    prefix: '/',
  }))
  console.log('[Static] Using filesystem static files')
}

app.listen(PORT)

// 启动过期 Session 清理
startCleanupInterval()

console.log(`Remote Inject Server running at http://${HOST}:${PORT}`)
