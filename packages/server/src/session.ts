import { createHmac } from 'crypto'

export type SessionStatus = 'pending' | 'connected' | 'disconnected'

// DApp 元数据（展示给用户看的）
export interface DAppMetadata {
  name: string        // DApp 名称，如 "Uniswap"
  url: string         // DApp 网址，如 "https://app.uniswap.org"
  icon?: string       // 图标 URL（可选）
}

// 移动端钱包状态（缓存用于重连恢复）
export interface WalletInfo {
  address: string
  chainId: number
}

// SSE 连接控制器（替代 ServerWebSocket）
type SSEController = ReadableStreamDefaultController<Uint8Array>

const encoder = new TextEncoder()

// 向 SSE 流发送事件
export function sendSSE(controller: SSEController, data: object): void {
  try {
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
  } catch {
    // 控制器可能已关闭
  }
}

// 向 SSE 流发送心跳注释（保持连接活跃，防止 WebView/代理关闭空闲连接）
// SSE 注释以 : 开头，EventSource 会忽略，但 TCP 连接保持活跃
function sendHeartbeat(controller: SSEController): void {
  try {
    controller.enqueue(encoder.encode(':\n\n'))
  } catch {
    // 控制器可能已关闭
  }
}

// 关闭 SSE 流
function closeSSE(controller: SSEController): void {
  try {
    controller.close()
  } catch {
    // 已经关闭
  }
}

export interface Session {
  id: string
  nonce: string             // 随机 nonce，与 id 一起用于 HMAC 派生密钥（不直接存储密钥）
  createdAt: number
  expiresAt: number         // 证书过期时间（默认 1 年），到期后删除整个 session，用户需重新扫码
  stateExpiresAt: number    // 状态过期时间（活跃时 7 天，闲置时 1 小时），到期后仅清除 walletInfo，session 本身不删除
  status: SessionStatus
  dapp: SSEController | null
  mobile: SSEController | null
  metadata?: DAppMetadata   // DApp 信息
  walletInfo?: WalletInfo   // 移动端钱包状态（缓存，用于重连时恢复）
  mobileLocked: boolean     // 移动端是否已锁定（防止被踢）
  terminated: boolean       // 是否已被用户主动终止（不可再连接）
  dappQueue: object[]       // DApp 离线时暂存的消息（mobile → dapp），重连后投递
  mobileQueue: object[]     // Mobile 离线时暂存的消息（dapp → mobile），重连后投递
}

// 排除易混淆字符 (0/O/1/I/L)
const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const SESSION_ID_LENGTH = 4
const SECRET_LENGTH = 16    // 16 位派生密钥长度
const NONCE_LENGTH = 12     // 12 位随机 nonce（32^12 ≈ 10^18 种组合，确保唯一性）

// 服务端密钥（用于 HMAC 派生 session key）
// 设置后 session 可在服务器重启后恢复，未设置则每次启动自动生成（session 不跨重启）
const SESSION_SECRET: string = process.env.SESSION_SECRET || (() => {
  const key = generateRandomString(32)
  console.warn('[Session] SESSION_SECRET not configured. Auto-generated key for this instance. Set SESSION_SECRET env var for sessions that survive server restarts.')
  return key
})()

// 过期时间（可通过环境变量配置，单位：秒）
const CREDENTIAL_TIMEOUT = parseInt(process.env.SESSION_CREDENTIAL_TTL || '31536000', 10) * 1000  // 证书 TTL：1 年（session ID + secret 保持有效，无需重新扫码）
const STATE_PENDING_TIMEOUT = parseInt(process.env.SESSION_PENDING_TTL || '300', 10) * 1000       // 状态 TTL（等待连接）：5 分钟
const STATE_CONNECTED_TIMEOUT = parseInt(process.env.SESSION_CONNECTED_TTL || '604800', 10) * 1000 // 状态 TTL（已连接）：7 天

// 容量限制（可通过环境变量配置）
const MAX_SESSIONS = parseInt(process.env.MAX_SESSIONS || '10000', 10)

// 每个方向的消息队列上限（防止内存占用过大）
const MAX_QUEUE_SIZE = 50

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

// 生成随机 nonce
function generateNonce(): string {
  return generateRandomString(NONCE_LENGTH)
}

// 基于 HMAC-SHA256 派生密钥：key = HMAC(SERVER_SECRET, sessionId + nonce)
// 同一 id+nonce 始终产生相同 key，服务器重启后仍可验证
function deriveKey(sessionId: string, nonce: string): string {
  const hmac = createHmac('sha256', SESSION_SECRET)
  hmac.update(sessionId + nonce)
  const bytes = new Uint8Array(hmac.digest())
  return Array.from(bytes)
    .slice(0, SECRET_LENGTH)
    .map(byte => CHARSET[byte % CHARSET.length])
    .join('')
}

