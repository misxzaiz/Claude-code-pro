/**
 * IFlow Event Parser
 *
 * 负责将 IFlow CLI 的输出解析为通用的 AIEvent。
 * 这是适配器的核心转换层。
 */

import type { AIEvent } from '../../ai-runtime'
import {
  createToolCallStartEvent,
  createToolCallEndEvent,
  createProgressEvent,
  createErrorEvent,
  createSessionStartEvent,
  createSessionEndEvent,
  createAssistantMessageEvent,
  createUserMessageEvent,
  type ToolCallInfo,
} from '../../ai-runtime'

/**
 * IFlow StreamEvent 类型（来自 IFlow CLI）
 *
 * 这些是 IFlow CLI 输出的原始事件格式。
 * 注意：实际格式需要根据 IFlow CLI 的真实输出调整。
 */
export interface IFlowStreamEvent {
  type: string
  [key: string]: unknown
}

/**
 * IFlow 消息事件
 */
export interface IFlowMessageEvent extends IFlowStreamEvent {
  type: 'message'
  role: 'assistant' | 'user' | 'system'
  content: string
}

/**
 * IFlow Token 事件（流式输出）
 */
export interface IFlowTokenEvent extends IFlowStreamEvent {
  type: 'token' | 'delta'
  text: string
  delta?: string
}

/**
 * IFlow 工具调用事件
 */
export interface IFlowToolEvent extends IFlowStreamEvent {
  type: 'tool' | 'tool_call'
  name: string
  args?: Record<string, unknown>
  input?: Record<string, unknown>
  result?: unknown
  output?: unknown
  status?: 'start' | 'end' | 'error'
}

/**
 * IFlow 进度事件
 */
export interface IFlowProgressEvent extends IFlowStreamEvent {
  type: 'progress'
  message: string
  percent?: number
}

/**
 * IFlow 错误事件
 */
export interface IFlowErrorEvent extends IFlowStreamEvent {
  type: 'error'
  error: string
  message?: string
}

/**
 * IFlow 会话事件
 */
export interface IFlowSessionEvent extends IFlowStreamEvent {
  type: 'start' | 'end' | 'complete'
  sessionId?: string
}

/**
 * 工具调用状态管理
 */
class ToolCallManager {
  private toolCalls = new Map<string, ToolCallInfo>()

  startToolCall(toolName: string, toolId: string, input: Record<string, unknown>): ToolCallInfo {
    const toolCall: ToolCallInfo = {
      id: toolId,
      name: toolName,
      args: input,
      status: 'running',
    }
    this.toolCalls.set(toolId, toolCall)
    return toolCall
  }

  endToolCall(toolId: string, output?: unknown, success = true): void {
    const toolCall = this.toolCalls.get(toolId)
    if (toolCall) {
      toolCall.status = success ? 'completed' : 'failed'
      toolCall.result = output
    }
  }

  getToolCalls(): ToolCallInfo[] {
    return Array.from(this.toolCalls.values())
  }

  removeToolCall(toolId: string): void {
    this.toolCalls.delete(toolId)
  }

  clear(): void {
    this.toolCalls.clear()
  }
}

/**
 * IFlow Event Parser
 *
 * 将 IFlow CLI 的输出转换为通用的 AIEvent。
 */
export class IFlowEventParser {
  private toolCallManager = new ToolCallManager()
  private sessionId: string

  constructor(sessionId: string) {
    this.sessionId = sessionId
  }

  /**
   * 解析单个 IFlow StreamEvent 为 AIEvent
   * @returns 解析后的 AIEvent 数组（一个事件可能产生多个 AIEvent）
   */
  parse(event: IFlowStreamEvent): AIEvent[] {
    const results: AIEvent[] = []

    switch (event.type) {
      case 'start': {
        results.push(...this.parseSessionEvent(event as IFlowSessionEvent))
        break
      }

      case 'end':
      case 'complete': {
        results.push(...this.parseSessionEvent(event as IFlowSessionEvent))
        break
      }

      case 'message': {
        results.push(...this.parseMessageEvent(event as IFlowMessageEvent))
        break
      }

      case 'token':
      case 'delta': {
        results.push(this.parseTokenEvent(event as IFlowTokenEvent))
        break
      }

      case 'tool':
      case 'tool_call': {
        results.push(...this.parseToolEvent(event as IFlowToolEvent))
        break
      }

      case 'progress': {
        results.push(this.parseProgressEvent(event as IFlowProgressEvent))
        break
      }

      case 'error': {
        results.push(this.parseErrorEvent(event as IFlowErrorEvent))
        break
      }

      default: {
        // 未知类型，记录日志但不中断
        console.warn('[IFlowEventParser] Unknown event type:', event.type)
      }
    }

    return results
  }

