/**
 * 聊天消息列表组件 - 使用虚拟滚动优化性能
 */

import { useMemo, memo } from 'react';
import { Virtuoso } from 'react-virtuoso';
import type { Message } from '../../types';
import { MessageBubble } from './MessageBubble';
import { useChatStore } from '../../stores';

interface ChatMessagesProps {
  messages: Message[];
  currentContent?: string;
  isStreaming?: boolean;
}

/** 归档消息提示组件 */
const ArchiveNotice = memo(function ArchiveNotice({
  count,
  onLoad
}: {
  count: number;
  onLoad: () => void;
}) {
  if (count === 0) return null;

  return (
    <div className="flex justify-center py-3 bg-background-surface border-b border-border">
      <button
        onClick={onLoad}
        className="text-xs text-primary hover:text-primary-hover transition-colors flex items-center gap-2"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
        </svg>
        加载 {count} 条历史消息
      </button>
    </div>
  );
});

/** 空状态组件 */
const EmptyState = memo(function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-4">
      {/* Logo 图标 */}
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-primary-600 flex items-center justify-center shadow-glow mb-6 hover:shadow-glow-lg transition-all">
        <span className="text-3xl font-bold text-white">C</span>
      </div>

      {/* 标题 */}
      <h1 className="text-2xl font-semibold text-text-primary mb-2">
        Claude Code Pro
      </h1>

      {/* 描述 */}
      <p className="text-text-secondary mb-8 max-w-md">
        AI 驱动的代码助手，支持文件操作、代码编辑和智能分析
      </p>

      {/* 功能列表 */}
      <div className="grid grid-cols-3 gap-4 max-w-lg">
        <div className="flex flex-col items-center gap-2 p-4 rounded-xl bg-background-surface border border-border shadow-soft hover:shadow-medium hover:border-border-strong transition-all">
          <div className="w-8 h-8 rounded-lg bg-success-faint flex items-center justify-center">
            <span className="text-success text-sm">📁</span>
          </div>
          <span className="text-xs text-text-tertiary">文件操作</span>
        </div>
        <div className="flex flex-col items-center gap-2 p-4 rounded-xl bg-background-surface border border-border shadow-soft hover:shadow-medium hover:border-border-strong transition-all">
          <div className="w-8 h-8 rounded-lg bg-warning-faint flex items-center justify-center">
            <span className="text-warning text-sm">⚡</span>
          </div>
          <span className="text-xs text-text-tertiary">快速编辑</span>
        </div>
        <div className="flex flex-col items-center gap-2 p-4 rounded-xl bg-background-surface border border-border shadow-soft hover:shadow-medium hover:border-border-strong transition-all">
          <div className="w-8 h-8 rounded-lg bg-primary-faint flex items-center justify-center">
            <span className="text-primary text-sm">🔍</span>
          </div>
          <span className="text-xs text-text-tertiary">代码分析</span>
        </div>
      </div>

      {/* 提示 */}
      <p className="text-text-tertiary text-sm mt-8">
        在下方输入框开始对话...
      </p>
    </div>
  );
});

export function ChatMessages({
  messages,
  currentContent = '',
  isStreaming = false,
}: ChatMessagesProps) {
  // 获取归档状态
  const { archivedMessages, loadArchivedMessages } = useChatStore();

  // 合并已完成消息和当前流式消息，用于 Virtuoso 渲染
  const displayData = useMemo(() => {
    const baseData: Array<Message & { isStreaming?: boolean }> = [...messages];

    // 如果有流式内容，追加为临时消息
    if (isStreaming && currentContent) {
      baseData.push({
        id: 'current',
        role: 'assistant',
        content: currentContent,
        timestamp: new Date().toISOString(),
        isStreaming: true,
      });
    }

    return baseData;
  }, [messages, currentContent, isStreaming]);

  const isEmpty = displayData.length === 0;
  const hasArchive = archivedMessages.length > 0;

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {/* 归档消息提示 */}
      {hasArchive && (
        <ArchiveNotice
          count={archivedMessages.length}
          onLoad={loadArchivedMessages}
        />
      )}

      {/* 消息列表 */}
      <div className="flex-1 min-h-0">
        <div className="h-full max-w-3xl mx-auto">
          {isEmpty ? (
            <EmptyState />
          ) : (
            <Virtuoso
              style={{ height: '100%' }}
              data={displayData}
              itemContent={(_index, item) => (
                <MessageBubble
                  key={item.id}
                  message={item}
                  isStreaming={item.isStreaming}
                />
              )}
              components={{
                EmptyPlaceholder: () => null, // 使用外部条件渲染控制空状态
              }}
              // 自动跟随新消息（用户手动滚动时暂停）
              followOutput="auto"
              // 平滑滚动到新消息
              increaseViewportBy={{ top: 100, bottom: 300 }}
              // 首次渲染时滚动到底部
              initialTopMostItemIndex={displayData.length - 1}
            />
          )}
        </div>
      </div>
    </div>
  );
}
