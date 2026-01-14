/**
 * Base Event Parser - 通用事件解析器基类
 *
 * 提供所有 CLI Engine 事件解析器的公共功能：
 * - ToolCallManager: 工具调用状态管理
 * - 事件类型映射: 原始事件 -> AIEvent 的通用转换逻辑
 *
 * 各引擎只需实现引擎特定的事件类型定义和解析逻辑。
 */

import type { AIEvent, ToolCallInfo } from '../event'

/**
 * 工具调用状态管理器
 *
 * 跟踪工具调用的完整生命周期：pending -> running -> completed/failed
 */
export class ToolCallManager {
  private toolCalls = new Map<string, ToolCallInfo>()

  /**
   * 开始一个新的工具调用
   */
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

  /**
   * 结束工具调用
   */
  endToolCall(toolId: string, output?: unknown, success = true): void {
    const toolCall = this.toolCalls.get(toolId)
    if (toolCall) {
      toolCall.status = success ? 'completed' : 'failed'
      toolCall.result = output
    }
  }

  /**
   * 获取所有工具调用
   */
  getToolCalls(): ToolCallInfo[] {
    return Array.from(this.toolCalls.values())
  }

  /**
   * 移除指定工具调用
   */
  removeToolCall(toolId: string): void {
    this.toolCalls.delete(toolId)
  }

  /**
   * 清空所有工具调用
   */
  clear(): void {
    this.toolCalls.clear()
  }

  /**
   * 获取指定工具调用
   */
  getToolCall(toolId: string): ToolCallInfo | undefined {
    return this.toolCalls.get(toolId)
  }
}

/**
 * 原始流事件类型
 *
 * 所有 CLI Engine 的输出事件都应具有 type 字段
 */
export interface BaseStreamEvent {
  type: string
  [key: string]: unknown
}

/**
 * 通用事件解析器基类
 *
 * 提供事件解析的通用框架和工具方法。
 * 各引擎的 Parser 继承此类并实现引擎特定的解析逻辑。
 */
export abstract class BaseEventParser<TInput extends BaseStreamEvent = BaseStreamEvent> {
  protected toolCallManager = new ToolCallManager()
  protected sessionId: string

  constructor(sessionId: string) {
    this.sessionId = sessionId
  }

  /**
   * 解析单个原始事件为 AIEvent 数组
   *
   * 子类必须实现此方法，将引擎特定的原始事件转换为通用的 AIEvent。
   */
  abstract parse(event: TInput): AIEvent[]

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

  /**
   * 获取 session ID
   */
  getSessionId(): string {
    return this.sessionId
  }

  /**
   * 解析单行 JSON 为原始事件
   *
   * 通用的 JSON 行解析函数，所有 Engine 都可以使用。
   */
  public static parseJSONLine<T extends BaseStreamEvent>(
    line: string
  ): T | null {
    try {
      const trimmed = line.trim()
      if (!trimmed) return null
      return JSON.parse(trimmed) as T
    } catch {
      return null
    }
  }
}

/**
 * 将原始事件数组转换为 AIEvent 数组
 *
 * 通用的批量转换函数。
 */
export function convertEventsToAIEvents<T extends BaseStreamEvent>(
  events: T[],
  parser: BaseEventParser<T>
): AIEvent[] {
  const results: AIEvent[] = []

  for (const event of events) {
    results.push(...parser.parse(event))
  }

  return results
}
