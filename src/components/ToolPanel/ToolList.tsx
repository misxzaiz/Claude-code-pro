/**
 * 工具列表组件
 */

import { useRef, useEffect } from 'react';
import { useToolPanelStore } from '../../stores';
import { clsx } from 'clsx';
import type { ToolCall } from '../../types';
import {
  IconPending, IconRunning, IconCompleted, IconFailed
} from '../Common/Icons';

/** 计算持续时间 */
function getDuration(tool: ToolCall): string {
  const end = tool.completedAt ? new Date(tool.completedAt).getTime() : Date.now();
  const start = new Date(tool.startedAt).getTime();
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

/** 获取状态颜色 */
function getStatusColor(status: ToolCall['status']): string {
  switch (status) {
    case 'pending':
      return 'text-text-muted';
    case 'running':
      return 'text-warning animate-pulse';
    case 'completed':
      return 'text-success';
    case 'failed':
      return 'text-danger';
  }
}

/** 单个工具项 */
interface ToolItemProps {
  tool: ToolCall;
  isSelected: boolean;
  onClick: () => void;
}

function ToolItem({ tool, isSelected, onClick }: ToolItemProps) {
  const StatusIcon = getStatusIcon(tool.status);

  return (
    <button
      onClick={onClick}
      className={clsx(
        'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors',
        'hover:bg-background-hover',
        isSelected && 'bg-background-surface border-l-2 border-primary'
      )}
    >
      <StatusIcon size={14} className={clsx('shrink-0', getStatusColor(tool.status))} />
      <span className="flex-1 font-mono text-sm truncate text-text-primary">
        {tool.name}
      </span>
      <span className={clsx(
        'text-xs tabular-nums',
        tool.status === 'running' ? 'text-warning' : 'text-text-tertiary'
      )}>
        {getDuration(tool)}
      </span>
    </button>
  );
}

export function ToolList() {
  const { tools, selectTool, selectedToolId } = useToolPanelStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevToolsLengthRef = useRef(0);

  // 自动滚动到底部（当有新工具时）
  useEffect(() => {
    if (tools.length > prevToolsLengthRef.current) {
      if (scrollRef.current) {
        requestAnimationFrame(() => {
          scrollRef.current?.scrollTo({
            top: scrollRef.current?.scrollHeight,
            behavior: 'smooth'
          });
        });
      }
      prevToolsLengthRef.current = tools.length;
    }
  }, [tools.length]);

  if (tools.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-4">
        <div className="w-12 h-12 rounded-full bg-background-surface flex items-center justify-center mb-3">
          <svg className="w-6 h-6 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </div>
        <p className="text-sm text-text-tertiary">暂无工具调用</p>
        <p className="text-xs text-text-muted mt-1">工具调用将在此显示</p>
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto">
      <div className="py-2">
        {tools.map((tool) => (
          <ToolItem
            key={tool.id}
            tool={tool}
            isSelected={selectedToolId === tool.id}
            onClick={() => selectTool(tool.id)}
          />
        ))}
      </div>
    </div>
  );
}
