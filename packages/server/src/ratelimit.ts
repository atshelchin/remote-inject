/**
 * 简单的滑动窗口速率限制器
 */

interface RateLimitEntry {
  count: number
  resetAt: number
}

export interface RateLimiterConfig {
  windowMs: number    // 时间窗口（毫秒）
  maxRequests: number // 窗口内最大请求数
}

export class RateLimiter {
  private entries = new Map<string, RateLimitEntry>()
  private config: RateLimiterConfig

  constructor(config: RateLimiterConfig) {
    this.config = config
    // 定期清理过期条目
    setInterval(() => this.cleanup(), 60000)
  }

  /**
   * 检查是否允许请求
   * @returns true 如果允许，false 如果超出限制
   */
  check(key: string): boolean {
    const now = Date.now()
    const entry = this.entries.get(key)

    if (!entry || now >= entry.resetAt) {
      // 新窗口
      this.entries.set(key, {
        count: 1,
        resetAt: now + this.config.windowMs,
      })
      return true
    }

    if (entry.count >= this.config.maxRequests) {
      return false
    }

    entry.count++
    return true
  }

  /**
   * 获取剩余配额信息
   */
  getInfo(key: string): { remaining: number; resetAt: number } {
    const now = Date.now()
    const entry = this.entries.get(key)

    if (!entry || now >= entry.resetAt) {
      return {
        remaining: this.config.maxRequests,
        resetAt: now + this.config.windowMs,
      }
    }

    return {
      remaining: Math.max(0, this.config.maxRequests - entry.count),
      resetAt: entry.resetAt,
    }
  }

  private cleanup(): void {
    const now = Date.now()
    for (const [key, entry] of this.entries) {
      if (now >= entry.resetAt) {
        this.entries.delete(key)
      }
    }
  }
}

// 预配置的限制器
export const sessionRateLimiter = new RateLimiter({
  windowMs: 60000,    // 1 分钟
  maxRequests: 10,    // 每分钟最多创建 10 个 session
})

// 获取客户端 IP（支持代理）
export function getClientIP(request: Request): string {
  // 优先使用代理转发的真实 IP
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }
  const realIP = request.headers.get('x-real-ip')
  if (realIP) {
    return realIP
  }
  // 回退到连接 IP（Bun/Elysia 可能不提供）
  return 'unknown'
}