  /**
   * 解析会话事件
   */
  private parseSessionEvent(event: IFlowSessionEvent): AIEvent[] {
    const results: AIEvent[] = []

    if (event.type === 'start') {
      results.push(createSessionStartEvent(event.sessionId || this.sessionId))
    } else if (event.type === 'end' || event.type === 'complete') {
      results.push(
        createSessionEndEvent(event.sessionId || this.sessionId, 'completed')
      )
    }

    return results
  }

  /**
   * 解析消息事件
   */
  private parseMessageEvent(event: IFlowMessageEvent): AIEvent[] {
    const results: AIEvent[] = []

    if (event.role === 'assistant') {
      results.push(createAssistantMessageEvent(event.content, false))
    } else if (event.role === 'user') {
      results.push(createUserMessageEvent(event.content))
    }

    return results
  }

  /**
   * 解析 Token 事件（流式输出）
   */
  private parseTokenEvent(event: IFlowTokenEvent): AIEvent {
    const text = event.text || event.delta || ''
    return createAssistantMessageEvent(text, true)
  }

  /**
   * 解析工具调用事件
   */
  private parseToolEvent(event: IFlowToolEvent): AIEvent[] {
    const results: AIEvent[] = []

    const toolName = event.name || 'unknown'
    const args = event.args || event.input || {}

    if (!event.status || event.status === 'start') {
      // 工具调用开始
      const toolId = crypto.randomUUID()
      this.toolCallManager.startToolCall(toolName, toolId, args)

      results.push(createProgressEvent(`调用工具: ${toolName}`))
      results.push(createToolCallStartEvent(toolName, args))
    } else if (event.status === 'end') {
      // 工具调用完成
      results.push(createProgressEvent(`工具完成: ${toolName}`))
      results.push(
        createToolCallEndEvent(toolName, event.result || event.output, true)
      )
    } else if (event.status === 'error') {
      // 工具调用失败
      results.push(createProgressEvent(`工具失败: ${toolName}`))
      results.push(
        createToolCallEndEvent(toolName, event.result || event.output, false)
      )
    }

    return results
  }

  /**
   * 解析进度事件
   */
  private parseProgressEvent(event: IFlowProgressEvent): AIEvent {
    return createProgressEvent(event.message, event.percent)
  }

  /**
   * 解析错误事件
   */
  private parseErrorEvent(event: IFlowErrorEvent): AIEvent {
    return createErrorEvent(event.error || event.message || '未知错误')
  }

  /**
   * 重置解析器状态
   */
  reset(): void {
    this.toolCallManager.clear()
  }

  /**
   * 获取当前的工具调用列表
   */
  getCurrentToolCalls(): ToolCallInfo[] {
    return this.toolCallManager.getToolCalls()
  }
}

/**
 * 解析单行 JSON 为 IFlowStreamEvent
 */
export function parseStreamEventLine(line: string): IFlowStreamEvent | null {
  try {
    const trimmed = line.trim()
    if (!trimmed) return null
    return JSON.parse(trimmed) as IFlowStreamEvent
  } catch {
    return null
  }
}

/**
 * 将 IFlow StreamEvent 数组转换为 AIEvent 数组
 */
export function convertIFlowEventsToAIEvents(
  events: IFlowStreamEvent[],
  sessionId: string
): AIEvent[] {
  const parser = new IFlowEventParser(sessionId)
  const results: AIEvent[] = []

  for (const event of events) {
    results.push(...parser.parse(event))
  }

  return results
}
