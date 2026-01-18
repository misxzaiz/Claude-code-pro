/**
 * Claude Code Session
 *
 * 实现 AISession 接口，封装 Claude Code CLI 的调用逻辑。
 * 这是 Claude Code Adapter 的核心实现。
 */

import type { AISessionConfig } from '../../ai-runtime'
import type { AITask, AIEvent } from '../../ai-runtime'
import { BaseSession } from '../../ai-runtime/base'
import { createEventIterable } from '../../ai-runtime/base'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { ClaudeEventParser, type ClaudeStreamEvent } from './event-parser'

/**
 * Claude Code 会话配置
 */
export interface ClaudeSessionConfig extends AISessionConfig {
  /** Claude Code CLI 路径 */
  claudePath?: string
  /** 工作区目录 */
  workspacePath?: string
}

/**
 * Tauri Chat 事件类型（来自 Rust 后端）
 *
 * 这是 Tauri 后端发送的前端事件格式。
 * 需要将其转换为 ClaudeStreamEvent 以便解析。
 */
interface TauriChatEvent {
  type: string
  data?: unknown
  session_id?: string
  [key: string]: unknown
}

/**
 * 将 TauriChatEvent 转换为 ClaudeStreamEvent
 *
 * 这是一个类型安全的转换函数，避免使用 `as any`。
 */
function tauriEventToStreamEvent(event: TauriChatEvent): ClaudeStreamEvent {
  const streamEvent: ClaudeStreamEvent = {
    type: event.type,
  }

  // 复制所有其他属性
  for (const [key, value] of Object.entries(event)) {
    if (key !== 'type') {
      streamEvent[key] = value
    }
  }

  return streamEvent
}

/**
 * Claude Code Session 实现
 *
 * 负责：
 * 1. 启动 Claude Code CLI 进程
 * 2. 将 stdout/stderr 解析为 AIEvent
 * 3. 处理 abort（中断）
 * 4. 管理进程生命周期
 */
export class ClaudeCodeSession extends BaseSession {
  protected config: ClaudeSessionConfig
  private parser: ClaudeEventParser
  private currentTaskId: string | null = null
  private unlistenChatEvent: (() => void) | null = null

  constructor(id: string, config?: ClaudeSessionConfig) {
    super({ id, config })
    this.config = {
      workspaceDir: config?.workspacePath,
      verbose: config?.verbose,
      timeout: config?.timeout,
      claudePath: config?.claudePath,
      options: config?.options,
    }
    this.parser = new ClaudeEventParser(id)
  }

  /**
   * 执行具体任务 - 由 BaseSession.run() 模板方法调用
   */
  protected async executeTask(task: AITask): Promise<AsyncIterable<AIEvent>> {
    this.currentTaskId = task.id

    // 设置 Tauri 事件监听
    await this.setupEventListeners()

    // 调用 Tauri 后端启动 Claude CLI
    await this.startClaudeProcess(task)

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
      return
    }

    // 调用 Tauri 后端中断 CLI 进程
    invoke('interrupt_chat', { sessionId: this.id })
      .catch((error) => {
        console.error('[ClaudeCodeSession] Failed to abort:', error)
      })
      .finally(() => {
        this.currentTaskId = null
      })
  }

  /**
   * 释放资源的具体实现
   */
  protected disposeResources(): void {
    // 移除事件监听
    if (this.unlistenChatEvent) {
      this.unlistenChatEvent()
      this.unlistenChatEvent = null
    }

    // 重置解析器
    this.parser.reset()
    this.currentTaskId = null
  }

  /**
   * 设置 Tauri 事件监听
   */
  private async setupEventListeners(): Promise<void> {
    if (this.unlistenChatEvent) {
      return
    }

    try {
      this.unlistenChatEvent = await listen<TauriChatEvent>(
        'chat-event',
        (event) => {
          // 过滤属于当前会话的事件
          if (event.payload.session_id === this.id) {
            this.handleTauriEvent(event.payload)
          }
        }
      )
    } catch (error) {
      console.error('[ClaudeCodeSession] Failed to setup event listeners:', error)
      throw error
    }
  }

  /**
   * 启动 Claude CLI 进程
   */
  private async startClaudeProcess(task: AITask): Promise<void> {
    const message = this.buildPrompt(task)

    const args = {
      message,
      sessionId: this.id,
      workspaceDir: this.config.workspaceDir,
      verbose: this.config.verbose || false,
      // 不需要传递 claudePath，后端会从配置中读取
    }

    try {
      await invoke('start_chat', args)
    } catch (error) {
      console.error('[ClaudeCodeSession] Failed to start Claude process:', error)
      throw error
    }
  }

  /**
   * 构建发送给 Claude 的提示词
   */
  private buildPrompt(task: AITask): string {
    let prompt = task.input.prompt

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

    // 如果有指定文件，添加上下文
    if (task.input.files && task.input.files.length > 0) {
      // Claude CLI 会自动处理工作区中的文件引用
      // 这里我们保持原样，让 CLI 去处理
    }

    return prompt
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
   * 处理来自 Tauri 的事件
   */
  private handleTauriEvent(event: TauriChatEvent): void {
    // 将 Tauri 事件转换为 ClaudeStreamEvent（类型安全）
    const streamEvent = tauriEventToStreamEvent(event)

    // 解析为 AIEvent 并 emit
    const aiEvents = this.parser.parse(streamEvent)

    for (const aiEvent of aiEvents) {
      this.emit(aiEvent)
    }
  }

  /**
   * 继续会话（用于多轮对话）
   */
  async continue(prompt: string): Promise<void> {
    if (this.isDisposed) {
      throw new Error('[ClaudeCodeSession] Session has been disposed')
    }

    try {
      await invoke('continue_chat', {
        sessionId: this.id,
        message: prompt,
      })
      this._status = 'running'
    } catch (error) {
      console.error('[ClaudeCodeSession] Failed to continue chat:', error)
      throw error
    }
  }
}

/**
 * Claude Session 工厂函数
 */
export function createClaudeSession(
  sessionId: string,
  config?: ClaudeSessionConfig
): ClaudeCodeSession {
  return new ClaudeCodeSession(sessionId, config)
}
