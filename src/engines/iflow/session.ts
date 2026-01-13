/**
 * IFlow Session
 *
 * IFlow CLI 的会话实现，负责启动和管理 IFlow 进程。
 */

import type { AISession, AISessionConfig, AITask, AIEvent, AISessionStatus, AIEventListener } from '../../ai-runtime'
import { EventEmitter } from '../../ai-runtime'
import { IFlowEventParser } from './event-parser'

/**
 * IFlow CLI 配置
 */
export interface IFlowConfig {
  /** IFlow CLI 可执行文件路径 */
  executablePath?: string
  /** 工作目录 */
  cwd?: string
  /** 环境变量 */
  env?: Record<string, string>
  /** 模型配置 */
  model?: string
  /** API 密钥（如果需要） */
  apiKey?: string
  /** API 基础 URL（如果需要） */
  apiBase?: string
  /** 额外参数 */
  extraArgs?: string[]
}

/**
 * IFlow 子进程（抽象，实际由 Tauri 后端实现）
 */
interface IFlowProcess {
  pid?: number
  stdout?: ReadableStream
  stderr?: ReadableStream
  kill(): void
  on?(event: string, handler: (...args: unknown[]) => void): void
}

/**
 * IFlow Session
 *
 * 管理 IFlow CLI 的单个会话实例。
 */
export class IFlowSession implements AISession {
  readonly id: string
  readonly engineId: string = 'iflow'
  private _status: AISessionStatus = 'idle'
  get status(): AISessionStatus {
    return this._status
  }
  private eventEmitter = new EventEmitter()
  private iflowConfig: IFlowConfig
  private parser: IFlowEventParser
  private isDisposed: boolean = false
  private process: IFlowProcess | null = null
  private currentTaskId: string | null = null

  constructor(_sessionConfig?: AISessionConfig, iflowConfig?: IFlowConfig) {
    this.id = crypto.randomUUID()
    this.iflowConfig = iflowConfig || {}
    this.parser = new IFlowEventParser(this.id)
  }

  /**
   * 执行任务
   *
   * @param task 要执行的任务
   * @returns AIEvent 异步迭代器
   */
  run(task: AITask): AsyncIterable<AIEvent> {
    if (this.isDisposed) {
      throw new Error('[IFlowSession] Session 已被释放，无法执行任务')
    }

    this._status = 'running'
    this.currentTaskId = task.id

    // 创建事件队列和解析器
    const eventQueue: AIEvent[] = []
    let eventResolver: (() => void) | null = null
    let isComplete = false
    let completionError: Error | null = null

    // 启动 IFlow 进程（异步）
    this.startIFlowProcess(task).then((process) => {
      this.process = process

      // 设置输出处理
      if (process.stdout) {
        // 在实际 Tauri 实现中，这里会监听 stdout
        // 现在只是模拟
      }
    }).catch((err) => {
      completionError = err
      isComplete = true
      eventResolver?.()
    })

    // 返回异步迭代器
    return {
      async *[Symbol.asyncIterator]() {
        while (!isComplete && !completionError) {
          if (eventQueue.length > 0) {
            const event = eventQueue.shift()!
            yield event
          } else {
            await new Promise<void>((resolve) => {
              eventResolver = resolve
            })
          }
        }

        if (completionError) {
          throw completionError
        }

        // 剩余的事件
        while (eventQueue.length > 0) {
          yield eventQueue.shift()!
        }
      },
    }
  }

  /**
   * 中断当前任务
   *
   * @param taskId 要中断的任务 ID
   */
  abort(taskId?: string): void {
    if (taskId && this.currentTaskId !== taskId) {
      console.warn(`[IFlowSession] 任务 ID 不匹配: ${taskId} != ${this.currentTaskId}`)
      return
    }

    // 终止 IFlow 进程
    if (this.process) {
      try {
        this.process.kill()
      } catch (e) {
        console.error('[IFlowSession] 终止进程失败:', e)
      }
      this.process = null
    }

    this.currentTaskId = null
    this._status = 'idle'
  }

  /**
   * 添加事件监听器
   */
  onEvent(listener: AIEventListener): () => void {
    return this.eventEmitter.onEvent(listener)
  }

  /**
   * 释放会话资源
   */
  dispose(): void {
    if (this.isDisposed) {
      return
    }

    this.isDisposed = true
    this._status = 'disposed'

    // 终止进程
    if (this.process) {
      try {
        this.process.kill()
      } catch (e) {
        // 忽略
      }
      this.process = null
    }

    // 重置解析器
    this.parser.reset()
    this.eventEmitter.removeAllListeners()
    this.currentTaskId = null
  }

  /**
   * 启动 IFlow 进程
   *
   * 注意：实际实现需要使用 Tauri 的 Command API，
   * 这里是前端层的抽象，真实实现在 Rust 后端。
   */
  private async startIFlowProcess(task: AITask): Promise<IFlowProcess> {
    const args = this.buildIFlowArgs(task)

    // 实际实现会调用 Tauri 后端
    // await invoke('start_iflow', { args, config: this.iflowConfig })

    console.log('[IFlowSession] 启动命令:', this.iflowConfig.executablePath || 'iflow', args)

    // 返回模拟的进程对象
    return {
      kill: () => {},
      on: (_event: string, _handler: (...args: unknown[]) => void) => {},
    }
  }

  /**
   * 构建 IFlow CLI 命令行参数
   */
  private buildIFlowArgs(task: AITask): string[] {
    const args: string[] = []
    const prompt = task.input.prompt as string

    // 基础参数
    args.push('--json') // JSON 格式输出
    args.push('--stream') // 流式输出

    // 如果指定了模型
    if (this.iflowConfig.model) {
      args.push('--model', this.iflowConfig.model)
    }

    // 如果有额外参数
    if (this.iflowConfig.extraArgs) {
      args.push(...this.iflowConfig.extraArgs)
    }

    // 最后是用户消息
    args.push('--')
    args.push(prompt)

    return args
  }

  /**
   * 更新 IFlow 配置
   */
  updateIFlowConfig(config: Partial<IFlowConfig>): void {
    this.iflowConfig = { ...this.iflowConfig, ...config }
  }

  /**
   * 获取当前配置
   */
  getConfig(): IFlowConfig {
    return { ...this.iflowConfig }
  }
}

/**
 * 创建 IFlow Session
 */
export function createIFlowSession(
  sessionConfig?: AISessionConfig,
  iflowConfig?: IFlowConfig
): IFlowSession {
  return new IFlowSession(sessionConfig, iflowConfig)
}
