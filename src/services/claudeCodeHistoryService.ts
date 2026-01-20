/**
 * Claude Code 原生历史服务
 *
 * 负责读取 Claude Code 原生存储的会话历史
 * 即 ~/.claude/projects/{项目名}/sessions-index.json
 */

import { invoke } from '@tauri-apps/api/core'
import type { Message, ChatMessage, ContentBlock, UserChatMessage, AssistantChatMessage, SystemChatMessage, ToolCallBlock } from '../types'

// ============================================================================
// 类型定义
// ============================================================================

/**
 * Claude Code 会话元数据
 */
export interface ClaudeCodeSessionMeta {
  sessionId: string
  firstPrompt: string
  messageCount: number
  created: string
  modified: string
  filePath: string
  fileSize: number
}

/**
 * Claude Code 会话消息
 */
export interface ClaudeCodeMessage {
  role: string
  content: unknown // 可能是字符串或数组
  timestamp?: string
}

// ============================================================================
// 服务类
// ============================================================================

/**
 * Claude Code 历史服务类
 */
export class ClaudeCodeHistoryService {
  /**
   * 列出项目的所有 Claude Code 会话
   */
  async listSessions(projectPath?: string): Promise<ClaudeCodeSessionMeta[]> {
    try {
      const sessions = await invoke<ClaudeCodeSessionMeta[]>('list_claude_code_sessions', {
        projectPath,
      })
      return sessions
    } catch (e) {
      console.error('[ClaudeCodeHistoryService] 列出会话失败:', e)
      return []
    }
  }

  /**
   * 获取会话历史消息
   */
  async getSessionHistory(sessionId: string, projectPath?: string): Promise<ClaudeCodeMessage[]> {
    try {
      const messages = await invoke<ClaudeCodeMessage[]>('get_claude_code_session_history', {
        sessionId,
        projectPath,
      })
      return messages
    } catch (e) {
      console.error('[ClaudeCodeHistoryService] 获取会话历史失败:', e)
      return []
    }
  }

  /**
   * 将 Claude Code 消息转换为通用 Message 格式
   */
  convertMessagesToFormat(messages: ClaudeCodeMessage[]): Message[] {
    return messages.map((msg, idx) => ({
      id: `${msg.role}-${idx}`,
      role: msg.role as 'user' | 'assistant',
      content: this.extractContentText(msg.content),
      timestamp: msg.timestamp || new Date().toISOString(),
    }))
  }

  /**
   * 从消息内容中提取纯文本
   */
  private extractContentText(content: unknown): string {
    if (typeof content === 'string') {
      return content
    }

    if (Array.isArray(content)) {
      const texts: string[] = []
      for (const item of content) {
        if (item && typeof item === 'object') {
          if ('type' in item && item.type === 'text' && 'text' in item) {
            texts.push(String(item.text))
          }
        }
      }
      return texts.join('')
    }

    return ''
  }

  /**
   * 从消息中提取工具调用
   */
  extractToolCalls(messages: ClaudeCodeMessage[]): Array<{
    id: string
    name: string
    status: 'pending' | 'completed' | 'failed'
    input: Record<string, unknown>
    startedAt: string
  }> {
    const toolCalls: Array<{
      id: string
      name: string
      status: 'pending' | 'completed' | 'failed'
      input: Record<string, unknown>
      startedAt: string
    }> = []

    for (const msg of messages) {
      if (typeof msg.content === 'string') {
        // 简单实现：暂不解析工具调用
        continue
      }

      if (Array.isArray(msg.content)) {
        for (const item of msg.content) {
          if (item && typeof item === 'object') {
            if ('type' in item && item.type === 'tool_use') {
              toolCalls.push({
                id: String(item.id || crypto.randomUUID()),
                name: String(item.name || 'unknown'),
                status: 'completed' as const,
                input: item.input as Record<string, unknown> || {},
                startedAt: msg.timestamp || new Date().toISOString(),
              })
            }
          }
        }
      }
    }

    return toolCalls
  }

