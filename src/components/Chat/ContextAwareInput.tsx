/**
 * 上下文感知输入框
 * 整合上下文管理功能的增强版输入框
 */

import { useState, useRef, KeyboardEvent, useCallback, useMemo } from 'react';
import { clsx } from 'clsx';
import {
  Paperclip,
  AtSign,
  Slash,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { IconSend, IconStop } from '../Common/Icons';
import { ContextToolbar } from '../Context';
import { useWorkspaceStore } from '../../stores';

interface ContextAwareInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: (message: string, context?: ContextSnapshot) => void;
  disabled?: boolean;
  isStreaming?: boolean;
  onInterrupt?: () => void;
  placeholder?: string;
  className?: string;
}

// 临时类型，应该从 context 导入
interface ContextSnapshot {
  workspaceId: string | null;
  selectedFiles: any[];
  selectedSymbols: any[];
  messageContext: any;
  projectInfo: any;
  diagnostics: any[];
  estimatedTokens: number;
}

/**
 * 上下文感知输入框组件
 */
export function ContextAwareInput({
  value,
  onChange,
  onSend,
  disabled = false,
  isStreaming = false,
  onInterrupt,
  placeholder = '输入消息... (Enter 发送, Shift+Enter 换行)',
  className,
}: ContextAwareInputProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showQuickActions, setShowQuickActions] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { currentWorkspaceId } = useWorkspaceStore();

  // 计算字符数
  const charCount = value.length;
  const hasContent = value.trim().length > 0;

  // 处理输入变化
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
  }, [onChange]);

  // 处理键盘事件
  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }

    if (e.key === 'Escape') {
      setShowQuickActions(false);
    }
  }, []);

  // 发送消息
  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled || isStreaming) return;

    // TODO: 构建上下文快照
    const context: ContextSnapshot = {
      workspaceId: currentWorkspaceId,
      selectedFiles: [],
      selectedSymbols: [],
      messageContext: null,
      projectInfo: null,
      diagnostics: [],
      estimatedTokens: 0,
    };

    onSend(trimmed, context);
    onChange('');
  }, [value, disabled, isStreaming, onSend, onChange, currentWorkspaceId]);

  // 处理文件拖放
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    // TODO: 处理文件拖放，添加到上下文
    const files = Array.from(e.dataTransfer.files);
    console.log('Dropped files:', files);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  // 切换展开状态
  const toggleExpanded = useCallback(() => {
    setIsExpanded(prev => !prev);
  }, []);

  // 切换快速操作面板
  const toggleQuickActions = useCallback(() => {
    setShowQuickActions(prev => !prev);
  }, []);

  // 快速操作按钮
  const quickActions = useMemo(() => [
    {
      icon: <AtSign className="w-4 h-4" />,
      label: '引用文件',
      shortcut: '@',
      action: () => {
        // 触发文件引用
        onChange(value + '@');
        textareaRef.current?.focus();
      },
    },
    {
      icon: <Slash className="w-4 h-4" />,
      label: '命令',
      shortcut: '/',
      action: () => {
        // 触发命令
        onChange(value + '/');
        textareaRef.current?.focus();
      },
    },
  ], [value, onChange]);

  return (
    <div className={clsx('border-t border-border bg-background-elevated', className)} ref={containerRef}>
      {/* 上下文工具栏 */}
      <ContextToolbar />

      {/* 输入区域 */}
      <div className="flex items-end gap-3 p-4">
        {/* 快速操作按钮 */}
        <div className="flex items-center gap-1 pb-2">
          <button
            onClick={toggleQuickActions}
            className={clsx(
              'p-2 rounded-lg transition-colors',
              showQuickActions
                ? 'bg-primary-faint text-primary'
                : 'text-text-muted hover:text-text-primary hover:bg-background-hover'
            )}
            title="快速操作"
          >
            <ChevronDown className={clsx('w-5 h-5 transition-transform', showQuickActions && 'rotate-180')} />
          </button>

          {/* 快速操作面板 */}
          {showQuickActions && (
            <div className="absolute bottom-full left-4 mb-2 flex flex-col gap-1 p-1 bg-background-surface border border-border rounded-lg shadow-lg">
              {quickActions.map((action, index) => (
                <button
                  key={index}
                  onClick={action.action}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-background-hover transition-colors text-left"
                >
                  <div className="text-text-muted">{action.icon}</div>
                  <div className="flex-1">
                    <div className="text-sm text-text-primary">{action.label}</div>
                    <div className="text-xs text-text-muted">按 {action.shortcut} 触发</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 输入框 */}
        <div
          className={clsx(
            'flex-1 flex items-end gap-2 px-4 py-3 bg-background-surface border rounded-2xl transition-all',
            'focus-within:ring-2 focus-within:ring-primary/50 focus-within:border-primary',
            isExpanded ? 'border-border' : 'border-border'
          )}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
        >
          {/* 文本区域 */}
          <div className="flex-1">
            <textarea
              ref={textareaRef}
              value={value}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              disabled={disabled}
              className={clsx(
                'w-full min-h-[24px] max-h-[200px] py-1 bg-transparent border-none outline-none resize-none',
                'text-sm text-text-primary placeholder:text-text-tertiary leading-relaxed'
              )}
              style={{
                height: isExpanded ? '120px' : 'auto',
              }}
              rows={isExpanded ? undefined : 1}
            />
          </div>

          {/* 操作按钮 */}
          <div className="flex items-center gap-2 pb-0.5">
            {/* 附件按钮 */}
            <button
              className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-background-hover transition-colors"
              title="添加附件"
            >
              <Paperclip className="w-4 h-4" />
            </button>

            {/* 发送/中断按钮 */}
            {isStreaming && onInterrupt ? (
              <button
                onClick={onInterrupt}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-error text-white hover:bg-error-hover transition-colors"
              >
                <IconStop size={14} />
                中断
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={disabled || isStreaming || !hasContent}
                className={clsx(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                  hasContent
                    ? 'bg-primary text-white hover:bg-primary-hover shadow-glow'
                    : 'bg-background-hover text-text-muted cursor-not-allowed'
                )}
              >
                <IconSend size={14} />
                发送
              </button>
            )}
          </div>
        </div>

        {/* 展开/收起按钮 */}
        <button
          onClick={toggleExpanded}
          className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-background-hover transition-colors"
          title={isExpanded ? '收起' : '展开'}
        >
          {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </button>
      </div>

      {/* 底部状态栏 */}
      <div className="flex items-center justify-between px-4 pb-3">
        <div className="text-xs text-text-tertiary">
          {isStreaming ? (
            <span className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-warning rounded-full animate-pulse" />
              正在生成回复...
            </span>
          ) : (
            <span>按 Enter 发送，Shift+Enter 换行，@ 引用文件，/ 命令</span>
          )}
        </div>
        <div className="text-xs text-text-tertiary">
          {charCount > 0 && `${charCount} 字符`}
        </div>
      </div>
    </div>
  );
}
