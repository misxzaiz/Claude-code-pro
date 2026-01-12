/**
 * AI Task Queue - 任务队列（事件驱动版本）
 *
 * 管理和调度 AI 任务的执行，支持并发控制。
 * UI 无感知，纯逻辑层。
 *
 * 对外只暴露 AIEvent 事件流，不再使用回调模式。
 *
 * 多 Engine 支持：
 * - Task 中可指定 engineId
 * - Queue 根据 engineId 从 EngineRegistry 获取 Engine
 * - 通过 SessionPool 复用 Session
 *
 * SessionPool 与 TaskQueue 的关系：
 * - TaskQueue: 负责任务调度和并发控制
 * - SessionPool: 负责 Session 生命周期管理
 * - TaskQueue 通过 SessionPool 获取/归还 Session
 */

import type { AISession, AISessionConfig } from './session'
import type { AITask } from './task'
import type { AIEvent, TaskStatus } from './event'
import type { AIEngine } from './engine'
import type { SessionPoolManager, SessionPoolConfig } from './session-pool'
import { getEventBus, type EventBus } from './event-bus'
import { getEngineRegistry } from './engine-registry'
import { getSessionPoolManager } from './session-pool'

/** 默认 Engine ID */
const DEFAULT_ENGINE_ID = 'claude-code'

/**
 * 队列中任务的状态（内部使用）
 */
export type QueuedTaskStatus = TaskStatus

/**
 * 队列中的任务项（内部使用）
 */
interface QueuedTask {
  /** 任务 ID */
  id: string
  /** 任务本体 */
  task: AITask
  /** 执行该任务的 Engine */
  engine: AIEngine
  /** 执行该任务的 Session */
  session?: AISession
  /** Session 配置 */
  sessionConfig?: AISessionConfig
  /** 当前状态 */
  status: QueuedTaskStatus
  /** 开始时间 */
  startTime?: number
  /** 结束时间 */
  endTime?: number
  /** 错误信息 */
  error?: string
  /** AbortController 用于取消任务 */
  abortController: AbortController
}

/**
 * TaskQueue 配置
 */
export interface TaskQueueConfig {
  /** 最大并发数（默认 1） */
  maxParallel?: number
  /** 是否启用调试日志 */
  debug?: boolean
  /** 事件总线（可选，不传则使用全局 EventBus） */
  eventBus?: EventBus
  /** 默认 Session 配置 */
  sessionConfig?: AISessionConfig
  /** Session Pool 配置 */
  sessionPoolConfig?: SessionPoolConfig
  /** Session Pool 管理器（可选，不传则使用全局） */
  sessionPoolManager?: SessionPoolManager
  /** 是否启用 Session Pool（默认 true） */
  enableSessionPool?: boolean
}

/**
 * AI 任务队列（事件驱动版本）
 *
 * 负责管理 AI 任务的调度和执行，支持并发控制。
 * 所有状态变更通过 AIEvent 发送到 EventBus。
 */
export class TaskQueue {
  private pendingTasks: QueuedTask[] = []
  private runningTasks: Map<string, QueuedTask> = new Map()
  private maxParallel: number
  private debug: boolean
  private eventBus: EventBus
  private isProcessing: boolean = false
  private defaultSessionConfig?: AISessionConfig
  private sessionPoolManager: SessionPoolManager
  private enableSessionPool: boolean

  constructor(config?: TaskQueueConfig) {
    this.maxParallel = config?.maxParallel ?? 1
    this.debug = config?.debug ?? false
    this.eventBus = config?.eventBus ?? getEventBus()
    this.defaultSessionConfig = config?.sessionConfig
    this.sessionPoolManager = config?.sessionPoolManager || getSessionPoolManager(config?.sessionPoolConfig)
    this.enableSessionPool = config?.enableSessionPool ?? true
    this.log(`TaskQueue created with maxParallel=${this.maxParallel}, sessionPool=${this.enableSessionPool}`)
  }

  /**
   * 发送 AIEvent
   */
  private emit(event: AIEvent): void {
    this.eventBus.emit(event)
  }

  /**
   * 调试日志
   */
  private log(message: string): void {
    if (this.debug) {
      console.log(`[TaskQueue] ${message}`)
    }
  }

