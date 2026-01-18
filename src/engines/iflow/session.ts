/**
 * IFlow Session
 *
 * IFlow CLI 的会话实现，负责启动和管理 IFlow 进程。
 */

import type { AISessionConfig, AITask, AIEvent } from '../../ai-runtime'
import { BaseSession } from '../../ai-runtime/base'
import { createEventIterable } from '../../ai-runtime/base'
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
export class IFlowSession extends BaseSession {
  readonly engineId: string = 'iflow'
  private iflowConfig: IFlowConfig
  private parser: IFlowEventParser
  private process: IFlowProcess | null = null
  private currentTaskId: string | null = null

  constructor(sessionConfig?: AISessionConfig, iflowConfig?: IFlowConfig) {
    // 使用生成的 UUID 作为 session ID
    const sessionId = crypto.randomUUID()
    super({ id: sessionId, config: sessionConfig })
    this.iflowConfig = iflowConfig || {}
    this.parser = new IFlowEventParser(sessionId)
  }

  /**
   * 执行具体任务 - 由 BaseSession.run() 模板方法调用
   */
  protected async executeTask(task: AITask): Promise<AsyncIterable<AIEvent>> {
    this.currentTaskId = task.id

    // 启动 IFlow 进程
    this.process = await this.startIFlowProcess(task)

    // 设置输出处理（在实际 Tauri 实现中，这里会监听 stdout）
    this.setupOutputHandling()

    // 使用基类的工厂函数创建事件迭代器
    return createEventIterable(
      this.eventEmitter,
      (event) => event.type === 'session_end' || event.type === 'error'
    )
  }

  /**
   * 中断任务的具体实现
   */
  protected abortTask(taskId?: string): void {
    if (taskId && taskId !== this.currentTaskId) {
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
  }

  /**
   * 释放资源的具体实现
   */
  protected disposeResources(): void {
    // 终止进程
    if (this.process) {
      try {
        this.process.kill()
      } catch {
        // 忽略错误
      }
      this.process = null
    }

    // 重置解析器
    this.parser.reset()
    this.currentTaskId = null
  }

  /**
   * 设置输出处理
   */
  private setupOutputHandling(): void {
    // 在实际 Tauri 实现中，这里会监听 stdout 并解析输出
    // 现在只是模拟
    if (this.process?.stdout) {
      // 实际实现会读取 stdout 并解析 IFlow 输出
    }
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
    let prompt = task.input.prompt as string

    // 处理工作区上下文（如果存在）
    const workspaceContext = task.input.extra?.workspaceContext as
      { currentWorkspace: { name: string; path: string }; contextWorkspaces: Array<{ name: string; path: string }> } | undefined

    if (workspaceContext) {
      // 将工作区上下文作为系统提示词注入
      const contextHeader = this.formatWorkspaceContext(workspaceContext)
      if (contextHeader) {
        prompt = `${contextHeader}\n\n${prompt}`
      }
    }

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
   * 格式化工作区上下文为提示词
   */
  private formatWorkspaceContext(
    workspaceContext: { currentWorkspace: { name: string; path: string }; contextWorkspaces: Array<{ name: string; path: string }> }
  ): string {
    const lines: string[] = []

    lines.push('═══════════════════════════════════════════════════════════')
    lines.push('                        工作区信息')
    lines.push('═══════════════════════════════════════════════════════════')
    lines.push(`当前工作区: ${workspaceContext.currentWorkspace.name}`)
    lines.push(`  路径: ${workspaceContext.currentWorkspace.path}`)
    lines.push(`  引用语法: @/path`)

    if (workspaceContext.contextWorkspaces.length > 0) {
      lines.push('')
      lines.push('关联工作区:')
      for (const ws of workspaceContext.contextWorkspaces) {
        lines.push(`  • ${ws.name}`)
        lines.push(`    路径: ${ws.path}`)
        lines.push(`    引用语法: @${ws.name}:path`)
      }
    }

    lines.push('═══════════════════════════════════════════════════════════')

    return lines.join('\n')
  }

  /**
   * 更新 IFlow 配置
   */
  updateIFlowConfig(config: Partial<IFlowConfig>): void {
    this.iflowConfig = { ...this.iflowConfig, ...config }
  }

  /**
   * 获取 IFlow 特定配置
   */
  getIFlowConfig(): IFlowConfig {
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
