/**
 * Session Pool - 会话池
 *
 * 为每个 Engine 维护独立的 Session 池，支持 Session 复用。
 * Task 完成后 Session 回收，abort/dispose 行为明确。
 *
 * SessionPool 与 TaskQueue 的关系：
 * - TaskQueue: 负责任务调度和并发控制
 * - SessionPool: 负责管理 Session 生命周期，减少创建开销
 * - TaskQueue 通过 SessionPool 获取/归还 Session
 */

import type { AISession, AISessionConfig } from './session'
import type { AIEngine } from './engine'

/**
 * 池中的 Session 包装
 */
interface PooledSession {
  /** Session 实例 */
  session: AISession
  /** 是否正在使用 */
  inUse: boolean
  /** 创建时间 */
  createdAt: number
  /** 最后使用时间 */
  lastUsedAt: number
  /** 使用次数 */
  useCount: number
  /** Session 配置 */
  config: AISessionConfig
}

/**
 * Session 池状态
 */
export interface SessionPoolStats {
  /** 总 Session 数 */
  total: number
  /** 空闲 Session 数 */
  idle: number
  /** 使用中 Session 数 */
  inUse: number
  /** 创建总数 */
  created: number
  /** 销毁总数 */
  destroyed: number
  /** 获取总数 */
  acquired: number
  /** 释放总数 */
  released: number
}

/**
 * Session 池配置
 */
export interface SessionPoolConfig {
  /** 最大池大小（默认 5） */
  maxPoolSize?: number
  /** 最小池大小（默认 0） */
  minPoolSize?: number
  /** Session 最大空闲时间（毫秒，默认 5 分钟） */
  maxIdleTime?: number
  /** Session 最大生命周期（毫秒，默认 30 分钟） */
  maxSessionLifetime?: number
  /** 是否启用调试日志 */
  debug?: boolean
  /** Session 创建钩子 */
  onSessionCreate?(session: AISession): void
  /** Session 销毁钩子 */
  onSessionDestroy?(session: AISession): void
}

/**
 * Session 过期策略
 */
export type ExpireStrategy = 'idle' | 'lifetime' | 'never'

/**
 * Session 池
 *
 * 为单个 Engine 管理 Session 池。
 */
export class SessionPool {
  private engine: AIEngine
  private config: SessionPoolConfig
  private sessions: PooledSession[] = []
  private stats: SessionPoolStats = {
    total: 0,
    idle: 0,
    inUse: 0,
    created: 0,
    destroyed: 0,
    acquired: 0,
    released: 0,
  }

  constructor(engine: AIEngine, config?: SessionPoolConfig) {
    this.engine = engine

    this.config = {
      maxPoolSize: 5,
      minPoolSize: 0,
      maxIdleTime: 5 * 60 * 1000, // 5 分钟
      maxSessionLifetime: 30 * 60 * 1000, // 30 分钟
      debug: false,
      ...config,
    }

    this.log(`SessionPool created for engine "${engine.id}"`)
  }

  /**
   * 调试日志
   */
  private log(message: string): void {
    if (this.config.debug) {
      console.log(`[SessionPool:${this.engine.id}] ${message}`)
    }
  }

  /**
   * 更新统计
   */
  private updateStats(): void {
    this.stats.total = this.sessions.length
    this.stats.idle = this.sessions.filter((s) => !s.inUse).length
    this.stats.inUse = this.sessions.filter((s) => s.inUse).length
  }

  /**
   * 检查 Session 是否过期
   */
  private isExpired(pooled: PooledSession): boolean {
    const now = Date.now()
    const maxLifetime = this.config.maxSessionLifetime ?? 30 * 60 * 1000
    const maxIdle = this.config.maxIdleTime ?? 5 * 60 * 1000

    // 检查最大生命周期
    if (now - pooled.createdAt > maxLifetime) {
      return true
    }

    // 检查最大空闲时间（仅对空闲 Session）
    if (!pooled.inUse && now - pooled.lastUsedAt > maxIdle) {
      return true
    }

    return false
  }

  /**
   * 创建新 Session
   */
  private createSession(config?: AISessionConfig): PooledSession {
    const session = this.engine.createSession(config)
    const pooled: PooledSession = {
      session,
      inUse: true,
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
      useCount: 0,
      config: config || {},
    }

    this.sessions.push(pooled)
    this.stats.created++
    this.updateStats()

    this.log(
      `Session created (total: ${this.stats.total}, inUse: ${this.stats.inUse + 1})`
    )

    // 触发创建钩子
    if (this.config.onSessionCreate) {
      try {
        this.config.onSessionCreate(session)
      } catch (e) {
        console.error('[SessionPool] onSessionCreate error:', e)
      }
    }

    return pooled
  }