// 创建新 Session（返回 session 和派生的 key）
export function createSession(metadata?: DAppMetadata): { session: Session; key: string } {
  const now = Date.now()
  const id = generateSessionId()
  const nonce = generateNonce()
  const key = deriveKey(id, nonce)

  const session: Session = {
    id,
    nonce,
    createdAt: now,
    expiresAt: now + CREDENTIAL_TIMEOUT,          // 证书 1 年有效，无需重新扫码
    stateExpiresAt: now + STATE_PENDING_TIMEOUT,  // 状态初始 5 分钟（等待连接）
    status: 'pending',
    dapp: null,
    mobile: null,
    metadata,
    mobileLocked: false,
    terminated: false,
    dappQueue: [],
    mobileQueue: [],
  }
  sessions.set(session.id, session)
  return { session, key }
}

// 获取 Session
export function getSession(id: string): Session | undefined {
  return sessions.get(id)
}

// 删除 Session
export function deleteSession(id: string): void {
  sessions.delete(id)
}

// 验证移动端密钥（HMAC 派生）
// 如果 session 已在内存中且 nonce 匹配，直接返回 true（跳过 HMAC 计算）
export function verifySecret(sessionId: string, nonce: string, key: string): boolean {
  const session = sessions.get(sessionId)
  if (session && session.nonce === nonce) {
    // session 在内存中且 nonce 匹配 — 创建时已验证过，无需重复计算
    return true
  }
  // 不在内存 或 nonce 不匹配 — 计算 HMAC 验证
  return key === deriveKey(sessionId, nonce)
}

// 获取或按需创建 Session（无状态恢复：服务器重启后通过 HMAC 验证重建 session）
export function getOrCreateSession(id: string, nonce: string, key: string): Session | null {
  const existing = sessions.get(id)
  if (existing) {
    // 已在内存中 — 验证 nonce 匹配
    if (existing.nonce !== nonce) return null
    return existing
  }

  // 不在内存 — 通过 HMAC 验证凭证合法性
  if (key !== deriveKey(id, nonce)) return null

  // 验证通过，按需创建 session（无状态恢复）
  const now = Date.now()
  const session: Session = {
    id,
    nonce,
    createdAt: now,
    expiresAt: now + CREDENTIAL_TIMEOUT,
    stateExpiresAt: now + STATE_PENDING_TIMEOUT,
    status: 'pending',
    dapp: null,
    mobile: null,
    mobileLocked: false,
    terminated: false,
    dappQueue: [],
    mobileQueue: [],
  }
  sessions.set(id, session)
  console.log(`[Session] Recovered session: ${id} (stateless)`)
  return session
}

// 检查移动端是否已锁定
export function isMobileLocked(sessionId: string): boolean {
  const session = sessions.get(sessionId)
  if (!session) return false
  return session.mobileLocked
}

// 注册 SSE 连接
// 对于 mobile 角色，需要先调用 verifySecret 验证密钥
export function registerConnection(
  sessionId: string,
  role: 'dapp' | 'mobile',
  controller: SSEController
): Session | null {
  const session = sessions.get(sessionId)
  if (!session) return null

  // 如果session已被终止，拒绝连接
  if (session.terminated) {
    return null
  }

  if (role === 'dapp') {
    session.dapp = controller
  } else {
    // 移动端连接：检查是否已被锁定
    if (session.mobileLocked && session.mobile) {
      // 已有移动端连接，拒绝新连接
      return null
    }
    session.mobile = controller
    session.mobileLocked = true  // 锁定，防止被踢
  }

  // 双方都连接后，延长状态有效期
  if (session.dapp && session.mobile) {
    session.status = 'connected'
    session.stateExpiresAt = Date.now() + STATE_CONNECTED_TIMEOUT
  }

  return session
}

// 注销 SSE 连接
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

  // 双方断开后不缩短 stateExpiresAt — 保留 walletInfo 缓存直到原有的 7 天过期
  // 这样用户刷新页面即可重连，无需重新扫码
}

// Session ID 回收延迟（给客户端时间看到 410 状态）
const SESSION_RECYCLE_DELAY = 5000  // 5 秒后删除，释放 ID