  /**
   * 根据 engineId 获取 Engine
   */
  private getEngineForTask(task: AITask): AIEngine {
    const registry = getEngineRegistry()
    const engineId = task.engineId || DEFAULT_ENGINE_ID

    const engine = registry.get(engineId)
    if (!engine) {
      throw new Error(`Engine not found: ${engineId}`)
    }

    return engine
  }

  /**
   * 为任务获取 Session（通过 Pool 或直接创建）
   */
  private async acquireSessionForTask(queuedTask: QueuedTask): Promise<AISession> {
    const { task, engine, sessionConfig } = queuedTask

    // 合并默认配置和任务配置
    const config: AISessionConfig = {
      ...this.defaultSessionConfig,
      ...sessionConfig,
    }

    if (this.enableSessionPool) {
      // 从 SessionPool 获取
      const pool = this.sessionPoolManager.getPool(engine)
      const session = pool.acquire(config)
      this.log(`Session acquired from pool for task ${task.id}, engine ${engine.id}`)
      return session
    } else {
      // 直接创建新 Session
      const session = engine.createSession(config)
      this.log(`Session created for task ${task.id} using engine ${engine.id}`)
      return session
    }
  }

  /**
   * 归还 Session 到 Pool
   */
  private releaseSessionToPool(engine: AIEngine, session: AISession): void {
    if (this.enableSessionPool) {
      const pool = this.sessionPoolManager.getPool(engine)
      pool.release(session)
      this.log(`Session released to pool, engine ${engine.id}`)
    } else {
      // 不使用 Pool 时直接销毁
      session.dispose()
    }
  }

  /**
   * 中断 Session 并归还到 Pool
   */
  private abortAndReleaseSessionFromPool(engine: AIEngine, session: AISession, taskId?: string): void {
    if (this.enableSessionPool) {
      const pool = this.sessionPoolManager.getPool(engine)
      pool.abortAndRelease(session, taskId)
      this.log(`Session aborted and released to pool, engine ${engine.id}`)
    } else {
      try {
        session.abort(taskId)
      } catch (e) {
        console.error('[TaskQueue] Session abort error:', e)
      }
      session.dispose()
    }
  }

  /**
   * 入队任务（新 API：不需要传入 Session）
   *
   * @param task 要执行的任务
   * @param sessionConfig 可选的 Session 配置
   * @returns 任务 ID
   */
  enqueue(task: AITask, sessionConfig?: AISessionConfig): string {
    // 获取 Engine
    const engine = this.getEngineForTask(task)

    const queuedTask: QueuedTask = {
      id: task.id,
      task,
      engine,
      sessionConfig,
      status: 'pending',
      abortController: new AbortController(),
    }

    this.pendingTasks.push(queuedTask)
    this.log(
      `Task enqueued: ${task.id}, engine: ${engine.id}, queue size: ${this.pendingTasks.length}`
    )

    // 发送 Task 元数据事件（pending 状态）
    this.emit({
      type: 'task_metadata',
      taskId: task.id,
      status: 'pending',
    })

    // 发送进度事件
    this.emit({
      type: 'task_progress',
      taskId: task.id,
      message: `任务已加入队列（使用 ${engine.name}），当前队列长度: ${this.pendingTasks.length}`,
    })

    // 触发处理
    this.schedule()

    return task.id
  }

  /**
   * 入队任务（旧 API：兼容已有的传入 Session 的方式）
   *
   * @deprecated 使用 enqueue(task, sessionConfig) 代替
   */
  enqueueWithSession(task: AITask, session: AISession): string {
    const engine = this.getEngineForTask(task)

    const queuedTask: QueuedTask = {
      id: task.id,
      task,
      engine,
      session,
      status: 'pending',
      abortController: new AbortController(),
    }

    this.pendingTasks.push(queuedTask)
    this.log(
      `Task enqueued (with session): ${task.id}, engine: ${engine.id}, queue size: ${this.pendingTasks.length}`
    )

    // 发送 Task 元数据事件（pending 状态）
    this.emit({
      type: 'task_metadata',
      taskId: task.id,
      status: 'pending',
    })

    // 发送进度事件
    this.emit({
      type: 'task_progress',
      taskId: task.id,
      message: `任务已加入队列，当前队列长度: ${this.pendingTasks.length}`,
    })

    // 触发处理
    this.schedule()

    return task.id
  }

