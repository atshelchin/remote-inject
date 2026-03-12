import { Elysia } from 'elysia'
import { cors } from '@elysiajs/cors'
import { staticPlugin } from '@elysiajs/static'
import { IS_COMPILED, handleEmbeddedStatic } from './static'
import {
  createSession,
  getSession,
  getOrCreateSession,
  getStats,
  isAtCapacity,
  registerConnection,
  unregisterConnection,
  getPeer,
  sendSSE,
  verifySecret,
  isMobileLocked,
  startCleanupInterval,
  setWalletInfo,
  updateWalletChain,
  updateWalletAddress,
  enqueueMessage,
  flushQueue,
} from './session'
import { sessionRateLimiter, getClientIP } from './ratelimit'
import { renderPage, getAllLocales } from './template'
import { getCustomThemeCSS } from './config'

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3700
const HOST = process.env.HOST || 'localhost'

// CORS configuration: localhost always allowed, additional origins from CORS_ORIGINS env
// CORS_ORIGINS can be comma-separated list of origins, or '*' for all origins
const CORS_ORIGINS = process.env.CORS_ORIGINS || ''
function getCorsOrigins(): string[] | true {
  if (CORS_ORIGINS === '*') {
    return true // Allow all origins
  }
  const origins = ['http://localhost', 'https://localhost']
  // Add localhost with common ports
  const commonPorts = [3000, 3001, 4000, 5000, 5173, 5174, 5175, 5176, 5177, 5178, 5179, 8000, 8080]
  commonPorts.forEach(port => {
    origins.push(`http://localhost:${port}`)
    origins.push(`http://127.0.0.1:${port}`)
  })
  // Add custom origins from env
  if (CORS_ORIGINS) {
    CORS_ORIGINS.split(',').forEach(origin => {
      const trimmed = origin.trim()
      if (trimmed && !origins.includes(trimmed)) {
        origins.push(trimmed)
      }
    })
  }
  return origins
}

