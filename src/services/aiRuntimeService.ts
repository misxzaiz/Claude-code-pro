/**
 * AI Runtime Service - 事件驱动版本
 *
 * 这是新架构的核心服务层：
 * 1. 使用 EventBus 进行事件分发
 * 2. 使用 CLIParser 解析 CLI 输出
 * 3. 完全基于 AIEvent 进行通信
 */

import type { AISession, AIEvent } from '../ai-runtime'
import type { StreamEvent } from '../types'
import { getEventBus, type EventBus, DEFAULT_ENGINE_ID } from '../ai-runtime'
import { createParser, type CLIParser } from '../ai-runtime'
import { getEngineRegistry } from '../ai-runtime'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'

/**
 * 将 Tauri 的 StreamEvent 转换为通用的 AIEvent
 *
 * 这是适配层，将 Claude 特定的事件格式转换为通用格式。
 */
function streamEventToAIEvent(streamEvent: StreamEvent, sessionId: string): AIEvent[] {
  const events: AIEvent[] = []

  switch (streamEvent.type) {
    case 'system':
      if (streamEvent.session_id) {
        events.push({ type: 'session_start', sessionId: streamEvent.session_id })
      }
      if (streamEvent.subtype || streamEvent.extra) {
        const extraMessage =
          streamEvent.extra && typeof streamEvent.extra === 'object' && 'message' in streamEvent.extra
            ? String(streamEvent.extra.message)
            : undefined
        events.push({ type: 'progress', message: extraMessage || streamEvent.subtype })
      }
      break

    case 'session_start':
      events.push({ type: 'session_start', sessionId: streamEvent.sessionId })
      break

    case 'session_end':
    case 'result':
      events.push({ type: 'session_end', sessionId, reason: 'completed' })
      break

    case 'assistant': {
      const content = streamEvent.message.content
      const textParts = content.filter((item) => item.type === 'text')
      const text = textParts.map((item) => item.text || '').join('')

      const toolUseParts = content.filter((item) => item.type === 'tool_use')
      const toolCalls = toolUseParts.map((tool) => ({
        id: tool.id || crypto.randomUUID(),
        name: tool.name || 'unknown',
        args: tool.input || {},
        status: 'pending' as const,
      }))

      if (text) {
        events.push({
          type: 'assistant_message',
          content: text,
          isDelta: false,
          toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        })
      }

      for (const tool of toolCalls) {
        events.push({ type: 'tool_call_start', tool: tool.name, args: tool.args })
      }
      break
    }

    case 'user': {
      const toolResults = streamEvent.message.content.filter((item) => item.type === 'tool_result')
      for (const result of toolResults) {
        if (result.tool_use_id) {
          events.push({
            type: 'tool_call_end',
            tool: result.tool_use_id,
            result: result.content || '',
            success: !result.is_error,
          })
        }
      }
      break
    }

    case 'text_delta':
      events.push({ type: 'token', value: streamEvent.text })
      break

    case 'tool_start':
      events.push({ type: 'tool_call_start', tool: streamEvent.toolName, args: streamEvent.input })
      events.push({ type: 'progress', message: `调用工具: ${streamEvent.toolName}` })
      break

    case 'tool_end':
      events.push({
        type: 'tool_call_end',
        tool: streamEvent.toolName,
        result: streamEvent.output,
        success: streamEvent.output !== undefined,
      })
      events.push({ type: 'progress', message: `工具完成: ${streamEvent.toolName}` })
      break

    case 'error':
      events.push({ type: 'error', error: streamEvent.error })
      break

    case 'permission_request':
      events.push({ type: 'progress', message: '等待权限确认...' })
      break
  }

  return events
}

/**
 * AI Runtime 配置
 */
export interface AIRuntimeConfig {
  /** 工作区目录 */
  workspaceDir?: string
  /** 是否启用详细日志 */
  verbose?: boolean
  /** 是否启用 EventBus 调试 */
  debug?: boolean
  /** 使用的引擎 ID */
  engineId?: 'claude-code' | 'iflow'
}

/**
 * AI Runtime 服务类（事件驱动版本）
 *
 * 核心特性：
 * 1. 使用 EventBus 进行全局事件分发
 * 2. 使用 CLIParser 解析 CLI 输出
 * 3. 完全基于 AIEvent 进行通信
 */
export class AIRuntimeService {
  private eventBus: EventBus
  private parser: CLIParser
  private currentSession: AISession | null = null
  private unlistenFn: UnlistenFn | null = null
  private config: AIRuntimeConfig
  private currentEngineId: 'claude-code' | 'iflow' = 'claude-code'