  /**
   * 销毁 Session
   */
  private destroySession(pooled: PooledSession): void {
    const index = this.sessions.indexOf(pooled)
    if (index !== -1) {
      this.sessions.splice(index, 1)
    }

    try {
      pooled.session.dispose()
    } catch (e) {
      console.error('[SessionPool] Session dispose error:', e)
    }

    this.stats.destroyed++
    this.updateStats()

    this.log(
      `Session destroyed (total: ${this.stats.total}, inUse: ${this.stats.inUse})`
    )

    // 触发销毁钩子
    if (this.config.onSessionDestroy) {
      try {
        this.config.onSessionDestroy(pooled.session)
      } catch (e) {
        console.error('[SessionPool] onSessionDestroy error:', e)
      }
    }
  }

  /**
   * 清理过期 Session
   */
  private cleanupExpired(): void {
    const expired = this.sessions.filter((s) => !s.inUse && this.isExpired(s))

    for (const pooled of expired) {
      this.destroySession(pooled)
    }
  }

  /**
   * 获取一个 Session
   *
   * @param config 可选的 Session 配置
   * @returns AISession 实例
   */
  acquire(config?: AISessionConfig): AISession {
    // 清理过期 Session
    this.cleanupExpired()

    // 尝试从池中获取空闲 Session
    const idleSession = this.sessions.find((s) => !s.inUse)

    if (idleSession) {
      idleSession.inUse = true
      idleSession.lastUsedAt = Date.now()
      idleSession.useCount++
      this.stats.acquired++
      this.updateStats()

      this.log(
        `Session acquired (id: ${idleSession.session.id}, useCount: ${idleSession.useCount})`
      )
      return idleSession.session
    }

    // 池中没有空闲 Session，创建新的
    const pooled = this.createSession(config)
    pooled.useCount = 1
    this.stats.acquired++

    return pooled.session
  }

  /**
   * 归还 Session
   *
   * @param session 要归还的 Session
   * @param dispose 是否销毁 Session（默认 false）
   */
  release(session: AISession, dispose = false): void {
    const pooled = this.sessions.find((s) => s.session.id === session.id)

    if (!pooled) {
      this.log(`Session not found in pool: ${session.id}`)
      return
    }

    if (!pooled.inUse) {
      this.log(`Session already idle: ${session.id}`)
      return
    }

    pooled.inUse = false
    pooled.lastUsedAt = Date.now()
    this.stats.released++
    this.updateStats()

    this.log(`Session released (id: ${session.id})`)

    // 如果标记为销毁，或池已满，则销毁
    const maxPoolSize = this.config.maxPoolSize ?? 5
    if (dispose || this.sessions.length > maxPoolSize) {
      this.destroySession(pooled)
    }
  }

  /**
   * 中断并归还 Session
   *
   * @param session 要中断的 Session
   * @param taskId 任务 ID
   */
  abortAndRelease(session: AISession, taskId?: string): void {
    try {
      session.abort(taskId)
    } catch (e) {
      console.error('[SessionPool] Session abort error:', e)
    }

    this.release(session)
  }

  /**
   * 获取池状态
   */
  getStats(): SessionPoolStats {
    this.updateStats()
    return { ...this.stats }
  }

  /**
   * 获取池大小配置
   */
  getConfig(): SessionPoolConfig {
    return { ...this.config }
  }

  /**
   * 清空池
   *
   * @param disposeIdle 是否销毁空闲 Session（默认 true）
   */
  clear(disposeIdle = true): void {
    if (disposeIdle) {
      const idle = this.sessions.filter((s) => !s.inUse)
      for (const pooled of idle) {
        this.destroySession(pooled)
      }
    }

    this.log(`Pool cleared (remaining: ${this.sessions.length})`)
  }

  /**
   * 销毁池
   *
   * 销毁所有 Session，包括正在使用的。
   */
  dispose(): void {
    this.log('Disposing SessionPool...')

    // 复制数组避免在迭代中修改
    const toDestroy = [...this.sessions]

    for (const pooled of toDestroy) {
      this.destroySession(pooled)
    }

    this.sessions = []
    this.updateStats()
  }

  /**
   * 预热池（创建最小数量的 Session）
   */
  async warmup(config?: AISessionConfig): Promise<void> {
    const minPoolSize = this.config.minPoolSize ?? 0
    const targetSize = Math.max(minPoolSize, 1)
    const currentIdle = this.sessions.filter((s) => !s.inUse).length

    const toCreate = Math.max(0, targetSize - currentIdle)

    for (let i = 0; i < toCreate; i++) {
      const pooled = this.createSession(config)
      pooled.inUse = false
      pooled.lastUsedAt = Date.now()
      this.stats.released++ // 平衡计数
      this.updateStats()
    }

    this.log(`Pool warmed up (created ${toCreate} sessions)`)
  }