  /**
   * 取消任务
   *
   * @param taskId 任务 ID
   * @returns 是否成功取消
   */
  cancel(taskId: string): boolean {
    // 检查 pending 任务
    const pendingIndex = this.pendingTasks.findIndex((t) => t.id === taskId)
    if (pendingIndex !== -1) {
      const queuedTask = this.pendingTasks.splice(pendingIndex, 1)[0]
      queuedTask.status = 'canceled'

      this.emit({
        type: 'task_canceled',
        taskId,
        reason: '用户取消',
      })

      this.emit({
        type: 'task_metadata',
        taskId,
        status: 'canceled',
      })

      this.log(`Task canceled (pending): ${taskId}`)
      return true
    }

    // 检查 running 任务
    const runningTask = this.runningTasks.get(taskId)
    if (runningTask) {
      runningTask.abortController.abort()

      // 中断 Session 并归还到 Pool
      if (runningTask.session) {
        this.abortAndReleaseSessionFromPool(runningTask.engine, runningTask.session, taskId)
      }

      runningTask.status = 'canceled'
      this.runningTasks.delete(taskId)

      this.emit({
        type: 'task_canceled',
        taskId,
        reason: '用户取消',
      })

      this.emit({
        type: 'task_metadata',
        taskId,
        status: 'canceled',
        endTime: Date.now(),
        duration: runningTask.startTime ? Date.now() - runningTask.startTime : undefined,
      })

      this.log(`Task canceled (running): ${taskId}`)
      // 触发处理，可能有待执行的任务
      this.schedule()
      return true
    }

    this.log(`Task not found for cancellation: ${taskId}`)
    return false
  }

  /**
   * 获取任务状态（内部方法，不暴露给 UI）
   */
  getStatus(taskId: string): QueuedTaskStatus | undefined {
    // 检查 pending
    const pending = this.pendingTasks.find((t) => t.id === taskId)
    if (pending) return pending.status

    // 检查 running
    const running = this.runningTasks.get(taskId)
    if (running) return running.status

    return undefined
  }

  /**
   * 获取队列统计（内部方法）
   */
  getStats(): {
    pending: number
    running: number
  } {
    return {
      pending: this.pendingTasks.length,
      running: this.runningTasks.size,
    }
  }

  /**
   * 清空队列（只清空未执行的任务）
   */
  clear(): number {
    const count = this.pendingTasks.length
    // 取消所有 pending 任务
    this.pendingTasks.forEach((task) => {
      task.abortController.abort()
      this.emit({
        type: 'task_canceled',
        taskId: task.id,
        reason: '队列已清空',
      })
    })
    this.pendingTasks = []
    this.log(`Queue cleared, removed ${count} pending tasks`)
    return count
  }

  /**
   * 销毁队列，取消所有任务
   */
  dispose(): void {
    this.log('Disposing TaskQueue...')

    // 取消所有 pending 任务
    this.pendingTasks.forEach((task) => {
      task.abortController.abort()
    })
    this.pendingTasks = []

    // 取消所有 running 任务并归还/清理 Session
    this.runningTasks.forEach((task) => {
      task.abortController.abort()
      if (task.session) {
        this.abortAndReleaseSessionFromPool(task.engine, task.session, task.id)
      }
    })
    this.runningTasks.clear()
  }

  /**
   * 调度器
   *
   * 核心调度逻辑：当有空闲槽位时，从 pending 取出任务执行
   */
  private schedule(): void {
    if (this.isProcessing) {
      return
    }

    this.isProcessing = true

    // 使用 async/await 但不阻塞
    this.processQueue().catch((error) => {
      this.log(`Schedule error: ${error}`)
      this.isProcessing = false
    })
  }

  /**
   * 处理队列
   */
  private async processQueue(): Promise<void> {
    while (this.pendingTasks.length > 0 && this.runningTasks.size < this.maxParallel) {
      const queuedTask = this.pendingTasks.shift()
      if (!queuedTask) break

      await this.executeTask(queuedTask)
    }

    this.isProcessing = false
  }

