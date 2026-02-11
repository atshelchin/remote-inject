import type { ServerWebSocket } from 'bun'

export type SessionStatus = 'pending' | 'connected' | 'disconnected'

// DApp 元数据（展示给用户看的）
export interface DAppMetadata {
  name: string        // DApp 名称，如 "Uniswap"
  url: string         // DApp 网址，如 "https://app.uniswap.org"
  icon?: string       // 图标 URL（可选）
}

export interface Session {
  id: string
  secret: string            // 移动端连接需要的密钥（防止暴力枚举）
  createdAt: number
  expiresAt: number
  status: SessionStatus
  dapp: ServerWebSocket<WebSocketData> | null
  mobile: ServerWebSocket<WebSocketData> | null
  metadata?: DAppMetadata   // DApp 信息
  mobileLocked: boolean     // 移动端是否已锁定（防止被踢）
}

export interface WebSocketData {
  sessionId: string
  role: 'dapp' | 'mobile'
}

// 排除易混淆字符 (0/O/1/I/L)
const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const SESSION_ID_LENGTH = 4
const SECRET_LENGTH = 16    // 16 位密钥，用于防止暴力枚举

// 过期时间
const PENDING_TIMEOUT = 5 * 60 * 1000      // 5 分钟
const CONNECTED_TIMEOUT = 24 * 60 * 60 * 1000  // 24 小时

// 容量限制（可通过环境变量配置）
const MAX_SESSIONS = parseInt(process.env.MAX_SESSIONS || '10000', 10)

// Session 存储
const sessions = new Map<string, Session>()

// 统计信息
export interface SessionStats {
  totalSessions: number
  pendingSessions: number
  connectedSessions: number
  maxSessions: number
  uptime: number
}

const startTime = Date.now()

// 获取统计信息
export function getStats(): SessionStats {
  let pending = 0
  let connected = 0

  for (const session of sessions.values()) {
    if (session.status === 'pending') pending++
    else if (session.status === 'connected') connected++
  }

  return {
    totalSessions: sessions.size,
    pendingSessions: pending,
    connectedSessions: connected,
    maxSessions: MAX_SESSIONS,
    uptime: Date.now() - startTime,
  }
}

// 检查是否已达容量上限
export function isAtCapacity(): boolean {
  return sessions.size >= MAX_SESSIONS
}

// 生成随机字符串
function generateRandomString(length: number): string {
  return Array.from(
    crypto.getRandomValues(new Uint8Array(length)),
    (byte) => CHARSET[byte % CHARSET.length]
  ).join('')
}

// 生成随机 Session ID（确保唯一）
function generateSessionId(): string {
  let id: string
  do {
    id = generateRandomString(SESSION_ID_LENGTH)
  } while (sessions.has(id))
  return id
}

// 生成连接密钥
function generateSecret(): string {
  return generateRandomString(SECRET_LENGTH)
}

// 创建新 Session
export function createSession(metadata?: DAppMetadata): Session {
  const now = Date.now()
  const session: Session = {
    id: generateSessionId(),
    secret: generateSecret(),
    createdAt: now,
    expiresAt: now + PENDING_TIMEOUT,
    status: 'pending',
    dapp: null,
    mobile: null,
    metadata,
    mobileLocked: false,
  }
  sessions.set(session.id, session)
  return session
}

// 获取 Session
export function getSession(id: string): Session | undefined {
  return sessions.get(id)
}

// 删除 Session
export function deleteSession(id: string): void {
  sessions.delete(id)
}

// 验证移动端密钥
export function verifySecret(sessionId: string, secret: string): boolean {
  const session = sessions.get(sessionId)
  if (!session) return false
  return session.secret === secret
}

// 检查移动端是否已锁定
export function isMobileLocked(sessionId: string): boolean {
  const session = sessions.get(sessionId)
  if (!session) return false
  return session.mobileLocked
}

// 注册 WebSocket 连接
// 对于 mobile 角色，需要先调用 verifySecret 验证密钥
export function registerConnection(
  sessionId: string,
  role: 'dapp' | 'mobile',
  ws: ServerWebSocket<WebSocketData>
): Session | null {
  const session = sessions.get(sessionId)
  if (!session) return null

  if (role === 'dapp') {
    session.dapp = ws
  } else {
    // 移动端连接：检查是否已被锁定
    if (session.mobileLocked && session.mobile) {
      // 已有移动端连接，拒绝新连接
      return null
    }
    session.mobile = ws
    session.mobileLocked = true  // 锁定，防止被踢
  }

  // 双方都连接后，更新状态和过期时间
  if (session.dapp && session.mobile) {
    session.status = 'connected'
    session.expiresAt = Date.now() + CONNECTED_TIMEOUT
  }

  return session
}

// 注销 WebSocket 连接
export function unregisterConnection(
  sessionId: string,
  role: 'dapp' | 'mobile'
): void {
  const session = sessions.get(sessionId)
  if (!session) return

  if (role === 'dapp') {
    session.dapp = null
  } else {
    session.mobile = null
    // 移动端断开后，解除锁定，允许重新连接
    session.mobileLocked = false
  }

  session.status = 'disconnected'
}

// 获取对端连接
export function getPeer(
  sessionId: string,
  myRole: 'dapp' | 'mobile'
): ServerWebSocket<WebSocketData> | null {
  const session = sessions.get(sessionId)
  if (!session) return null
  return myRole === 'dapp' ? session.mobile : session.dapp
}

// 清理过期 Session
export function cleanupExpiredSessions(): void {
  const now = Date.now()
  for (const [id, session] of sessions) {
    if (now > session.expiresAt) {
      // 关闭连接
      session.dapp?.close(1000, 'Session expired')
      session.mobile?.close(1000, 'Session expired')
      sessions.delete(id)
    }
  }
}

// 启动定期清理
export function startCleanupInterval(intervalMs = 60000): void {
  setInterval(cleanupExpiredSessions, intervalMs)
}