  /**
   * 获取指定 Session 的详细信息
   */
  getSessionInfo(sessionId: string): {
    exists: boolean
    inUse: boolean
    useCount: number
    age: number
    idleTime: number
  } | null {
    const pooled = this.sessions.find((s) => s.session.id === sessionId)

    if (!pooled) {
      return null
    }

    const now = Date.now()
    return {
      exists: true,
      inUse: pooled.inUse,
      useCount: pooled.useCount,
      age: now - pooled.createdAt,
      idleTime: pooled.inUse ? 0 : now - pooled.lastUsedAt,
    }
  }

  /**
   * 获取关联的 Engine
   */
  getEngine(): AIEngine {
    return this.engine
  }

  /**
   * 获取池中的所有 Session（包括使用中的）
   */
  getAllSessions(): AISession[] {
    return this.sessions.map((s) => s.session)
  }

  /**
   * 获取空闲 Session 数
   */
  getIdleCount(): number {
    return this.sessions.filter((s) => !s.inUse).length
  }

  /**
   * 获取使用中 Session 数
   */
  getInUseCount(): number {
    return this.sessions.filter((s) => s.inUse).length
  }

  /**
   * 检查是否有空闲 Session
   */
  hasIdleSession(): boolean {
    return this.sessions.some((s) => !s.inUse)
  }

  /**
   * 获取池大小
   */
  size(): number {
    return this.sessions.length
  }

  /**
   * 检查池是否为空
   */
  isEmpty(): boolean {
    return this.sessions.length === 0
  }

  /**
   * 检查池已满
   */
  isFull(): boolean {
    const maxPoolSize = this.config.maxPoolSize ?? 5
    return this.sessions.length >= maxPoolSize
  }
}

/**
 * Session Pool 管理器
 *
 * 管理多个 Engine 的 Session Pool。
 */
export class SessionPoolManager {
  private pools = new Map<string, SessionPool>()
  private config: SessionPoolConfig

  constructor(config?: SessionPoolConfig) {
    this.config = config || {}
  }

  /**
   * 获取或创建 Engine 的 Session Pool
   */
  getPool(engine: AIEngine, config?: SessionPoolConfig): SessionPool {
    let pool = this.pools.get(engine.id)

    if (!pool) {
      pool = new SessionPool(engine, { ...this.config, ...config })
      this.pools.set(engine.id, pool)
    }

    return pool
  }

  /**
   * 移除 Engine 的 Session Pool
   */
  removePool(engineId: string): boolean {
    const pool = this.pools.get(engineId)

    if (pool) {
      pool.dispose()
      this.pools.delete(engineId)
      return true
    }

    return false
  }

  /**
   * 获取所有 Pool 的统计
   */
  getAllStats(): Map<string, SessionPoolStats> {
    const stats = new Map<string, SessionPoolStats>()

    for (const [engineId, pool] of this.pools) {
      stats.set(engineId, pool.getStats())
    }

    return stats
  }

  /**
   * 清空所有 Pool
   */
  clearAll(): void {
    for (const pool of this.pools.values()) {
      pool.clear()
    }
  }

  /**
   * 销毁所有 Pool
   */
  dispose(): void {
    for (const pool of this.pools.values()) {
      pool.dispose()
    }
    this.pools.clear()
  }

  /**
   * 预热所有 Pool
   */
  async warmupAll(config?: AISessionConfig): Promise<void> {
    const promises = Array.from(this.pools.values()).map((pool) => pool.warmup(config))
    await Promise.all(promises)
  }

  /**
   * 获取 Pool 数量
   */
  size(): number {
    return this.pools.size
  }
}

/**
 * 全局 Session Pool 管理器
 */
let globalPoolManager: SessionPoolManager | null = null

/**
 * 获取全局 Session Pool 管理器
 */
export function getSessionPoolManager(config?: SessionPoolConfig): SessionPoolManager {
  if (!globalPoolManager) {
    globalPoolManager = new SessionPoolManager(config)
  }
  return globalPoolManager
}

/**
 * 重置全局 Session Pool 管理器
 */
export function resetSessionPoolManager(): void {
  if (globalPoolManager) {
    globalPoolManager.dispose()
    globalPoolManager = null
  }
}

/**
 * 快捷函数：从 Engine 获取 Session
 */
export function acquireSession(
  engine: AIEngine,
  config?: AISessionConfig
): AISession {
  const manager = getSessionPoolManager()
  const pool = manager.getPool(engine)
  return pool.acquire(config)
}

/**
 * 快捷函数：归还 Session 到 Engine 的池
 */
export function releaseSession(
  engine: AIEngine,
  session: AISession,
  dispose?: boolean
): void {
  const manager = getSessionPoolManager()
  const pool = manager.getPool(engine)
  pool.release(session, dispose)
}

/**
 * 快捷函数：中断并归还 Session
 */
export function abortAndReleaseSession(
  engine: AIEngine,
  session: AISession,
  taskId?: string
): void {
  const manager = getSessionPoolManager()
  const pool = manager.getPool(engine)
  pool.abortAndRelease(session, taskId)
}
