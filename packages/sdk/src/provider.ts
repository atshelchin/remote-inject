export interface RequestArguments {
  method: string
  params?: unknown[] | object
}

export interface ProviderRpcError extends Error {
  code: number
  data?: unknown
}

export interface ProviderMessage {
  type: string
  data: unknown
}

export interface ProviderConnectInfo {
  chainId: string
}

export interface DAppMetadata {
  name: string
  url: string
  icon?: string
}

export interface DisconnectInfo {
  code: number
  message: string
  userInitiated?: boolean
}

export interface ReconnectInfo {
  attempt: number
  maxAttempts: number
}

type EventType = 'connect' | 'disconnect' | 'chainChanged' | 'accountsChanged' | 'message' | 'reconnecting'
type EventListener = (...args: any[]) => void

interface PendingRequest {
  resolve: (result: unknown) => void
  reject: (error: ProviderRpcError) => void
  timeout: ReturnType<typeof setTimeout>
}

const REQUEST_TIMEOUT = 60000 // 60 秒
const MAX_CONSECUTIVE_ERRORS = 15 // 约 30 秒后放弃自动重连

export class RemoteProvider {
  private eventSource: EventSource | null = null
  private serverUrl: string = ''
  private sessionId: string = ''
  private sessionUrl: string = ''
  private requestId: number = 0
  private pendingRequests: Map<number, PendingRequest> = new Map()
  private eventListeners: Map<EventType, Set<EventListener>> = new Map()
  private consecutiveErrors: number = 0

  private _chainId: string = '0x1'
  private _accounts: string[] = []
  private _connected: boolean = false

  private _userInitiatedDisconnect: boolean = false

  // 是否正在重连（EventSource 处于 CONNECTING 状态且有 session）
  get _reconnecting(): boolean {
    return (
      !this._userInitiatedDisconnect &&
      this.eventSource !== null &&
      this.eventSource.readyState === EventSource.CONNECTING &&
      Boolean(this.sessionId)
    )
  }

  constructor() {
    const events: EventType[] = ['connect', 'disconnect', 'chainChanged', 'accountsChanged', 'message', 'reconnecting']
    events.forEach(event => this.eventListeners.set(event, new Set()))
  }

