/**
 * 工具调用时间线组件
 */

import React from 'react';
import { type ToolCall } from '../../types';
import { clsx } from 'clsx';
import {
  IconPending, IconRunning, IconCompleted, IconFailed,
  IconChevronRight, IconCopy
} from '../Common/Icons';

interface ToolCallTimelineProps {
  toolCalls: ToolCall[];
}

/** 计算持续时间 */
function getDuration(startedAt: string, completedAt?: string): string {
  if (!completedAt) return '';
  const start = new Date(startedAt).getTime();
  const end = new Date(completedAt).getTime();
  const ms = end - start;
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/** 获取状态图标 */
function getStatusIcon(status: ToolCall['status']) {
  switch (status) {
    case 'pending':
      return IconPending;
    case 'running':
      return IconRunning;
    case 'completed':
      return IconCompleted;
    case 'failed':
      return IconFailed;
  }
}

/** 获取状态颜色类名 */
function getStatusColor(status: ToolCall['status']): string {
  switch (status) {
    case 'pending':
      return 'text-text-muted';
    case 'running':
      return 'text-warning animate-pulse';
    case 'completed':
      return 'text-success';
    case 'failed':
      return 'text-error';
  }
}

/** 复制到剪贴板 */
async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // 降级方案
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  }
}

/** 单个工具调用项 */
interface ToolCallItemProps {
  tool: ToolCall;
}

function ToolCallItem({ tool }: ToolCallItemProps) {
  const StatusIcon = getStatusIcon(tool.status);
  const [isExpanded, setIsExpanded] = React.useState(false);

  return (
    <div className="group border border-border-subtle rounded-lg overflow-hidden hover:border-border-muted transition-colors">
      {/* 工具头部 */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-background-hover transition-colors"
      >
        <StatusIcon size={14} className={clsx('shrink-0', getStatusColor(tool.status))} />
        <span className="font-mono text-sm text-text">
          {tool.name}
        </span>
        {tool.completedAt && (
          <span className="text-xs text-text-subtle ml-auto">
            {getDuration(tool.startedAt, tool.completedAt)}
          </span>
        )}
        <IconChevronRight
          size={14}
          className={clsx(
            'shrink-0 text-text-subtle transition-transform',
            isExpanded && 'rotate-90'
          )}
        />
      </button>

      {/* 展开详情 */}
      {isExpanded && (
        <div className="px-3 pb-3 space-y-2">
          {/* 工具输入 */}
          {tool.input && Object.keys(tool.input).length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-text-subtle">输入</span>
                <button
                  onClick={() => copyToClipboard(JSON.stringify(tool.input, null, 2))}
                  className="flex items-center gap-1 text-xs text-text-muted hover:text-text transition-colors"
                >
                  <IconCopy size={12} />
                  复制
                </button>
              </div>
              <pre className="text-xs bg-background-secondary p-2 rounded border border-border-subtle overflow-x-auto">
                {JSON.stringify(tool.input, null, 2)}
              </pre>
            </div>
          )}

          {/* 工具输出 */}
          {tool.output && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-text-subtle">输出</span>
                <button
                  onClick={() => copyToClipboard(tool.output || '')}
                  className="flex items-center gap-1 text-xs text-text-muted hover:text-text transition-colors"
                >
                  <IconCopy size={12} />
                  复制
                </button>
              </div>
              <pre className={clsx(
                "text-xs p-2 rounded border border-border-subtle overflow-x-auto max-h-48 overflow-y-auto",
                tool.status === 'failed'
                  ? 'bg-danger-faint text-text'
                  : 'bg-background-secondary text-text-muted'
              )}>
                {tool.output}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ToolCallTimeline({ toolCalls }: ToolCallTimelineProps) {
  if (toolCalls.length === 0) return null;

  return (
    <div className="mt-3 space-y-2">
      {/* 标题栏 */}
      <div className="flex items-center gap-2 text-xs text-text-subtle">
        <div className="w-2 h-2 rounded-full bg-border-muted" />
        <span>工具调用</span>
        <span className="bg-background-tertiary px-1.5 py-0.5 rounded text-text-muted">
          {toolCalls.length}
        </span>
      </div>

      {/* 工具列表 */}
      <div className="space-y-1.5">
        {toolCalls.map((tool, index) => (
          <ToolCallItem key={tool.id || index} tool={tool} />
        ))}
      </div>
    </div>
  );
}
