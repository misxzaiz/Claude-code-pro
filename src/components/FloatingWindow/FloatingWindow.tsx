/**
 * 悬浮窗组件
 *
 * 功能：
 * - 显示 AI 对话消息（从 localStorage 读取）
 * - 提供输入框发送消息
 * - 点击展开按钮切换到主窗口
 * - 可拖拽移动窗口
 * - 支持鼠标移入自动展开
 *
 * 数据同步：
 * - 通过 localStorage 从主窗口读取消息
 * - 通过 storage 事件监听消息变化
 * - 通过 Tauri 事件发送消息到主窗口
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type { ChatMessage } from '../../types'
import './FloatingWindow.css'

// 悬浮窗配置类型
interface FloatingWindowConfig {
  enabled: boolean
  mode: 'auto' | 'manual'
  expandOnHover: boolean
}

export function FloatingWindow() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [input, setInput] = useState('')
  const [config, setConfig] = useState<FloatingWindowConfig>({
    enabled: true,
    mode: 'auto',
    expandOnHover: true,
  })
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // 从 localStorage 加载配置和消息
  useEffect(() => {
    const loadConfig = () => {
      try {
        const stored = localStorage.getItem('app_config')
        if (stored) {
          const appConfig = JSON.parse(stored)
          if (appConfig.floatingWindow) {
            setConfig(appConfig.floatingWindow)
          }
        }
      } catch (e) {
        console.error('[FloatingWindow] 加载配置失败:', e)
      }
    }

    const loadMessages = () => {
      try {
        const stored = localStorage.getItem('chat_messages_sync')
        if (stored) {
          const parsedMessages = JSON.parse(stored) as ChatMessage[]
          setMessages(parsedMessages)
        }
      } catch (e) {
        console.error('[FloatingWindow] 加载消息失败:', e)
      }
    }

    const loadStreaming = () => {
      try {
        const stored = localStorage.getItem('chat_is_streaming')
        if (stored) {
          setIsStreaming(JSON.parse(stored))
        }
      } catch (e) {
        console.error('[FloatingWindow] 加载流式状态失败:', e)
      }
    }

    loadConfig()
    loadMessages()
    loadStreaming()

    // 监听配置变化事件
    const unlistenConfigPromise = listen('config:updated', loadConfig)

    return () => {
      unlistenConfigPromise.then(unlisten => unlisten())
    }
  }, [])

  // 监听 storage 事件 - 实时同步主窗口的消息变化
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'chat_messages_sync' && e.newValue) {
        try {
          const parsedMessages = JSON.parse(e.newValue) as ChatMessage[]
          setMessages(parsedMessages)
          console.log('[FloatingWindow] 收到消息更新:', parsedMessages.length)
        } catch (e) {
          console.error('[FloatingWindow] 解析消息失败:', e)
        }
      }
      if (e.key === 'chat_is_streaming' && e.newValue) {
        try {
          setIsStreaming(JSON.parse(e.newValue))
        } catch (e) {
          console.error('[FloatingWindow] 解析流式状态失败:', e)
        }
      }
    }

    window.addEventListener('storage', handleStorageChange)

    return () => {
      window.removeEventListener('storage', handleStorageChange)
    }
  }, [])

  // 鼠标移入悬浮窗自动展开主窗口
  useEffect(() => {
    if (!config.expandOnHover) return

    const handleMouseEnter = () => {
      // 延迟一小段时间，避免误触
      hoverTimerRef.current = setTimeout(() => {
        invoke('show_main_window')
      }, 150)
    }

    const handleMouseLeave = () => {
      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current)
        hoverTimerRef.current = null
      }
    }

    document.addEventListener('mouseenter', handleMouseEnter)
    document.addEventListener('mouseleave', handleMouseLeave)

    return () => {
      document.removeEventListener('mouseenter', handleMouseEnter)
      document.removeEventListener('mouseleave', handleMouseLeave)
      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current)
      }
    }
  }, [config.expandOnHover])

  // 发送消息 - 通过 Tauri 事件发送到主窗口
  const handleSend = useCallback(async () => {
    const trimmed = input.trim()
    if (!trimmed || isStreaming) return

    // 通过 Tauri 事件发送到主窗口
    const { emit } = await import('@tauri-apps/api/event')
    emit('floating:send_message', { message: trimmed })

    setInput('')
  }, [input, isStreaming])

  // 切换到主窗口
  const handleExpand = useCallback(async () => {
    await invoke('show_main_window')
  }, [])

  // 键盘事件
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  // 中断生成 - 通过 Tauri 事件发送到主窗口
  const handleInterrupt = useCallback(async () => {
    const { emit } = await import('@tauri-apps/api/event')
    emit('floating:interrupt_chat', {})
  }, [])

  return (
    <div className="floating-window">
      {/* 标题栏 - 可拖拽区域 */}
      <div className="floating-header" data-tauri-drag-region>
        <div className="floating-title">
          <span className="floating-title-icon">◉</span>
          <span>Claude Code Pro</span>
        </div>
        <button
          className="floating-expand-btn"
          onClick={handleExpand}
          title="展开主窗口"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 3 21 3 21 9" />
            <polyline points="9 21 3 21 3 15" />
            <line x1="21" y1="3" x2="14" y2="10" />
            <line x1="3" y1="21" x2="10" y2="14" />
          </svg>
        </button>
      </div>

      {/* 消息区域 */}
      <div className="floating-messages">
        {messages.length === 0 ? (
          <div className="floating-empty">
            <span>开始对话吧~</span>
          </div>
        ) : (
          <div className="floating-messages-content">
            {messages.map((msg) => (
              <div key={msg.id} className={`floating-message-${msg.type}`}>
                {msg.type === 'user' ? (
                  <div className="floating-user-message">
                    <span className="floating-message-sender">你</span>
                    <span className="floating-message-content">{msg.content}</span>
                  </div>
                ) : msg.type === 'assistant' && 'blocks' in msg ? (
                  <div className="floating-assistant-message">
                    <span className="floating-message-sender">AI</span>
                    <div className="floating-message-content">
                      {msg.blocks.map((block, idx) => {
                        if (block.type === 'text') {
                          return <div key={idx} dangerouslySetInnerHTML={{ __html: block.content }} />
                        } else if (block.type === 'tool_call') {
                          return (
                            <div key={idx} className="floating-tool-call">
                              <span className="tool-name">{block.name}</span>
                              <span className="tool-status">{block.status || 'running'}</span>
                            </div>
                          )
                        }
                        return null
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="floating-system-message">
                    <span className="floating-message-content">{(msg as any).content || '系统消息'}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 输入区域 */}
      <div className="floating-input-area">
        <input
          type="text"
          className="floating-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入消息..."
          disabled={isStreaming}
        />
        {isStreaming ? (
          <button
            className="floating-interrupt-btn"
            onClick={handleInterrupt}
            title="停止生成"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="6" y="6" width="12" height="12" />
            </svg>
          </button>
        ) : (
          <button
            className={`floating-send-btn ${input.trim() ? 'active' : ''}`}
            onClick={handleSend}
            disabled={!input.trim()}
            title="发送"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}