  /**
   * 连接到 Remote Inject Server
   */
  async connect(serverUrl: string, metadata?: DAppMetadata): Promise<{ sessionId: string; url: string }> {
    this.serverUrl = serverUrl.replace(/\/$/, '')
    this._userInitiatedDisconnect = false

    // 创建 Session
    const response = await fetch(`${this.serverUrl}/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: metadata ? JSON.stringify(metadata) : undefined,
    })

    if (!response.ok) {
      throw new Error(`Failed to create session: ${response.statusText}`)
    }

    const data = await response.json()
    this.sessionId = data.id
    this.sessionUrl = data.url

    // 建立 SSE 连接
    await this.connectSSE()

    return {
      sessionId: this.sessionId,
      url: this.sessionUrl,
    }
  }

  /**
   * 恢复已存在的 Session
   */
  async resumeSession(sessionData: { serverUrl: string; sessionId: string; sessionUrl: string }): Promise<void> {
    this.cleanupConnection()

    this.serverUrl = sessionData.serverUrl.replace(/\/$/, '')
    this.sessionId = sessionData.sessionId
    this.sessionUrl = sessionData.sessionUrl
    this._userInitiatedDisconnect = false

    // 从 sessionUrl 中提取 nonce 和 key（用于服务器重启后的无状态恢复）
    let nonce = ''
    let key = ''
    try {
      const url = new URL(this.sessionUrl)
      nonce = url.searchParams.get('n') || ''
      key = url.searchParams.get('k') || ''
    } catch {}

    // 检查 session 是否还存在（附带 nonce+key 允许服务端按需创建）
    let checkUrl = `${this.serverUrl}/session/${this.sessionId}`
    if (nonce && key) {
      checkUrl += `?n=${encodeURIComponent(nonce)}&k=${encodeURIComponent(key)}`
    }
    const checkRes = await fetch(checkUrl)
    if (!checkRes.ok) {
      throw new Error('Session not found or expired')
    }

    await this.connectSSE()
  }

  /**
   * 清理现有 SSE 连接（不触发事件）
   */
  private cleanupConnection(): void {
    if (this.eventSource) {
      this.eventSource.onmessage = null
      this.eventSource.onerror = null
      this.eventSource.onopen = null
      this.eventSource.close()
      this.eventSource = null
    }
    // 清理所有 pending 请求的 timeout
    for (const pending of this.pendingRequests.values()) {
      clearTimeout(pending.timeout)
    }
    this.pendingRequests.clear()
  }

  /**
   * 建立 SSE 连接，等待 ready 事件后 resolve
   */
  private connectSSE(): Promise<void> {
    return new Promise((resolve, reject) => {
      const sseUrl = `${this.serverUrl}/sse?session=${this.sessionId}&role=dapp`
      const es = new EventSource(sseUrl)
      this.eventSource = es

      let resolved = false

      const timeout = setTimeout(() => {
        if (!resolved) {
          es.close()
          this.eventSource = null
          reject(new Error('SSE connection timeout'))
        }
      }, 10000)

      es.onmessage = (event) => {
        this.consecutiveErrors = 0 // 收到任何消息即重置错误计数
        this.handleMessage(event.data)
        if (!resolved) {
          try {
            const msg = JSON.parse(event.data)
            if (msg.type === 'ready') {
              clearTimeout(timeout)
              resolved = true
              resolve()
            }
          } catch {}
        }
      }

      es.onerror = () => {
        if (!resolved) {
          // 初始连接阶段出错 — 等待超时处理，不急于 reject
          // （EventSource 会自动重试，timeout 兜底）
          return
        }

        if (this._userInitiatedDisconnect) return

        if (es.readyState === EventSource.CLOSED) {
          // 永久关闭（服务端拒绝或 session 不存在）
          this._connected = false
          this.emit('disconnect', { code: 4900, message: 'Connection closed', userInitiated: false } as DisconnectInfo)
        } else if (es.readyState === EventSource.CONNECTING) {
          this.consecutiveErrors++
          if (this.consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
            // 超过最大重试次数 — 停止自动重连
            es.close()
            this.eventSource = null
            this._connected = false
            this.emit('disconnect', { code: 4901, message: 'Max reconnect attempts reached', userInitiated: false } as DisconnectInfo)
          } else {
            // 短暂断开，EventSource 自动重连中
            this.emit('reconnecting', { attempt: this.consecutiveErrors, maxAttempts: MAX_CONSECUTIVE_ERRORS } as ReconnectInfo)
          }
        }
      }
    })
  }

  /**
   * 处理 SSE 消息
   */
  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data)

      switch (message.type) {
        case 'ready':
          // 等待 mobile 连接
          break

        case 'connect':
          this._connected = true
          this._accounts = [message.address]
          this._chainId = '0x' + message.chainId.toString(16)
          this.emit('connect', { chainId: this._chainId })
          this.emit('accountsChanged', this._accounts)
          break

        case 'disconnect':
          this._connected = false
          // 不清除 accounts/chainId — session 仍然有效，peer 可能重连
          this.emit('disconnect', { code: 4900, message: message.reason || 'Peer disconnected', userInitiated: false } as DisconnectInfo)
          break

        case 'response':
          this.handleResponse(message)
          break

        case 'chainChanged':
          this._chainId = '0x' + message.chainId.toString(16)
          this.emit('chainChanged', this._chainId)
          break

        case 'accountsChanged':
          this._accounts = message.accounts
          this.emit('accountsChanged', this._accounts)
          if (message.accounts.length === 0) {
            this._connected = false
            this.emit('disconnect', { code: 4900, message: 'Wallet disconnected', userInitiated: false } as DisconnectInfo)
          }
          break

        case 'error':
          console.error('[RemoteProvider] Server error:', message)
          break
      }
    } catch (error) {
      console.error('[RemoteProvider] Failed to parse message:', error)
    }
  }

  /**
   * 处理 RPC 响应
   */
  private handleResponse(message: { id: number; result?: unknown; error?: { code: number; message: string } }): void {
    const pending = this.pendingRequests.get(message.id)
    if (!pending) return

    clearTimeout(pending.timeout)
    this.pendingRequests.delete(message.id)

    if (message.error) {
      const error = new Error(message.error.message) as ProviderRpcError
      error.code = message.error.code
      pending.reject(error)
    } else {
      pending.resolve(message.result)
    }
  }

  /**
   * EIP-1193 request 方法
   */
  async request(args: RequestArguments): Promise<unknown> {
    const { method, params } = args

    // 本地处理的方法
    switch (method) {
      case 'eth_accounts':
        return this._accounts

      case 'eth_chainId':
        return this._chainId

      case 'eth_requestAccounts':
        if (this._connected && this._accounts.length > 0) {
          return this._accounts
        }
        // 等待移动端连接
        return new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(this.createError(4001, 'User rejected the request'))
          }, REQUEST_TIMEOUT)

          const handler = (accounts: string[]) => {
            clearTimeout(timeout)
            this.removeListener('accountsChanged', handler)
            resolve(accounts)
          }

          this.on('accountsChanged', handler)
        })

      default:
        break
    }

    // 检查连接状态
    // CLOSED = 永久断开（session 不存在/已终止），拒绝请求
    // CONNECTING = EventSource 临时重连中，仍允许 POST（服务端会排队，SSE 恢复后投递响应）
    if (!this.eventSource || this.eventSource.readyState === EventSource.CLOSED) {
      throw this.createError(-32000, 'Not connected')
    }

    if (!this._connected) {
      throw this.createError(-32000, 'Mobile wallet not connected')
    }

    return this.sendRequest(method, params)
  }

  /**
   * 通过 HTTP POST 发送 RPC 请求到移动端，响应通过 SSE 接收
   */
  private sendRequest(method: string, params?: unknown[] | object): Promise<unknown> {
    const id = ++this.requestId

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id)
        reject(this.createError(-32003, 'Request timeout'))
      }, REQUEST_TIMEOUT)

      this.pendingRequests.set(id, { resolve, reject, timeout })

      fetch(`${this.serverUrl}/message?session=${this.sessionId}&role=dapp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'request', id, method, params: params || [] }),
      }).then(resp => {
        if (!resp.ok) {
          const pending = this.pendingRequests.get(id)
          if (pending) {
            clearTimeout(pending.timeout)
            this.pendingRequests.delete(id)
            resp.json().then((err: any) => {
              pending.reject(this.createError(err.code || -32000, err.message || 'Request failed'))
            }).catch(() => {
              pending.reject(this.createError(-32000, `Request failed: ${resp.status}`))
            })
          }
        }
      }).catch(err => {
        const pending = this.pendingRequests.get(id)
        if (pending) {
          clearTimeout(pending.timeout)
          this.pendingRequests.delete(id)
          pending.reject(this.createError(-32003, 'Network error: ' + err.message))
        }
      })
    })
  }

  /**
   * 创建错误对象
   */
  private createError(code: number, message: string): ProviderRpcError {
    const error = new Error(message) as ProviderRpcError
    error.code = code
    return error
  }

  /**
   * 事件监听
   */
  on(event: EventType, listener: EventListener): void {
    this.eventListeners.get(event)?.add(listener)
  }

  /**
   * 移除事件监听
   */
  removeListener(event: EventType, listener: EventListener): void {
    this.eventListeners.get(event)?.delete(listener)
  }

  /**
   * 触发事件
   */
  private emit(event: EventType, ...args: unknown[]): void {
    this.eventListeners.get(event)?.forEach(listener => {
      try {
        listener(...args)
      } catch (error) {
        console.error(`[RemoteProvider] Event listener error:`, error)
      }
    })
  }

  /**
   * 断开连接
   */
  disconnect(): void {
    this._userInitiatedDisconnect = true

    // 通知服务端（fire-and-forget）
    if (this.sessionId && this.serverUrl) {
      fetch(`${this.serverUrl}/message?session=${this.sessionId}&role=dapp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'disconnect', reason: 'User initiated' }),
      }).catch(() => {})
    }

    // 关闭 SSE 连接
    if (this.eventSource) {
      this.eventSource.close()
      this.eventSource = null
    }

    this._connected = false
    this._accounts = []

    // 拒绝所有 pending 请求
    for (const pending of this.pendingRequests.values()) {
      clearTimeout(pending.timeout)
      pending.reject(this.createError(4900, 'Disconnected'))
    }
    this.pendingRequests.clear()

    // 主动断开：同步触发 disconnect 事件
    this.emit('disconnect', { code: 4900, message: 'User disconnected', userInitiated: true } as DisconnectInfo)
  }

  /**
   * 获取当前状态
   */
  get isConnected(): boolean {
    return this._connected
  }

  get accounts(): string[] {
    return this._accounts
  }

  get chainId(): string {
    return this._chainId
  }

  get session(): { id: string; url: string } {
    return {
      id: this.sessionId,
      url: this.sessionUrl,
    }
  }

  /**
   * 获取用于持久化的 session 数据
   */
  getSessionData(): { serverUrl: string; sessionId: string; sessionUrl: string } {
    return {
      serverUrl: this.serverUrl,
      sessionId: this.sessionId,
      sessionUrl: this.sessionUrl,
    }
  }
}