  /**
   * 执行单个任务
   */
  private async executeTask(queuedTask: QueuedTask): Promise<void> {
    const { id, task, engine, abortController } = queuedTask

    queuedTask.status = 'running'
    queuedTask.startTime = Date.now()
    this.runningTasks.set(id, queuedTask)

    this.log(
      `Task started: ${id}, engine: ${engine.id}, running: ${this.runningTasks.size}/${this.maxParallel}`
    )

    // 发送 Task 元数据事件（running 状态）
    this.emit({
      type: 'task_metadata',
      taskId: id,
      status: 'running',
      startTime: queuedTask.startTime,
    })

    // 发送进度事件
    this.emit({
      type: 'task_progress',
      taskId: id,
      message: `任务开始执行（使用 ${engine.name}）`,
    })

    try {
      // 检查是否已被取消
      if (abortController.signal.aborted) {
        throw new Error('Task canceled before execution')
      }

      // 获取 Session（从 Pool 或创建新的）
      if (!queuedTask.session) {
        queuedTask.session = await this.acquireSessionForTask(queuedTask)
      }

      const session = queuedTask.session

      // 执行任务：遍历 AsyncIterable<AIEvent>
      const eventStream = session.run(task)

      for await (const event of eventStream) {
        // 检查取消信号
        if (abortController.signal.aborted) {
          this.completeTask(queuedTask, 'canceled')
          return
        }

        // 直接转发 Session 发出的事件
        this.emit(event)
      }

      // 正常完成
      this.completeTask(queuedTask, 'success')
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      queuedTask.error = errorMsg
      this.completeTask(queuedTask, 'error', errorMsg)
    }
  }

  /**
   * 完成任务清理
   */
  private completeTask(
    queuedTask: QueuedTask,
    status: Exclude<QueuedTaskStatus, 'pending' | 'running'>,
    error?: string
  ): void {
    const { id, startTime, session, engine } = queuedTask

    queuedTask.status = status
    queuedTask.endTime = Date.now()
    this.runningTasks.delete(id)

    const duration = startTime ? queuedTask.endTime - startTime : undefined

    // 处理 Session 生命周期
    if (session) {
      if (status === 'canceled') {
        // 取消时中断并归还 Session
        this.abortAndReleaseSessionFromPool(engine, session, id)
      } else if (status === 'error') {
        // 错误时归还 Session（可能重用）
        this.releaseSessionToPool(engine, session)
      } else {
        // 成功时归还 Session（可复用）
        this.releaseSessionToPool(engine, session)
      }
    }

    // 发送 Task 元数据事件（最终状态）
    this.emit({
      type: 'task_metadata',
      taskId: id,
      status,
      startTime,
      endTime: queuedTask.endTime,
      duration,
      error,
    })

    // 发送 Task 完成事件
    if (status === 'success') {
      this.emit({
        type: 'task_completed',
        taskId: id,
        status: 'success',
        duration,
      })
      this.log(`Task completed: ${id}, duration: ${duration}ms`)
    } else if (status === 'error') {
      this.emit({
        type: 'task_completed',
        taskId: id,
        status: 'error',
        duration,
        error,
      })

      // 发送错误事件
      this.emit({
        type: 'error',
        error: error || '任务执行失败',
      })
      this.log(`Task error: ${id}, ${error}`)
    } else if (status === 'canceled') {
      this.emit({
        type: 'task_canceled',
        taskId: id,
      })
      this.log(`Task canceled: ${id}`)
    }

    // 继续调度
    this.schedule()
  }

  /**
   * 等待所有任务完成
   */
  async waitIdle(): Promise<void> {
    while (this.pendingTasks.length > 0 || this.runningTasks.size > 0) {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }
}

/**
 * 创建 TaskQueue 的工厂函数
 */
export function createTaskQueue(config?: TaskQueueConfig): TaskQueue {
  return new TaskQueue(config)
}

/**
 * 全局单例 TaskQueue
 */
let globalTaskQueue: TaskQueue | null = null

/**
 * 获取全局 TaskQueue 单例
 */
export function getTaskQueue(config?: TaskQueueConfig): TaskQueue {
  if (!globalTaskQueue) {
    globalTaskQueue = new TaskQueue(config)
  }
  return globalTaskQueue
}

/**
 * 重置全局 TaskQueue（主要用于测试）
 */
export function resetTaskQueue(): void {
  if (globalTaskQueue) {
    globalTaskQueue.dispose()
    globalTaskQueue = null
  }
}
