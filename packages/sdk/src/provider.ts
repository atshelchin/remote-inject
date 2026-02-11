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

export class RemoteProvider {
  private ws: WebSocket | null = null
  private serverUrl: string = ''
  private sessionId: string = ''
  private sessionUrl: string = ''
  private requestId: number = 0
  private pendingRequests: Map<number, PendingRequest> = new Map()
  private eventListeners: Map<EventType, Set<EventListener>> = new Map()

  private _chainId: string = '0x1'
  private _accounts: string[] = []
  private _connected: boolean = false

  // 重连相关
  private _userInitiatedDisconnect: boolean = false
  private _reconnectAttempts: number = 0
  private _maxReconnectAttempts: number = 5
  private _reconnectDelay: number = 1000
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null

  // 暴露给外部检查重连状态
  get _reconnecting(): boolean {
    return this._reconnectAttempts > 0 && this._reconnectAttempts < this._maxReconnectAttempts
  }

  constructor() {
    // 初始化事件监听器容器
    const events: EventType[] = ['connect', 'disconnect', 'chainChanged', 'accountsChanged', 'message', 'reconnecting']
    events.forEach(event => this.eventListeners.set(event, new Set()))
  }

  /**
   * 连接到 Remote Inject Server
   * @param serverUrl - 服务器地址
   * @param metadata - DApp 元数据（可选），会显示在移动钱包的确认页面上
   */
  async connect(serverUrl: string, metadata?: DAppMetadata): Promise<{ sessionId: string; url: string }> {
    this.serverUrl = serverUrl.replace(/\/$/, '')
    this._userInitiatedDisconnect = false
    this._reconnectAttempts = 0

    // 创建 Session（传递 DApp 元数据）
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

    // 连接 WebSocket
    await this.connectWebSocket()

    return {
      sessionId: this.sessionId,
      url: this.sessionUrl,
    }
  }

  /**
   * 恢复已存在的 Session
   * @param sessionData - 之前保存的session数据
   */
  async resumeSession(sessionData: { serverUrl: string; sessionId: string; sessionUrl: string }): Promise<void> {
    this.serverUrl = sessionData.serverUrl.replace(/\/$/, '')
    this.sessionId = sessionData.sessionId
    this.sessionUrl = sessionData.sessionUrl
    this._userInitiatedDisconnect = false
    this._reconnectAttempts = 0

    // 先检查session是否还存在
    const checkRes = await fetch(`${this.serverUrl}/session/${this.sessionId}`)
    if (!checkRes.ok) {
      throw new Error('Session not found or expired')
    }

    // 连接 WebSocket
    await this.connectWebSocket()
  }

  /**
   * 连接 WebSocket
   */
  private connectWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      const wsUrl = this.serverUrl.replace(/^http/, 'ws')
      this.ws = new WebSocket(`${wsUrl}/ws?session=${this.sessionId}&role=dapp`)

      const timeout = setTimeout(() => {
        reject(new Error('WebSocket connection timeout'))
        this.ws?.close()
      }, 10000)

      this.ws.onopen = () => {
        clearTimeout(timeout)
        this._reconnectAttempts = 0  // 连接成功，重置重连计数
        console.log('[RemoteProvider] WebSocket connected')
      }

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data)
        // ready 消息后 resolve
        try {
          const msg = JSON.parse(event.data)
          if (msg.type === 'ready') {
            resolve()
          }
        } catch {}
      }

      this.ws.onclose = (event) => {
        // 清除超时定时器（如果还在初始连接阶段）
        clearTimeout(timeout)

        // 用户主动断开，不重连
        if (this._userInitiatedDisconnect) {
          this._connected = false
          this.emit('disconnect', { code: 4900, message: 'User disconnected', userInitiated: true } as DisconnectInfo)
          return
        }

        // Session被拒绝（1008）或其他致命错误，不重连
        if (event.code === 1008) {
          this._connected = false
          this.emit('disconnect', { code: event.code, message: 'Session rejected', userInitiated: false } as DisconnectInfo)
          return
        }

        // 尝试重连
        if (this._reconnectAttempts < this._maxReconnectAttempts) {
          this._reconnectAttempts++
          const delay = this._reconnectDelay * Math.pow(1.5, this._reconnectAttempts - 1)

          console.log(`[RemoteProvider] Connection lost, reconnecting in ${delay}ms (attempt ${this._reconnectAttempts}/${this._maxReconnectAttempts})`)

          this.emit('reconnecting', { attempt: this._reconnectAttempts, maxAttempts: this._maxReconnectAttempts } as ReconnectInfo)

          this._reconnectTimer = setTimeout(() => {
            if (!this._userInitiatedDisconnect) {
              this.connectWebSocket().catch(err => {
                console.error('[RemoteProvider] Reconnection failed:', err)
                // 重连失败会触发onclose，进入下一次重连尝试
              })
            }
          }, delay)
        } else {
          // 达到最大重连次数
          this._connected = false
          this.emit('disconnect', { code: 4900, message: 'Connection lost after max reconnect attempts', userInitiated: false } as DisconnectInfo)
        }
      }

      this.ws.onerror = (error) => {
        console.error('[RemoteProvider] WebSocket error:', error)
        // onerror后会触发onclose，在那里处理重连
      }
    })
  }

  /**
   * 处理 WebSocket 消息
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
          this._accounts = []
          // peer断开，标记为非用户主动，允许后续重连
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

      case 'wallet_switchEthereumChain':
      case 'wallet_addEthereumChain':
      case 'personal_sign':
      case 'eth_signTypedData_v4':
      case 'eth_sendTransaction':
      case 'eth_sign':
        // 这些方法需要转发到移动端
        break

      default:
        // 其他方法也转发
        break
    }

    // 检查连接状态
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw this.createError(-32000, 'Not connected')
    }

    if (!this._connected) {
      throw this.createError(-32000, 'Mobile wallet not connected')
    }

    // 发送请求
    return this.sendRequest(method, params)
  }

  /**
   * 发送 RPC 请求到移动端
   */
  private sendRequest(method: string, params?: unknown[] | object): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = ++this.requestId

      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id)
        reject(this.createError(-32003, 'Request timeout'))
      }, REQUEST_TIMEOUT)

      this.pendingRequests.set(id, { resolve, reject, timeout })

      this.ws!.send(JSON.stringify({
        type: 'request',
        id,
        method,
        params: params || [],
      }))
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

    // 清除重连定时器
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer)
      this._reconnectTimer = null
    }

    if (this.ws) {
      try {
        this.ws.send(JSON.stringify({ type: 'disconnect', reason: 'User initiated' }))
      } catch (e) {
        // WebSocket可能已关闭
      }
      this.ws.close()
      this.ws = null
    }
    this._connected = false
    this._accounts = []
    this._reconnectAttempts = 0
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
   * 获取用于持久化的session数据
   */
  getSessionData(): { serverUrl: string; sessionId: string; sessionUrl: string } {
    return {
      serverUrl: this.serverUrl,
      sessionId: this.sessionId,
      sessionUrl: this.sessionUrl,
    }
  }
}