  constructor(config?: AIRuntimeConfig) {
    this.config = config || {}
    this.currentEngineId = this.config.engineId || 'claude-code'
    this.eventBus = getEventBus({ debug: this.config.debug })
    this.parser = createParser()
  }

  /**
   * 初始化 Runtime
   */
  async initialize(): Promise<void> {
    // 设置 Tauri 事件监听
    await this.setupEventListeners()

    // 检查 Engine 可用性
    const registry = getEngineRegistry()
    if (registry.has(DEFAULT_ENGINE_ID)) {
      const engine = registry.get(DEFAULT_ENGINE_ID)
      if (engine?.initialize) {
        await engine.initialize()
      }
    }
  }

  /**
   * 设置 Tauri 事件监听器
   *
   * 监听 Tauri 的 chat-event，解析后通过 EventBus 分发
   */
  private async setupEventListeners(): Promise<void> {
    if (this.unlistenFn) {
      return
    }

    this.unlistenFn = await listen<string>('chat-event', (event) => {
      try {
        const streamEvent = JSON.parse(event.payload) as StreamEvent
        const sessionId = this.currentSession?.id || this.parser.getSessionId() || 'unknown'

        // 转换为 AIEvent
        const aiEvents = streamEventToAIEvent(streamEvent, sessionId)

        // 通过 EventBus 分发所有事件
        for (const aiEvent of aiEvents) {
          this.eventBus.emit(aiEvent)
        }
      } catch (e) {
        console.error('[AIRuntimeService] Failed to parse event:', e)
      }
    })
  }

  /**
   * 获取 EventBus 实例
   */
  getEventBus(): EventBus {
    return this.eventBus
  }

  /**
   * 获取 Parser 实例
   */
  getParser(): CLIParser {
    return this.parser
  }

  /**
   * 发送消息（创建新会话或继续现有会话）
   */
  async sendMessage(message: string, sessionId?: string): Promise<string> {
    const workDir = this.config.workspaceDir
    const engineId = this.currentEngineId

    if (sessionId) {
      if (engineId === 'iflow') {
        await invoke('continue_iflow_chat', { sessionId, message })
      } else {
        await invoke('continue_chat', { sessionId, message, workDir })
      }
      return sessionId
    } else {
      if (engineId === 'iflow') {
        const newSessionId = await invoke<string>('start_iflow_chat', { message })
        return newSessionId
      } else {
        const newSessionId = await invoke<string>('start_chat', { message, workDir })
        return newSessionId
      }
    }
  }

  /**
   * 中断会话
   */
  async interrupt(sessionId: string): Promise<void> {
    const engineId = this.currentEngineId

    if (engineId === 'iflow') {
      await invoke('interrupt_iflow_chat', { sessionId })
    } else {
      await invoke('interrupt_chat', { sessionId })
    }

    // 发送中断事件
    this.eventBus.emit({
      type: 'session_end',
      sessionId,
      reason: 'aborted',
    })
  }

  /**
   * 获取当前会话
   */
  getCurrentSession(): AISession | null {
    return this.currentSession
  }

  /**
   * 设置当前会话
   */
  setCurrentSession(session: AISession | null): void {
    this.currentSession = session
  }

  /**
   * 清理资源
   */
  async cleanup(): Promise<void> {
    if (this.unlistenFn) {
      this.unlistenFn()
      this.unlistenFn = null
    }

    this.parser.reset()
    this.eventBus.clear()

    if (this.currentSession) {
      this.currentSession.dispose()
      this.currentSession = null
    }

    const registry = getEngineRegistry()
    const engine = registry.get(DEFAULT_ENGINE_ID)
    if (engine?.cleanup) {
      await engine.cleanup()
    }
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<AIRuntimeConfig>): void {
    this.config = { ...this.config, ...config }
    if (config.engineId) {
      this.currentEngineId = config.engineId
    }
  }

  /**
   * 获取当前引擎 ID
   */
  getEngineId(): 'claude-code' | 'iflow' {
    return this.currentEngineId
  }

  /**
   * 设置引擎 ID
   */
  setEngineId(engineId: 'claude-code' | 'iflow'): void {
    this.currentEngineId = engineId
    this.config.engineId = engineId
  }
}

/**
 * 全局单例
 */
let globalService: AIRuntimeService | null = null

/**
 * 获取 AI Runtime 服务单例
 */
export function getAIRuntime(config?: AIRuntimeConfig): AIRuntimeService {
  if (!globalService) {
    globalService = new AIRuntimeService(config)
  }
  return globalService
}

/**
 * 重置服务（主要用于测试）
 */
export function resetAIRuntime(): void {
  if (globalService) {
    globalService.cleanup()
    globalService = null
  }
}
