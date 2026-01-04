/**
 * 消息气泡组件
 */

import { memo, useMemo } from 'react';
import { type Message } from '../../types';
import { useToolPanelStore } from '../../stores';
import DOMPurify from 'dompurify';
import { marked } from 'marked';

interface MessageBubbleProps {
  message: Message;
  isStreaming?: boolean;
}

// 配置 marked
marked.setOptions({
  breaks: true,  // 支持 GFM 换行
  gfm: true,     // GitHub Flavored Markdown
});

/** Markdown 渲染器（使用 marked + DOMPurify） */
function formatContent(content: string): string {
  try {
    const raw = marked.parse(content) as string;
    return DOMPurify.sanitize(raw, {
      ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'code', 'pre', 'blockquote', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a', 'span', 'div'],
      ALLOWED_ATTR: ['class', 'href', 'target', 'rel'],
    });
  } catch {
    // 降级到简单处理
    return content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>');
  }
}

/** 工具摘要标签 - 独立组件，隔离工具面板订阅 */
const ToolSummary = memo(function ToolSummary({ summary }: { summary: NonNullable<Message['toolSummary']> }) {
  // 只在这个组件内订阅工具面板状态，避免影响父组件
  const { setOpen, isOpen } = useToolPanelStore();

  const handleClick = () => {
    if (!isOpen) {
      setOpen(true);
    }
  };

  return (
    <div className="flex items-center gap-2 mt-2">
      {summary.names.slice(0, 4).map((name) => (
        <span
          key={name}
          className="inline-flex items-center gap-1.5 px-3 py-1.5
                   bg-background-surface border border-border
                   rounded-lg text-xs text-text-tertiary
                   font-mono shadow-soft hover:shadow-medium transition-shadow"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-success shadow-soft" />
          {name}
        </span>
      ))}
      {summary.names.length > 4 && (
        <span className="text-xs text-text-muted">+{summary.names.length - 4}</span>
      )}
      <button
        onClick={handleClick}
        className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary-hover transition-colors"
      >
        查看
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  );
});

/** 用户消息组件（独立 memo 化，避免不必要的重渲染） */
const UserMessage = memo(function UserMessage({ content }: { content: string }) {
  return (
    <div className="flex justify-end mb-6">
      <div className="max-w-[85%] px-4 py-3 rounded-2xl
                  bg-gradient-to-br from-primary to-primary-600
                  text-white shadow-glow">
        <div className="text-sm leading-relaxed whitespace-pre-wrap">
          {content}
        </div>
      </div>
    </div>
  );
});

/** 系统消息组件（独立 memo 化） */
const SystemMessage = memo(function SystemMessage({ content }: { content: string }) {
  return (
    <div className="flex justify-center mb-6">
      <p className="text-sm text-text-muted italic">{content}</p>
    </div>
  );
});

/** Claude 消息组件（独立 memo 化，包含格式化缓存） */
const ClaudeMessage = memo(function ClaudeMessage({
  content,
  timestamp,
  isStreaming,
  toolSummary
}: {
  content: string;
  timestamp?: string;
  isStreaming?: boolean;
  toolSummary?: Message['toolSummary'];
}) {
  // 缓存格式化结果，只在内容变化时重新格式化
  const formattedContent = useMemo(() => formatContent(content), [content]);

  return (
    <div className="flex gap-3 mb-6">
      {/* Avatar */}
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-primary-600
                      flex items-center justify-center shadow-glow shrink-0">
        <span className="text-sm font-bold text-white">C</span>
      </div>

      {/* 内容 */}
      <div className="flex-1 space-y-1">
        {/* 头部信息 */}
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium text-text-primary">Claude</span>
          {timestamp && (
            <span className="text-xs text-text-tertiary">
              {new Date(timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>

        {/* 消息内容 */}
        <div
          className="prose prose-invert prose-sm max-w-none"
          dangerouslySetInnerHTML={{ __html: formattedContent }}
        />

        {/* 流式光标 */}
        {isStreaming && (
          <span className="inline-flex ml-1">
            <span className="flex gap-0.5 items-end h-4">
              <span className="w-1 h-1 bg-text-muted rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1 h-1 bg-text-muted rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1 h-1 bg-text-muted rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </span>
          </span>
        )}

        {/* 工具摘要标签 */}
        {!isStreaming && toolSummary && (
          <ToolSummary summary={toolSummary} />
        )}
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  // 自定义比较函数，只在关键字段变化时重新渲染
  return (
    prevProps.content === nextProps.content &&
    prevProps.isStreaming === nextProps.isStreaming &&
    prevProps.toolSummary?.count === nextProps.toolSummary?.count
  );
});

/** 主消息气泡组件 - 使用 React.memo 避免不必要的重渲染 */
export const MessageBubble = memo(function MessageBubble({ message, isStreaming }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  if (isUser) {
    return <UserMessage content={message.content} />;
  }

  if (isSystem) {
    return <SystemMessage content={message.content} />;
  }

  return (
    <ClaudeMessage
      content={message.content}
      timestamp={message.timestamp}
      isStreaming={isStreaming}
      toolSummary={message.toolSummary}
    />
  );
}, (prevProps, nextProps) => {
  // 自定义比较：只在消息内容或流式状态变化时重新渲染
  return (
    prevProps.message.id === nextProps.message.id &&
    prevProps.message.content === nextProps.message.content &&
    prevProps.isStreaming === nextProps.isStreaming
  );
});