// Safe App manifest helper (with CORS headers for cross-origin iframe access)
function getSafeManifest(request: Request) {
  const protocol = request.headers.get('x-forwarded-proto') || 'http'
  const host = request.headers.get('host') || `${HOST}:${PORT}`
  const baseUrl = `${protocol}://${host}`

  const manifest = {
    name: 'Remote Inject',
    description: 'Connect to DApps using your mobile wallet. Open-source WalletConnect alternative.',
    iconPath: `${baseUrl}/logo.png`,  // Absolute URL for cross-origin access
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
  // CORS support
  .use(cors({
    origin: getCorsOrigins(),
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  }))

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
  .get('/logo.png', async () => {
    const logoPath = import.meta.dir + '/../public/logo.png'
    const file = Bun.file(logoPath)
    return new Response(file, {
      headers: {
        'Content-Type': 'image/png',
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

    const { session, key } = createSession(metadata)
    const protocol = request.headers.get('x-forwarded-proto') || 'http'
    const host = request.headers.get('host') || `${HOST}:${PORT}`
    // URL 包含 nonce + HMAC 派生的 key，防止暴力枚举
    const url = `${protocol}://${host}/s/${session.id}?n=${session.nonce}&k=${key}`

    return {
      id: session.id,
      url,
      expiresAt: session.expiresAt,
    }
  })

  // 获取 Session 信息（供 bridge 页面使用）
  // 支持 ?n=NONCE&k=KEY 参数：session 不在内存时通过 HMAC 验证并按需创建
  .get('/session/:id', ({ params, query }: { params: { id: string }; query: { n?: string; k?: string } }) => {
    let session = getSession(params.id)

    // session 不在内存 — 尝试通过 HMAC 无状态恢复
    if (!session && query.n && query.k) {
      session = getOrCreateSession(params.id, query.n, query.k) ?? undefined
    }

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
  // 支持无状态恢复：即使 session 不在内存中，只要 n+k 参数通过 HMAC 验证即可渲染
  .get('/s/:id', ({ params, query, request }: { params: { id: string }; query: { n?: string; k?: string; lang?: string; theme?: string }; request: Request }) => {
    const nonce = query.n || ''
    const secret = query.k || ''

    // 尝试获取 session（内存中 或 通过 HMAC 按需创建）
    let session = getSession(params.id)
    if (!session && nonce && secret) {
      session = getOrCreateSession(params.id, nonce, secret) ?? undefined
    }

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

    // Render landing page directly with params embedded in HTML
    const html = renderPage('landing', request, {
      sessionId: params.id,
      nonce,
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
  .get('/landing', ({ query, request }: { query: { session?: string; n?: string; k?: string }; request: Request }) => {
    const sessionId = query.session
    const nonce = query.n || ''
    const secret = query.k || ''

    // Prepare DApp metadata for SSR
    let dapp = null
    if (sessionId) {
      let session = getSession(sessionId)
      if (!session && nonce && secret) {
        session = getOrCreateSession(sessionId, nonce, secret) ?? undefined
      }
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
      nonce,
      secret,
      dapp,
    })

    return new Response(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  })

  // Bridge 页面 (SSR with i18n)
  .get('/bridge', ({ query, request }: { query: { session?: string; n?: string; k?: string }; request: Request }) => {
    const sessionId = query.session
    const nonce = query.n || ''
    const secret = query.k || ''

    if (!sessionId) {
      return new Response('Missing session parameter', { status: 400 })
    }

    let session = getSession(sessionId)
    if (!session && nonce && secret) {
      session = getOrCreateSession(sessionId, nonce, secret) ?? undefined
    }

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
      nonce,
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

  // SSE 端点 — 服务端到客户端的事件流
  .get('/sse', ({ query, request }: { query: { session?: string; role?: string; n?: string; k?: string }; request: Request }) => {
    const { session: sessionId, role, n: nonce, k } = query

    if (!sessionId || !role) {
      return new Response('Missing session or role parameter', { status: 400 })
    }
    if (role !== 'dapp' && role !== 'mobile') {
      return new Response('Invalid role, must be "dapp" or "mobile"', { status: 400 })
    }

    // 尝试获取 session（内存中 或 通过 HMAC 按需创建）
    let sessionData = getSession(sessionId)
    if (!sessionData && nonce && k) {
      sessionData = getOrCreateSession(sessionId, nonce, k) ?? undefined
    }
    if (!sessionData) {
      return new Response('Session not found', { status: 404 })
    }
    if (sessionData.terminated) {
      return new Response('Session terminated', { status: 410 })
    }

    if (role === 'mobile') {
      if (!k || !nonce || !verifySecret(sessionId, nonce, k)) {
        return new Response('Invalid or missing secret', { status: 403 })
      }
      if (isMobileLocked(sessionId)) {
        return new Response('Session already has a mobile connection', { status: 409 })
      }
    }

    // 提前捕获对端（用于检测 DApp 重连）
    const existingPeer = getPeer(sessionId, role as 'dapp' | 'mobile')

    let cleanedUp = false
    function cleanup() {
      if (cleanedUp) return
      cleanedUp = true
      unregisterConnection(sessionId!, role as 'dapp' | 'mobile')
      // 不通知对端 SSE 断开 — 对端只关心自身的 SSE 连接状态，断线消息会引发误判
      // 需要传达给对端的消息（如用户主动断开）应通过 /message 端点发送，服务器会排队暂存
      console.log(`[SSE] ${role} disconnected from session ${sessionId}`)
    }

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const registered = registerConnection(sessionId!, role as 'dapp' | 'mobile', controller)
        if (!registered) {
          controller.close()
          return
        }

        // Tell clients to retry after 2 seconds on disconnect (default is ~3s)
        controller.enqueue(new TextEncoder().encode('retry: 2000\n\n'))

        // 发送 ready 事件
        sendSSE(controller, { type: 'ready' })

        // 如果 walletInfo 已缓存（移动端曾连接过），直接推送 connect 给对应方
        const walletInfo = sessionData.walletInfo
        if (walletInfo) {
          if (role === 'dapp') {
            // DApp 连接（首次或重连）：服务端直接推送 connect，无需 mobile 重发
            sendSSE(controller, { type: 'connect', address: walletInfo.address, chainId: walletInfo.chainId })
            console.log(`[SSE] Sent cached wallet connect to dapp for session ${sessionId}`)
          } else if (role === 'mobile' && existingPeer) {
            // Mobile 重连且 DApp 仍在线：通知 DApp
            sendSSE(existingPeer, { type: 'connect', address: walletInfo.address, chainId: walletInfo.chainId })
            console.log(`[SSE] Mobile reconnected, sent cached connect to dapp for session ${sessionId}`)
          }
        }

        // 投递离线期间暂存的消息（walletInfo 推送之后，保证顺序正确）
        flushQueue(sessionId!, role as 'dapp' | 'mobile', controller)

        console.log(`[SSE] ${role} connected to session ${sessionId}`)

        // 客户端断开时清理（AbortSignal）
        request.signal.addEventListener('abort', () => {
          cleanup()
          try { controller.close() } catch {}
        })
      },
      cancel() {
        cleanup()
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
        'Access-Control-Allow-Origin': '*',
      },
    })
  })

  // 消息端点 — 客户端到服务端（转发给对端的 SSE 流）
  .post('/message', async ({ query, request }: { query: { session?: string; role?: string; n?: string; k?: string }; request: Request }) => {
    const { session: sessionId, role, n: nonce, k } = query

    if (!sessionId || !role) {
      return new Response('Missing session or role parameter', { status: 400 })
    }
    if (role !== 'dapp' && role !== 'mobile') {
      return new Response('Invalid role', { status: 400 })
    }

    const sessionData = getSession(sessionId)
    if (!sessionData) {
      return new Response('Session not found', { status: 404 })
    }

    if (role === 'mobile') {
      if (!k || !nonce || !verifySecret(sessionId, nonce, k)) {
        return new Response('Invalid or missing secret', { status: 403 })
      }
    }

    let body: object
    try {
      body = await request.json()
    } catch {
      return new Response('Invalid JSON body', { status: 400 })
    }

    // 移动端消息：更新缓存的 walletInfo，用于 DApp 重连时恢复
    if (role === 'mobile') {
      const msg = body as Record<string, unknown>
      if (msg.type === 'connect' && typeof msg.address === 'string' && typeof msg.chainId === 'number') {
        setWalletInfo(sessionId, msg.address, msg.chainId)
        // connect 消息：即使 DApp 尚未连接也返回 200（walletInfo 已缓存，DApp 连接时会自动推送）
        const peer = getPeer(sessionId, 'mobile')
        if (peer) sendSSE(peer, body)
        return new Response('OK', { status: 200 })
      } else if (msg.type === 'chainChanged' && typeof msg.chainId === 'number') {
        updateWalletChain(sessionId, msg.chainId)
      } else if (msg.type === 'accountsChanged' && Array.isArray(msg.accounts) && msg.accounts.length > 0) {
        updateWalletAddress(sessionId, msg.accounts[0] as string)
      }
    }

    const peer = getPeer(sessionId, role as 'dapp' | 'mobile')
    if (!peer) {
      // 对端离线 — 暂存消息，等对端重连后投递
      const targetRole = role === 'dapp' ? 'mobile' : 'dapp'
      const queued = enqueueMessage(sessionId, targetRole as 'dapp' | 'mobile', body)
      if (queued) {
        console.log(`[HTTP] ${role} → ${targetRole}: queued (peer offline)`)
        return new Response('OK', { status: 200 })
      }
      return new Response(
        JSON.stringify({ type: 'error', code: -32000, message: 'Queue full or session not found' }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      )
    }

    sendSSE(peer, body)

    console.log(`[HTTP] ${role} -> ${role === 'dapp' ? 'mobile' : 'dapp'}: ${JSON.stringify(body).substring(0, 100)}`)
    return new Response('OK', { status: 200 })
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