  /**
   * 将 Claude Code 消息转换为 ChatMessage 格式（包含 blocks）
   *
   * Claude Code 原生消息格式：
   * {
   *   "role": "assistant",
   *   "content": [
   *     { "type": "tool_use", "name": "TodoWrite", "input": {...} },
   *     { "type": "text", "text": "..." }
   *   ]
   * }
   */
  convertToChatMessages(messages: ClaudeCodeMessage[]): ChatMessage[] {
    const chatMessages: ChatMessage[] = []

    for (const msg of messages) {
      const id = crypto.randomUUID()
      const timestamp = msg.timestamp || new Date().toISOString()

      if (msg.role === 'user') {
        // 用户消息
        const content = this.extractUserContent(msg.content)
        chatMessages.push({
          id,
          type: 'user',
          content,
          timestamp,
        } as UserChatMessage)
      } else if (msg.role === 'assistant') {
        // 助手消息 - 解析 blocks
        const blocks = this.parseAssistantBlocks(msg.content)
        const textContent = this.extractContentText(msg.content)

        chatMessages.push({
          id,
          type: 'assistant',
          blocks,
          timestamp,
          content: textContent || undefined,
          isStreaming: false,
        } as AssistantChatMessage)
      } else {
        // 系统消息
        chatMessages.push({
          id,
          type: 'system',
          content: String(msg.content || ''),
          timestamp,
        } as SystemChatMessage)
      }
    }

    return chatMessages
  }

  /**
   * 解析助手消息的 content 数组为 blocks
   */
  private parseAssistantBlocks(content: unknown): ContentBlock[] {
    const blocks: ContentBlock[] = []

    if (typeof content === 'string') {
      // 纯文本
      blocks.push({ type: 'text', content })
      return blocks
    }

    if (Array.isArray(content)) {
      for (const item of content) {
        if (!item || typeof item !== 'object') continue

        if ('type' in item) {
          if (item.type === 'text' && 'text' in item) {
            // 文本块
            blocks.push({
              type: 'text',
              content: String(item.text),
            })
          } else if (item.type === 'tool_use') {
            // 工具调用块
            blocks.push({
              type: 'tool_call',
              id: String(item.id || crypto.randomUUID()),
              name: String(item.name || 'unknown'),
              input: (item.input as Record<string, unknown>) || {},
              status: 'completed',
              startedAt: new Date().toISOString(),
            } as ToolCallBlock)
          }
        }
      }
    }

    // 如果没有解析出任何 block，添加空文本块
    if (blocks.length === 0) {
      blocks.push({ type: 'text', content: '' })
    }

    return blocks
  }

  /**
   * 提取用户消息内容（处理 tool_result）
   */
  private extractUserContent(content: unknown): string {
    if (typeof content === 'string') {
      return content
    }

    if (Array.isArray(content)) {
      // 用户消息可能包含 tool_result，过滤掉
      const texts: string[] = []
      for (const item of content) {
        if (item && typeof item === 'object') {
          if ('type' in item) {
            if (item.type === 'text' && 'text' in item) {
              texts.push(String(item.text))
            }
            // 跳过 tool_result
          }
        }
      }
      return texts.join('')
    }

    return ''
  }

  /**
   * 格式化文件大小
   */
  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
  }

  /**
   * 格式化时间
   */
  formatTime(timestamp: string): string {
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return '刚刚'
    if (diffMins < 60) return `${diffMins} 分钟前`
    if (diffHours < 24) return `${diffHours} 小时前`
    if (diffDays < 7) return `${diffDays} 天前`

    return date.toLocaleDateString('zh-CN', {
      month: 'short',
      day: 'numeric',
    })
  }
}

// ============================================================================
// 全局单例
// ============================================================================

let globalService: ClaudeCodeHistoryService | null = null

/**
 * 获取 Claude Code 历史服务单例
 */
export function getClaudeCodeHistoryService(): ClaudeCodeHistoryService {
  if (!globalService) {
    globalService = new ClaudeCodeHistoryService()
  }
  return globalService
}
