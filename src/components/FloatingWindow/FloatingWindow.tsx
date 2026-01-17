/**
 * 悬浮窗组件
 *
 * 功能：
 * - 显示最后两条消息预览
 * - 提供输入框发送消息
 * - 点击展开按钮切换到主窗口
 * - 可拖拽移动窗口
 * - 支持鼠标移入自动展开
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import './FloatingWindow.css'

// 截断文本到指定长度
function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength) + '...'
}

// 悬浮窗配置类型
interface FloatingWindowConfig {
  enabled: boolean
  mode: 'auto' | 'manual'
  expandOnHover: boolean
}

export function FloatingWindow() {
  const [messages, setMessages] = useState<Array<{ id: string; type: string; content: string; timestamp: string }>>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [input, setInput] = useState('')
  const [config, setConfig] = useState<FloatingWindowConfig>({
    enabled: true,
    mode: 'auto',
    expandOnHover: true,
  })
  // 用于跟踪已存在的消息 ID，防止重复
  const messageIdsRef = useRef(new Set<string>())
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 从 localStorage 加载配置
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

    loadConfig()

    // 监听配置变化事件
    const unlistenPromise = listen('config:updated', loadConfig)

    return () => {
      unlistenPromise.then(unlisten => unlisten())
    }
  }, [])

  // 监听主窗口的消息更新
  useEffect(() => {
    // 初始化：从 localStorage 读取最新消息
    const loadInitialMessages = () => {
      try {
        const stored = localStorage.getItem('chat_messages_preview')
        if (stored) {
          const data = JSON.parse(stored)
          console.log('[FloatingWindow] 从 localStorage 加载消息:', data)
          // 取最后 2 条
          const lastTwo = data.slice(-2)
          setMessages(lastTwo)
          // 记录已存在的消息 ID
          messageIdsRef.current = new Set(lastTwo.map((m: any) => m.id))
        }
      } catch (e) {
        console.error('[FloatingWindow] 加载消息失败:', e)
      }
    }

    loadInitialMessages()

    // 监听新消息事件
    const unlistenPromise = listen('chat:new-message', (event: any) => {
      const message = event.payload
      console.log('[FloatingWindow] 收到 chat:new-message 事件:', message)

      setMessages(prev => {
        // 检查消息是否已存在，防止重复添加
        if (messageIdsRef.current.has(message.id)) {
          console.log('[FloatingWindow] 消息已存在，跳过:', message.id)
          return prev
        }

        // 添加新消息 ID 到集合
        messageIdsRef.current.add(message.id)

        // 添加新消息，只保留最后 2 条
        const newMessages = [...prev, message]
        const result = newMessages.slice(-2)
        console.log('[FloatingWindow] 更新消息列表:', result)
        return result
      })
    })

    // 监听流式状态变化
    const streamingUnlisten = listen('chat:streaming_changed', (event: any) => {
      setIsStreaming(event.payload.isStreaming)
    })

    // 定期轮询 localStorage 作为备份（处理跨窗口事件可能丢失的情况）
    const pollInterval = setInterval(() => {
      try {
        const stored = localStorage.getItem('chat_messages_preview')
        if (stored) {
          const data = JSON.parse(stored)
          const lastTwo = data.slice(-2)
          // 检查是否有新消息
          const hasNewMessage = lastTwo.some((m: any) => !messageIdsRef.current.has(m.id))
          if (hasNewMessage) {
            console.log('[FloatingWindow] 轮询发现新消息，更新列表')
            // 更新消息 ID 集合
            messageIdsRef.current = new Set(lastTwo.map((m: any) => m.id))
            setMessages(lastTwo)
          }
        }
      } catch (e) {
        console.error('[FloatingWindow] 轮询消息失败:', e)
      }
    }, 500) // 每 500ms 轮询一次

    return () => {
      unlistenPromise.then(unlisten => unlisten())
      streamingUnlisten.then(unlisten => unlisten())
      clearInterval(pollInterval)
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

  // 发送消息
  const handleSend = useCallback(async () => {
    const trimmed = input.trim()
    if (!trimmed || isStreaming) return

    // 使用 Tauri 事件发送到主窗口
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

  // 获取最后两条消息用于显示
  const displayMessages = messages.slice(-2)

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

      {/* 消息预览区域 */}
      <div className="floating-messages">
        {displayMessages.length === 0 ? (
          <div className="floating-empty">
            <span>暂无消息</span>
          </div>
        ) : (
          displayMessages.map(msg => (
            <div key={msg.id} className={`floating-message ${msg.type}`}>
              <span className="message-sender">
                {msg.type === 'user' ? '你' : 'AI'}
              </span>
              <span className="message-content">
                {truncateText(msg.content, 50)}
              </span>
            </div>
          ))
        )}
        {isStreaming && (
          <div className="floating-streaming-indicator">
            <span className="streaming-dot"></span>
            <span>正在回复...</span>
          </div>
        )}
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
        <button
          className={`floating-send-btn ${input.trim() ? 'active' : ''}`}
          onClick={handleSend}
          disabled={!input.trim() || isStreaming}
          title="发送"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
    </div>
  )
}
