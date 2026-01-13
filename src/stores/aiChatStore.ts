/**
 * AI Chat Store - 基于 AI Runtime 的新版聊天状态管理
 *
 * 这个 Store 使用通用的 AIEvent 而不是 Claude 特定的 StreamEvent。
 * 这是重构后的标准聊天状态管理。
 */

import { create } from 'zustand'
import type { Message, ToolStatus } from '../types'
import type { AIEvent } from '../ai-runtime'
import { getAIRuntime } from '../services/aiRuntimeService'
import { useToolPanelStore } from './toolPanelStore'
import { useConfigStore } from './configStore'

/** 最大保留消息数量 */
const MAX_MESSAGES = 500

/** 消息保留阈值 */
const MESSAGE_ARCHIVE_THRESHOLD = 550

/** 本地存储键 */
const STORAGE_KEY = 'ai_chat_state_backup'
const STORAGE_VERSION = '2'

/**
 * 工具调用信息（Store 内部使用）
 */
interface StoreToolCall {
  id: string
  name: string
  status: ToolStatus
  args?: Record<string, unknown>
  input?: Record<string, unknown>
  output?: string
  startedAt: string
  completedAt?: string
}

/**
 * AI Chat State
 */
interface AIChatState {
  /** 消息列表 */
  messages: Message[]
  /** 归档的消息列表 */
  archivedMessages: Message[]
  /** 归档是否展开 */
  isArchiveExpanded: boolean
  /** 当前会话 ID */
  conversationId: string | null
  /** 是否正在流式传输 */
  isStreaming: boolean
  /** 当前正在输入的内容 */
  currentContent: string
  /** 错误 */
  error: string | null
  /** 最大消息数配置 */
  maxMessages: number
  /** 是否已初始化 */
  isInitialized: boolean

  /** 添加消息 */
  addMessage: (message: Message) => void
  /** 清空消息 */
  clearMessages: () => void
  /** 设置会话 ID */
  setConversationId: (id: string | null) => void
  /** 设置流式状态 */
  setStreaming: (streaming: boolean) => void
  /** 完成当前消息 */
  finishMessage: () => void
  /** 设置错误 */
  setError: (error: string | null) => void

  /** 处理 AIEvent */
  handleAIEvent: (event: AIEvent) => void

  /** 发送消息 */
  sendMessage: (content: string, workspaceDir?: string) => Promise<void>
  /** 继续会话 */
  continueChat: (prompt?: string) => Promise<void>
  /** 中断会话 */
  interruptChat: () => Promise<void>

  /** 设置最大消息数 */
  setMaxMessages: (max: number) => void
  /** 切换归档展开状态 */
  toggleArchive: () => void
  /** 加载归档消息 */
  loadArchivedMessages: () => void

  /** 保存状态到本地存储 */
  saveToStorage: () => void
  /** 从本地存储恢复状态 */
  restoreFromStorage: () => boolean
}

/**
 * 当前活跃的工具调用映射
 * 用于追踪 tool_call_start 和 tool_call_end 之间的对应关系
 */
const activeToolCalls = new Map<string, StoreToolCall>()