// 终止 Session（用户主动断开，不可再连接）
export function terminateSession(sessionId: string): void {
  const session = sessions.get(sessionId)
  if (!session) return

  session.terminated = true
  session.status = 'disconnected'

  // 通知并关闭所有 SSE 连接
  if (session.dapp) {
    sendSSE(session.dapp, { type: 'disconnect', reason: 'Session terminated' })
    closeSSE(session.dapp)
    session.dapp = null
  }
  if (session.mobile) {
    sendSSE(session.mobile, { type: 'disconnect', reason: 'Session terminated' })
    closeSSE(session.mobile)
    session.mobile = null
  }

  // 延迟删除 session 以回收 ID（4位ID空间有限）
  setTimeout(() => {
    sessions.delete(sessionId)
    console.log(`[Session] Recycled session ID: ${sessionId}`)
  }, SESSION_RECYCLE_DELAY)
}

// 获取对端 SSE 控制器
export function getPeer(
  sessionId: string,
  myRole: 'dapp' | 'mobile'
): SSEController | null {
  const session = sessions.get(sessionId)
  if (!session) return null
  return myRole === 'dapp' ? session.mobile : session.dapp
}

// 保存移动端钱包状态（首次连接时调用）
export function setWalletInfo(sessionId: string, address: string, chainId: number): void {
  const session = sessions.get(sessionId)
  if (!session) return
  session.walletInfo = { address, chainId }
}

// 更新已缓存的 chainId（chainChanged 事件时调用）
export function updateWalletChain(sessionId: string, chainId: number): void {
  const session = sessions.get(sessionId)
  if (!session || !session.walletInfo) return
  session.walletInfo.chainId = chainId
}

// 更新已缓存的 address（accountsChanged 事件时调用）
export function updateWalletAddress(sessionId: string, address: string): void {
  const session = sessions.get(sessionId)
  if (!session || !session.walletInfo) return
  session.walletInfo.address = address
}

// 将消息暂存到目标角色的队列（对端离线时调用）
// 返回 false 表示队列已满或 session 不存在
export function enqueueMessage(sessionId: string, targetRole: 'dapp' | 'mobile', data: object): boolean {
  const session = sessions.get(sessionId)
  if (!session) return false

  const queue = targetRole === 'dapp' ? session.dappQueue : session.mobileQueue
  if (queue.length >= MAX_QUEUE_SIZE) {
    // 队列已满，丢弃最旧的消息，腾出空间给新消息
    queue.shift()
    console.log(`[Session] Queue full for ${targetRole} in session ${sessionId}, dropped oldest message`)
  }
  queue.push(data)
  return true
}

// 将指定角色的队列中的消息全部发送出去（角色重连时调用）
export function flushQueue(sessionId: string, role: 'dapp' | 'mobile', controller: SSEController): void {
  const session = sessions.get(sessionId)
  if (!session) return

  const queue = role === 'dapp' ? session.dappQueue : session.mobileQueue
  if (queue.length === 0) return

  console.log(`[Session] Flushing ${queue.length} queued messages to ${role} for session ${sessionId}`)
  for (const data of queue) {
    sendSSE(controller, data)
  }
  if (role === 'dapp') {
    session.dappQueue = []
  } else {
    session.mobileQueue = []
  }
}

// 清理过期 Session（两级清理）
export function cleanupExpiredSessions(): void {
  const now = Date.now()
  for (const [id, session] of sessions) {
    if (now > session.expiresAt) {
      // 证书过期（1 年）→ 完全删除 session，释放 ID
      if (session.dapp) {
        sendSSE(session.dapp, { type: 'disconnect', reason: 'Session expired' })
        closeSSE(session.dapp)
      }
      if (session.mobile) {
        sendSSE(session.mobile, { type: 'disconnect', reason: 'Session expired' })
        closeSSE(session.mobile)
      }
      sessions.delete(id)
    } else if (now > session.stateExpiresAt && session.walletInfo) {
      // 状态过期（1 小时闲置）→ 仅清除 walletInfo，保留证书
      // 用户下次打开时可直接用同一扫码 URL 重新连接，无需重新扫码
      session.walletInfo = undefined
      session.mobileLocked = false
      console.log(`[Session] Cleared stale wallet state for session ${id}`)
    }
  }
}

// 向所有活跃 SSE 连接发送心跳（防止 WebView/代理关闭空闲连接）
function broadcastHeartbeat(): void {
  for (const session of sessions.values()) {
    if (session.dapp) sendHeartbeat(session.dapp)
    if (session.mobile) sendHeartbeat(session.mobile)
  }
}

// 启动定期清理 + 心跳
export function startCleanupInterval(intervalMs = 60000): void {
  setInterval(cleanupExpiredSessions, intervalMs)
  // 每 25 秒发送心跳，低于大多数代理/负载均衡器的 30-60 秒空闲超时
  setInterval(broadcastHeartbeat, 25000)
}