export const useAIChatStore = create<AIChatState>((set, get) => ({
  messages: [],
  archivedMessages: [],
  isArchiveExpanded: false,
  conversationId: null,
  isStreaming: false,
  currentContent: '',
  error: null,
  maxMessages: MAX_MESSAGES,
  isInitialized: false,

  addMessage: (message) => {
    set((state) => {
      const newMessages = [...state.messages, message]

      // 归档旧消息
      if (newMessages.length > MESSAGE_ARCHIVE_THRESHOLD) {
        const archiveCount = newMessages.length - state.maxMessages
        const toArchive = newMessages.slice(0, archiveCount)
        const remaining = newMessages.slice(archiveCount)

        return {
          messages: remaining,
          archivedMessages: [...toArchive, ...state.archivedMessages],
        }
      }

      return { messages: newMessages }
    })

    get().saveToStorage()
  },

  clearMessages: () => {
    set({
      messages: [],
      archivedMessages: [],
      isArchiveExpanded: false,
      currentContent: '',
      conversationId: null,
    })
    useToolPanelStore.getState().clearTools()
  },

  setConversationId: (id) => {
    set({ conversationId: id })
  },

  setStreaming: (streaming) => {
    set({ isStreaming: streaming })
  },

  finishMessage: () => {
    const { currentContent, messages } = get()
    const toolPanelStore = useToolPanelStore.getState()

    if (currentContent) {
      const tools = toolPanelStore.tools
      const toolSummary =
        tools.length > 0
          ? {
              count: tools.length,
              names: Array.from(new Set(tools.map((t) => t.name))),
            }
          : undefined

      const newMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: currentContent,
        timestamp: new Date().toISOString(),
        toolSummary,
      }
      set({
        messages: [...messages, newMessage],
        currentContent: '',
      })
    }

    get().saveToStorage()
  },

  setError: (error) => {
    set({ error })
  },

  handleAIEvent: (event) => {
    const state = get()
    const toolPanelStore = useToolPanelStore.getState()

    switch (event.type) {
      case 'session_start':
        set({
          conversationId: event.sessionId,
          isStreaming: true,
          currentContent: '',
          error: null,
        })
        console.log('[AIChatStore] Session started:', event.sessionId)
        toolPanelStore.clearTools()
        break

      case 'session_end':
        state.finishMessage()
        set({ isStreaming: false })
        console.log('[AIChatStore] Session ended:', event.reason)
        // 清理活跃的工具调用
        activeToolCalls.clear()
        break

      case 'user_message':
        // 用户消息由 sendMessage 直接添加，这里不需要处理
        break

      case 'assistant_message':
        if (event.isDelta) {
          // 增量内容
          set((state) => ({
            currentContent: state.currentContent + event.content,
          }))
        } else {
          // 完整消息
          set({ currentContent: event.content })
        }

        // 处理工具调用
        if (event.toolCalls) {
          for (const tool of event.toolCalls) {
            activeToolCalls.set(tool.id, {
              id: tool.id,
              name: tool.name,
              status: tool.status,
              args: tool.args,
              startedAt: new Date().toISOString(),
            })

            toolPanelStore.addTool({
              id: tool.id,
              name: tool.name,
              status: tool.status,
              input: tool.args,
              startedAt: new Date().toISOString(),
            })
          }
        }
        break

      case 'token':
        set((state) => ({
          currentContent: state.currentContent + event.value,
        }))
        break

      case 'tool_call_start': {
        const toolId = crypto.randomUUID()
        const toolCall: StoreToolCall = {
          id: toolId,
          name: event.tool,
          status: 'running',
          input: event.args,
          startedAt: new Date().toISOString(),
        }
        activeToolCalls.set(event.tool, toolCall)

        toolPanelStore.addTool({
          id: toolId,
          name: event.tool,
          status: 'running',
          input: event.args,
          startedAt: new Date().toISOString(),
        })
        break
      }

      case 'tool_call_end': {
        // 通过名称查找活跃的工具调用
        const toolEntry = Array.from(activeToolCalls.entries()).find(
          ([, tool]) => tool.name === event.tool && tool.status === 'running'
        )

        if (toolEntry) {
          const [, toolCall] = toolEntry
          toolCall.status = event.success ? 'completed' : 'failed'
          toolCall.output = String(event.result || '')
          toolCall.completedAt = new Date().toISOString()

          // 在工具面板中更新（需要找到对应的工具 ID）
          const tools = toolPanelStore.tools
          const runningTool = tools.find(
            (t) => t.name === event.tool && t.status === 'running'
          )
          if (runningTool) {
            toolPanelStore.updateTool(runningTool.id, {
              status: event.success ? 'completed' : 'failed',
              output: String(event.result || ''),
              completedAt: new Date().toISOString(),
            })
          }
        }
        break
      }

      case 'progress':
        // 进度事件可以用于 UI 显示
        console.log('[AIChatStore] Progress:', event.message, event.percent)
        break

      case 'error':
        set({
          error: event.error,
          isStreaming: false,
        })
        break
    }
  },

  sendMessage: async (content, workspaceDir) => {
    const { conversationId } = get()

    // 添加用户消息
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    }
    get().addMessage(userMessage)

    // 清空当前内容，开始流式传输
    set({ currentContent: '', isStreaming: true, error: null })

    // 清空工具面板
    useToolPanelStore.getState().clearTools()

    // 从配置获取引擎设置
    const config = useConfigStore.getState().config
    const engineId = config?.defaultEngine || 'claude-code'

    try {
      const service = getAIRuntime({ workspaceDir, engineId })

      const sessionId = await service.sendMessage(
        content,
        conversationId || undefined
      )

      set({ conversationId: sessionId })
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : '发送消息失败',
        isStreaming: false,
      })
    }
  },

  continueChat: async (prompt = '') => {
    const { conversationId } = get()
    if (!conversationId) {
      set({ error: '没有活动会话', isStreaming: false })
      return
    }

    set({ isStreaming: true, error: null })

    // 从配置获取引擎设置
    const config = useConfigStore.getState().config
    const engineId = config?.defaultEngine || 'claude-code'

    try {
      const service = getAIRuntime({ engineId })
      await service.sendMessage(prompt, conversationId)
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : '继续对话失败',
        isStreaming: false,
      })
    }
  },

  interruptChat: async () => {
    const { conversationId } = get()
    if (!conversationId) return

    try {
      const service = getAIRuntime()
      await service.interrupt(conversationId)
      set({ isStreaming: false })
      get().finishMessage()
    } catch (e) {
      console.error('[AIChatStore] Interrupt failed:', e)
    }
  },

  setMaxMessages: (max) => {
    set({ maxMessages: Math.max(100, max) })

    const { messages, archivedMessages } = get()
    if (messages.length > max) {
      const archiveCount = messages.length - max
      const toArchive = messages.slice(0, archiveCount)
      const remaining = messages.slice(archiveCount)

      set({
        messages: remaining,
        archivedMessages: [...toArchive, ...archivedMessages],
      })
    }
  },

  toggleArchive: () => {
    set((state) => ({
      isArchiveExpanded: !state.isArchiveExpanded,
    }))
  },

  loadArchivedMessages: () => {
    const { archivedMessages } = get()
    if (archivedMessages.length === 0) return

    set({
      messages: [...archivedMessages, ...get().messages],
      archivedMessages: [],
      isArchiveExpanded: false,
    })
  },

  saveToStorage: () => {
    try {
      const state = get()
      const data = {
        version: STORAGE_VERSION,
        timestamp: new Date().toISOString(),
        messages: state.messages,
        archivedMessages: state.archivedMessages,
        conversationId: state.conversationId,
        currentContent: state.currentContent,
        isStreaming: state.isStreaming,
      }
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch (e) {
      console.error('[AIChatStore] 保存状态失败:', e)
    }
  },

  restoreFromStorage: () => {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY)
      if (!stored) return false

      const data = JSON.parse(stored)

      if (data.version !== STORAGE_VERSION) {
        console.warn('[AIChatStore] 存储版本不匹配，忽略')
        return false
      }

      const storedTime = new Date(data.timestamp).getTime()
      const now = Date.now()
      if (now - storedTime > 60 * 60 * 1000) {
        sessionStorage.removeItem(STORAGE_KEY)
        return false
      }

      set({
        messages: data.messages || [],
        archivedMessages: data.archivedMessages || [],
        conversationId: data.conversationId || null,
        currentContent: data.currentContent || '',
        isStreaming: false,
        isInitialized: true,
      })

      sessionStorage.removeItem(STORAGE_KEY)
      return true
    } catch (e) {
      console.error('[AIChatStore] 恢复状态失败:', e)
      return false
    }
  },
}))
