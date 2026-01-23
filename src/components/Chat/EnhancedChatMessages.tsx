/**
 * 增强版聊天消息列表组件 - 支持内容块架构
 *
 * 核心特性：
 * - Assistant 消息包含 blocks 数组
 * - 工具调用穿插在文本中间显示
 * - 支持流式更新内容块
 * - TodoWrite 专用渲染
 * - Grep 关键词高亮
 * - Bash ANSI 码清理
 * - Edit 工具优化显示
 */

import { useMemo, memo, useState, useCallback, useRef } from 'react';
import React from 'react';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import { clsx } from 'clsx';
import type { ChatMessage, UserChatMessage, AssistantChatMessage, ContentBlock, TextBlock, ToolCallBlock } from '../../types';
import { useEventChatStore } from '../../stores';
import { getToolConfig, extractToolKeyInfo } from '../../utils/toolConfig';
import { markdownCache } from '../../utils/cache';
import {
  formatDuration,
  calculateDuration,
  generateOutputSummary,
  parseGrepMatches,
  stripAnsiCodes,
  escapeRegExp,
  type GrepMatch,
  type GrepOutputData
} from '../../utils/toolSummary';
import { Check, XCircle, Loader2, AlertTriangle, Play, ChevronDown, ChevronRight, Circle, FileSearch, FolderOpen, Code } from 'lucide-react';
import { ChatNavigator } from './ChatNavigator';
import { groupConversationRounds } from '../../utils/conversationRounds';
import { splitMarkdownWithMermaid } from '../../utils/markdown';
import { MermaidDiagram } from './MermaidDiagram';

/** Markdown 渲染器（使用缓存优化） */
function formatContent(content: string): string {
  return markdownCache.render(content);
}

/** 用户消息组件 */
const UserBubble = memo(function UserBubble({ message }: { message: UserChatMessage }) {
  return (
    <div className="flex justify-end my-2">
      <div className="max-w-[85%] px-4 py-3 rounded-2xl
                  bg-gradient-to-br from-primary to-primary-600
                  text-white shadow-glow">
        <div className="text-sm leading-relaxed whitespace-pre-wrap">
          {message.content}
        </div>
      </div>
    </div>
  );
});

/** 文本内容块组件（支持 Mermaid 渲染 - 使用分段解析） */
const TextBlockRenderer = memo(function TextBlockRenderer({ block }: { block: TextBlock }) {
  // 将 Markdown 拆分为多个片段（文本和 Mermaid 交替）
  const parts = useMemo(() => splitMarkdownWithMermaid(block.content), [block.content]);

  return (
    <div className="prose prose-invert prose-sm max-w-none">
      {parts.map((part, index) => {
        if (part.type === 'text') {
          // 渲染普通 Markdown 文本
          const formattedContent = useMemo(() => formatContent(part.content), [part.content]);
          return (
            <div key={`text-${index}`} dangerouslySetInnerHTML={{ __html: formattedContent }} />
          );
        } else {
          // 渲染 Mermaid 图表
          return (
            <MermaidDiagram
              key={`mermaid-${index}`}
              code={part.content}
              id={part.id || `mermaid-${index}`}
            />
          );
        }
      })}
    </div>
  );
});

/**
 * 状态图标配置
 */
const STATUS_CONFIG = {
  pending: { icon: Loader2, className: 'animate-spin text-yellow-500', label: '等待中' },
  running: { icon: Play, className: 'text-blue-500 animate-pulse', label: '运行中' },
  completed: { icon: Check, className: 'text-green-500', label: '已完成' },
  failed: { icon: XCircle, className: 'text-red-500', label: '失败' },
  partial: { icon: AlertTriangle, className: 'text-orange-500', label: '部分完成' },
} as const;

// ========================================
// Grep 输出渲染器
// ========================================

/**
 * 高亮文本组件 - 用于 Grep 结果
 */
function HighlightedText({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;

  try {
    const regex = new RegExp(`(${escapeRegExp(query)})`, 'gi');
    const parts = text.split(regex);

    return (
      <>
        {parts.map((part, i) =>
          regex.test(part) ? (
            <mark key={i} className="bg-yellow-500/30 text-text-primary px-0.5 rounded font-medium">
              {part}
            </mark>
          ) : (
            <span key={i}>{part}</span>
          )
        )}
      </>
    );
  } catch {
    return <>{text}</>;
  }
}

/**
 * Grep 匹配项组件
 */
const GrepMatchItem = memo(function GrepMatchItem({
  match,
  query
}: {
  match: GrepMatch;
  query: string;
}) {
  return (
    <div className="flex items-start gap-2 py-1.5 px-2 rounded bg-background-surface hover:bg-background-hover transition-colors">
      {/* 文件名 */}
      {match.file && (
        <div className="text-xs text-primary font-mono shrink-0">
          {match.file.split('/').pop() || match.file}
        </div>
      )}
      {/* 行号 */}
      {match.line > 0 && (
        <div className="text-xs text-text-muted font-mono shrink-0 w-8">
          :{match.line}
        </div>
      )}
      {/* 内容 */}
      <div className="flex-1 text-xs text-text-secondary font-mono break-all">
        <HighlightedText text={match.content} query={query} />
      </div>
    </div>
  );
});

/**
 * Grep 输出渲染器
 */
const GrepOutputRenderer = memo(function GrepOutputRenderer({
  data
}: {
  data: GrepOutputData;
}) {
  return (
    <div className="space-y-2">
      {/* 匹配项列表 */}
      <div className="space-y-0.5">
        {data.matches.slice(0, 20).map((match, idx) => (
          <GrepMatchItem key={idx} match={match} query={data.query} />
        ))}
      </div>
      {/* 超过20个提示 */}
      {data.total > 20 && (
        <div className="text-xs text-text-tertiary text-center py-1">
          ...还有 {data.total - 20} 个匹配项
        </div>
      )}
    </div>
  );
});

// ========================================
// TodoWrite 渲染器
// ========================================

/**
 * TodoWrite 相关类型定义
 */
interface TodoItem {
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  activeForm?: string;
}

interface TodoInputData {
  todos: TodoItem[];
  total: number;
  completed: number;
  inProgress: number;
  pending: number;
}

/**
 * 判断是否为 TodoWrite 工具
 */
function isTodoWriteTool(block: ToolCallBlock): boolean {
  return block.name.toLowerCase() === 'todowrite';
}

/**
 * 判断是否为 Grep 工具
 */
function isGrepTool(block: ToolCallBlock): boolean {
  return block.name.toLowerCase().includes('grep');
}

/**
 * 解析 TodoWrite 输入数据
 */
function parseTodoInput(input: Record<string, unknown> | undefined): TodoInputData | null {
  if (!input) return null;
  const todos = input.todos as TodoItem[];
  if (!Array.isArray(todos)) return null;

  return {
    todos,
    total: todos.length,
    completed: todos.filter(t => t.status === 'completed').length,
    inProgress: todos.filter(t => t.status === 'in_progress').length,
    pending: todos.filter(t => t.status === 'pending').length,
  };
}

/**
 * TodoWrite 任务状态配置
 */
const TODO_STATUS_CONFIG = {
  completed: { icon: Check, color: 'text-green-500', bg: 'bg-green-500/10', label: '已完成' },
  in_progress: { icon: Loader2, color: 'text-violet-500', bg: 'bg-violet-500/10', label: '进行中' },
  pending: { icon: Circle, color: 'text-gray-400', bg: 'bg-gray-500/10', label: '待处理' },
} as const;

/**
 * TodoWrite 任务项组件
 */
const TodoItem = memo(function TodoItem({
  todo,
  index
}: {
  todo: TodoItem;
  index: number;
}) {
  const statusConfig = TODO_STATUS_CONFIG[todo.status] || TODO_STATUS_CONFIG.pending;
  const StatusIcon = statusConfig.icon;

  return (
    <div className="flex items-start gap-2 p-2 rounded bg-background-surface hover:bg-background-hover transition-colors">
      <div className={clsx('p-1 rounded', statusConfig.bg)}>
        <StatusIcon className={clsx('w-3.5 h-3.5', statusConfig.color,
          todo.status === 'in_progress' && 'animate-spin'
        )} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-text-primary">{todo.content}</div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className={clsx('text-xs', statusConfig.color)}>{statusConfig.label}</span>
          <span className="text-xs text-text-muted">#{index + 1}</span>
        </div>
      </div>
    </div>
  );
});

/**
 * TodoWrite 输入渲染器 - 展开状态
 */
const TodoWriteInputRenderer = memo(function TodoWriteInputRenderer({
  data
}: {
  data: TodoInputData;
}) {
  const percent = data.total > 0 ? Math.round((data.completed / data.total) * 100) : 0;

  return (
    <div className="space-y-3">
      {/* 进度条 */}
      <div className="flex items-center gap-3">
        <div className="flex-1 bg-background-base rounded-full h-2 overflow-hidden">
          <div
            className="bg-violet-500 h-full transition-all duration-300"
            style={{ width: `${percent}%` }}
          />
        </div>
        <span className="text-xs text-text-tertiary">
          {data.completed}/{data.total} ({percent}%)
        </span>
      </div>

      {/* 任务列表 */}
      <div className="space-y-1">
        {data.todos.map((todo, index) => (
          <TodoItem key={index} todo={todo} index={index} />
        ))}
      </div>
    </div>
  );
});

/**
 * TodoWrite 任务状态图标（用于折叠状态）
 */
function getTodoStatusIcon(status: TodoItem['status']): React.ReactElement {
  const config = TODO_STATUS_CONFIG[status];
  const Icon = config.icon;
  return (
    <Icon className={clsx('w-3 h-3', config.color,
      status === 'in_progress' && 'animate-spin'
    )} />
  );
}

// ========================================
// 工具调用块渲染器
// ========================================

/** 工具调用块组件 - 优化版本 */
const ToolCallBlockRenderer = memo(function ToolCallBlockRenderer({ block }: { block: ToolCallBlock }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showFullOutput, setShowFullOutput] = useState(false);

  // 获取工具配置
  const toolConfig = useMemo(() => getToolConfig(block.name), [block.name]);

  // 状态图标
  const statusConfig = STATUS_CONFIG[block.status] || STATUS_CONFIG.pending;
  const StatusIcon = statusConfig.icon;

  // 计算耗时
  const duration = useMemo(() => {
    if (block.duration) return formatDuration(block.duration);
    const calculated = calculateDuration(block.startedAt, block.completedAt);
    return calculated ? formatDuration(calculated) : '';
  }, [block.duration, block.startedAt, block.completedAt]);

  // 提取关键信息
  const keyInfo = useMemo(() => extractToolKeyInfo(block.name, block.input), [block.name, block.input]);

  // 生成输出摘要
  const outputSummary = useMemo(() => {
    if (block.status === 'completed' && block.output) {
      return generateOutputSummary(block.name, block.output, block.status, block.input);
    }
    return null;
  }, [block.name, block.output, block.status, block.input]);

  // 解析 TodoWrite 数据
  const todoData = useMemo(() => {
    if (isTodoWriteTool(block)) {
      return parseTodoInput(block.input);
    }
    return null;
  }, [block]);

  // 解析 Grep 数据
  const grepData = useMemo(() => {
    if (isGrepTool(block) && block.output) {
      return parseGrepMatches(block.output, block.input);
    }
    return null;
  }, [block]);

  // 判断输出是否需要展开功能（修复：基于实际长度而非 outputSummary）
  const outputNeedsExpand = (block.output?.length ?? 0) > 1000;

  // 格式化输入参数（非 TodoWrite 工具使用）
  const formatInput = (input: Record<string, unknown>): string => {
    const entries = Object.entries(input);
    if (entries.length === 0) return '';
    return entries.map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join('\n');
  };

  // 工具图标组件
  const ToolIcon = toolConfig.icon;

  // 是否可展开（有输入参数或有输出）
  const hasInput = block.input && Object.keys(block.input).length > 0;
  const hasOutput = block.output && block.output.length > 0;
  const hasError = block.status === 'failed' && block.error;
  const canExpand = hasInput || hasOutput || hasError;

  // 是否使用专用输出渲染器
  const useCustomRenderer = grepData !== null;

  // 状态动画类
  const statusAnimationClass = useMemo(() => {
    switch (block.status) {
      case 'pending':
        return 'animate-pulse border-dashed';
      case 'running':
        return 'animate-pulse';
      case 'completed':
        return '';
      case 'failed':
        return 'animate-shake-once';
      case 'partial':
        return '';
      default:
        return '';
    }
  }, [block.status]);

  // Bash 工具需要清理 ANSI 码
  const displayOutput = useMemo(() => {
    if (!block.output) return '';
    const normalizedToolName = block.name.toLowerCase();
    if (
      normalizedToolName.includes('bash') ||
      normalizedToolName.includes('command') ||
      normalizedToolName.includes('execute')
    ) {
      return stripAnsiCodes(block.output);
    }
    return block.output;
  }, [block.name, block.output]);

  return (
    <div
      className={clsx(
        'my-2 rounded-lg overflow-hidden w-full transition-all duration-200',
        'border border-border',
        'bg-background-surface',
        statusAnimationClass
      )}
    >
      {/* 工具调用头部 - 左侧色条 */}
      <div
        className={clsx(
          'flex items-center gap-3 px-3 py-2',
          canExpand ? 'cursor-pointer hover:bg-background-hover' : 'cursor-default',
          'border-l-4',
          toolConfig.borderColor
        )}
        onClick={() => canExpand && setIsExpanded(!isExpanded)}
      >
        {/* 工具类型图标 */}
        <div className={clsx('p-1.5 rounded-md', toolConfig.bgColor)}>
          <ToolIcon className={clsx('w-4 h-4', toolConfig.color)} />
        </div>

        {/* 操作描述 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-text-secondary">
              {block.status === 'running' ? '正在' : '已'}{toolConfig.label}
            </span>
            {keyInfo && (
              <span className={clsx('font-medium truncate', toolConfig.color)}>
                {keyInfo}
              </span>
            )}
          </div>
          {/* 输出摘要（折叠时显示） */}
          {!isExpanded && outputSummary && (
            <div className="text-xs text-text-tertiary mt-0.5 flex items-center gap-1">
              {isGrepTool(block) && grepData ? (
                <>
                  <FileSearch className="w-3 h-3 shrink-0" />
                  <span>{outputSummary.summary}</span>
                </>
              ) : (
                <span>{outputSummary.summary}</span>
              )}
              {(outputSummary.expandable || outputNeedsExpand) && (
                <ChevronRight className="w-3 h-3 shrink-0" />
              )}
            </div>
          )}
          {/* TodoWrite 任务预览（折叠时显示前2个任务） */}
          {!isExpanded && todoData && todoData.total > 0 && (
            <div className="mt-1.5 space-y-0.5">
              {todoData.todos.slice(0, 2).map((todo, idx) => (
                <div key={idx} className="text-xs text-text-tertiary flex items-center gap-1.5">
                  {getTodoStatusIcon(todo.status)}
                  <span className="truncate">{todo.content}</span>
                </div>
              ))}
              {todoData.total > 2 && (
                <div className="text-xs text-text-muted">
                  ...还有 {todoData.total - 2} 个任务
                </div>
              )}
            </div>
          )}
        </div>

        {/* 状态与耗时 */}
        <div className="flex items-center gap-2 shrink-0">
          {duration && (
            <span className="text-xs text-text-tertiary">{duration}</span>
          )}
          <StatusIcon className={clsx('w-4 h-4', statusConfig.className)} />
        </div>

        {/* 展开/收起图标 */}
        {canExpand && (
          <ChevronDown
            className={clsx(
              'w-4 h-4 text-text-muted transition-transform shrink-0',
              isExpanded && 'rotate-180'
            )}
          />
        )}
      </div>

      {/* 可展开的详情 */}
      {isExpanded && (
        <div className="px-4 py-3 bg-background-subtle border-t border-border">
          {/* 工具名称和时间 */}
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-text-muted font-mono">{block.name}</span>
            <div className="text-xs text-text-tertiary flex gap-3">
              <span>开始: {new Date(block.startedAt).toLocaleTimeString('zh-CN')}</span>
              {block.completedAt && (
                <span>完成: {new Date(block.completedAt).toLocaleTimeString('zh-CN')}</span>
              )}
            </div>
          </div>

          {/* 输入参数 */}
          {hasInput && (
            <div className="mb-3">
              <div className="text-xs text-text-muted mb-1.5 flex items-center gap-1.5">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                {todoData ? '任务列表' : '输入参数'}
              </div>
              {todoData ? (
                <TodoWriteInputRenderer data={todoData} />
              ) : (
                <pre className="text-xs text-text-secondary bg-background-surface rounded p-2.5 max-w-full overflow-x-auto font-mono">
                  {formatInput(block.input)}
                </pre>
              )}
            </div>
          )}

          {/* 输出结果 */}
          {hasOutput && (
            <div className="mb-3">
              <div className="text-xs text-text-muted mb-1.5 flex items-center gap-1.5">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                输出结果
                {outputNeedsExpand && !useCustomRenderer && (
                  <button
                    onClick={() => setShowFullOutput(!showFullOutput)}
                    className="ml-auto text-primary hover:text-primary-hover text-xs"
                  >
                    {showFullOutput ? '收起' : '展开全部'}
                  </button>
                )}
              </div>
              {useCustomRenderer && grepData ? (
                <GrepOutputRenderer data={grepData} />
              ) : (
                <pre className={clsx(
                  'text-xs text-text-secondary bg-background-surface rounded p-2.5 overflow-x-auto font-mono',
                  showFullOutput ? 'max-h-96 overflow-y-auto' : 'max-h-48 overflow-y-auto'
                )}>
                  {showFullOutput
                    ? displayOutput
                    : (displayOutput.length > 1000
                      ? displayOutput.slice(0, 1000) + '\n... (内容过长，已截断，点击"展开全部"查看)'
                      : displayOutput)}
                </pre>
              )}
            </div>
          )}

          {/* 错误信息 */}
          {hasError && (
            <div className="mb-3">
              <div className="text-xs text-error mb-1.5 flex items-center gap-1.5">
                <XCircle className="w-3 h-3" />
                错误信息
              </div>
              <pre className="text-xs text-error bg-error-faint rounded p-2.5 overflow-x-auto font-mono">
                {block.error}
              </pre>
            </div>
          )}

          {/* 状态标签 */}
          <div className="flex items-center gap-2">
            <span className={clsx(
              'text-xs px-2 py-0.5 rounded-full',
              toolConfig.bgColor,
              toolConfig.color
            )}>
              {statusConfig.label}
            </span>
            {duration && (
              <span className="text-xs text-text-tertiary">
                耗时 {duration}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

/** 内容块渲染器 */
function renderContentBlock(block: ContentBlock): React.ReactNode {
  switch (block.type) {
    case 'text':
      return <TextBlockRenderer key={`text-${block.content.slice(0, 20)}`} block={block} />;
    case 'tool_call':
      return <ToolCallBlockRenderer key={block.id} block={block} />;
    default:
      return null;
  }
}

/** 助手消息组件 - 使用内容块架构 */
const AssistantBubble = memo(function AssistantBubble({ message }: { message: AssistantChatMessage }) {
  const hasBlocks = message.blocks && message.blocks.length > 0;

  return (
    <div className="flex gap-3 my-2">
      {/* Avatar */}
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-primary-600
                      flex items-center justify-center shadow-glow shrink-0">
        <span className="text-sm font-bold text-white">P</span>
      </div>

      {/* 内容 */}
      <div className="flex-1 space-y-1 min-w-0">
        {/* 头部信息 */}
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium text-text-primary">Claude</span>
          <span className="text-xs text-text-tertiary">
            {new Date(message.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>

        {/* 渲染内容块 */}
        {hasBlocks ? (
          <div className="space-y-1">
            {message.blocks.map((block, index) => (
              <div key={index}>
                {renderContentBlock(block)}
              </div>
            ))}
          </div>
        ) : message.content ? (
          // 兼容旧格式（content 字符串）
          <div
            className="prose prose-invert prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: formatContent(message.content) }}
          />
        ) : null}

        {/* 流式光标 */}
        {message.isStreaming && (
          <span className="inline-flex ml-1">
            <span className="flex gap-0.5 items-end h-4">
              <span className="w-1 h-1 bg-text-muted rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1 h-1 bg-text-muted rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1 h-1 bg-text-muted rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </span>
          </span>
        )}
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  // 优化重渲染：使用浅比较代替深度序列化
  // 比较关键属性：id、isStreaming、blocks 数量、最后一个块的内容长度
  const prevBlocks = prevProps.message.blocks;
  const nextBlocks = nextProps.message.blocks;

  // 基础属性比较
  if (prevProps.message.id !== nextProps.message.id) return false;
  if (prevProps.message.isStreaming !== nextProps.message.isStreaming) return false;

  // blocks 数量不同，需要更新
  if (prevBlocks.length !== nextBlocks.length) return false;

  // 对于流式消息，检查最后一个文本块的内容长度
  // 这比 JSON.stringify 快得多，且能捕获大部分更新
  if (nextProps.message.isStreaming && prevBlocks.length > 0) {
    const lastPrev = prevBlocks[prevBlocks.length - 1];
    const lastNext = nextBlocks[nextBlocks.length - 1];

    if (lastPrev.type === 'text' && lastNext.type === 'text') {
      // 内容长度变化需要更新
      if (lastPrev.content.length !== lastNext.content.length) return false;
    } else if (lastPrev.type !== lastNext.type) {
      return false;
    }

    // 检查工具调用块的状态变化
    for (let i = 0; i < prevBlocks.length; i++) {
      const pb = prevBlocks[i];
      const nb = nextBlocks[i];
      if (pb.type !== nb.type) return false;
      if (pb.type === 'tool_call' && nb.type === 'tool_call') {
        if (pb.status !== nb.status) return false;
        if (pb.output !== nb.output) return false;
      }
    }
  }

  // 非流式消息，认为没有变化
  return true;
});

/** 系统消息组件 */
const SystemBubble = memo(function SystemBubble({ content }: { content: string }) {
  return (
    <div className="flex justify-center my-2">
      <p className="text-sm text-text-muted italic">{content}</p>
    </div>
  );
});

/** 消息渲染器 */
function renderChatMessage(message: ChatMessage): React.ReactNode {
  switch (message.type) {
    case 'user':
      return <UserBubble key={message.id} message={message} />;
    case 'assistant':
      return <AssistantBubble key={message.id} message={message} />;
    case 'system':
      return <SystemBubble key={message.id} content={(message as any).content} />;
    default:
      return null;
  }
}

/** 空状态组件 */
const EmptyState = memo(function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-4">
      {/* Logo 图标 */}
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-primary-600 flex items-center justify-center shadow-glow mb-6 hover:shadow-glow-lg transition-all">
        <span className="text-3xl font-bold text-white">P</span>
      </div>

      {/* 标题 */}
      <h1 className="text-2xl font-semibold text-text-primary mb-2">
        Polaris
      </h1>

      {/* 描述 */}
      <p className="text-text-secondary mb-8 max-w-md">
        智能编程助手，让代码编辑更高效
      </p>

      {/* 功能列表 */}
      <div className="grid grid-cols-3 gap-4 max-w-lg">
        <div className="flex flex-col items-center gap-2 p-4 rounded-xl bg-background-surface border border-border shadow-soft hover:shadow-medium hover:border-border-strong transition-all">
          <div className="w-8 h-8 rounded-lg bg-success-faint flex items-center justify-center">
            <FolderOpen className="w-4 h-4 text-success" />
          </div>
          <span className="text-xs text-text-tertiary">文件管理</span>
        </div>
        <div className="flex flex-col items-center gap-2 p-4 rounded-xl bg-background-surface border border-border shadow-soft hover:shadow-medium hover:border-border-strong transition-all">
          <div className="w-8 h-8 rounded-lg bg-warning-faint flex items-center justify-center">
            <Code className="w-4 h-4 text-warning" />
          </div>
          <span className="text-xs text-text-tertiary">代码编辑</span>
        </div>
        <div className="flex flex-col items-center gap-2 p-4 rounded-xl bg-background-surface border border-border shadow-soft hover:shadow-medium hover:border-border-strong transition-all">
          <div className="w-8 h-8 rounded-lg bg-primary-faint flex items-center justify-center">
            <FileSearch className="w-4 h-4 text-primary" />
          </div>
          <span className="text-xs text-text-tertiary">智能分析</span>
        </div>
      </div>

      {/* 提示 */}
      <p className="text-text-tertiary text-sm mt-8">
        输入消息开始对话
      </p>
    </div>
  );
});

/**
 * 增强版聊天消息列表组件
 *
 * 使用内容块架构渲染消息，工具调用穿插在文本中间
 */
export function EnhancedChatMessages() {
  const { messages, archivedMessages, loadArchivedMessages } = useEventChatStore();

  const isEmpty = messages.length === 0;
  const hasArchive = archivedMessages.length > 0;

  // Virtuoso 引用，用于滚动控制
  const virtuosoRef = useRef<VirtuosoHandle>(null);

  // 智能自动滚动：用户在底部附近时自动滚动，离开底部时禁用
  const [autoScroll, setAutoScroll] = useState(true);

  // 当前可见的对话轮次索引
  const [currentRoundIndex, setCurrentRoundIndex] = useState(0);

  // 对话轮次分组
  const conversationRounds = useMemo(() => {
    return groupConversationRounds(messages);
  }, [messages]);

  // 检测用户是否在底部附近（基于像素距离）
  const handleAtBottomStateChange = useCallback((atBottom: boolean) => {
    setAutoScroll(atBottom);
  }, []);

  // 监听可见范围变化，更新当前轮次索引
  const handleRangeChange = useCallback((range: { startIndex: number; endIndex: number }) => {
    const { startIndex, endIndex } = range;
    // 使用可见区域中心来找到最相关的轮次
    const centerIndex = Math.floor((startIndex + endIndex) / 2);

    // 找到包含中心索引的轮次
    const round = conversationRounds.findIndex(r =>
      r.messageIndices.some(idx => idx >= startIndex && idx <= endIndex) &&
      r.messageIndices.some(idx => idx > centerIndex)
    );

    // 如果没找到更合适的，使用第一个包含范围内消息的轮次
    const fallbackRound = conversationRounds.findIndex(r =>
      r.messageIndices.some(idx => idx >= startIndex && idx <= endIndex)
    );

    const targetRound = round >= 0 ? round : fallbackRound;
    if (targetRound >= 0) {
      setCurrentRoundIndex(targetRound);
    }
  }, [conversationRounds]);

  // 滚动到指定轮次
  const scrollToRound = useCallback((roundIndex: number) => {
    const round = conversationRounds[roundIndex];
    if (!round || !virtuosoRef.current) return;

    // 优先跳转到 AI 回复，如果没有则跳转到用户消息
    const targetIndex = round.assistantMessage
      ? round.messageIndices[1]  // AI 回复索引
      : round.messageIndices[0]; // 用户消息索引

    virtuosoRef.current.scrollToIndex({
      index: targetIndex,
      align: 'start',
      behavior: 'smooth',
    });

    setAutoScroll(false); // 禁用自动滚动
  }, [conversationRounds]);

  // 滚动到底部
  const scrollToBottom = useCallback(() => {
    if (!virtuosoRef.current) return;

    // 使用 scrollTo 替代 scrollToIndex，确保滚动到容器的物理底部
    virtuosoRef.current.scrollTo({
      top: Number.MAX_SAFE_INTEGER,
      behavior: 'smooth',
    });

    setAutoScroll(true); // 启用自动滚动
  }, []);

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {/* 归档消息提示 */}
      {hasArchive && (
        <div className="flex justify-center py-3 bg-background-surface border-b border-border">
          <button
            onClick={loadArchivedMessages}
            className="text-xs text-primary hover:text-primary-hover transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
            </svg>
            加载 {archivedMessages.length} 条历史消息
          </button>
        </div>
      )}

      {/* 消息列表 */}
      <div className="flex-1 min-h-0 relative">
        <div className="h-full">
          {isEmpty ? (
            <EmptyState />
          ) : (
            <Virtuoso
              ref={virtuosoRef}
              style={{ height: '100%' }}
              data={messages}
              itemContent={(_index, item) => renderChatMessage(item)}
              components={{
                EmptyPlaceholder: () => null,
                Footer: () => <div style={{ height: '120px' }} />,
              }}
              followOutput={autoScroll ? 'smooth' : false}
              atBottomStateChange={handleAtBottomStateChange}
              atBottomThreshold={150}
              rangeChanged={handleRangeChange}
              increaseViewportBy={{ top: 100, bottom: 300 }}
              initialTopMostItemIndex={messages.length - 1}
            />
          )}
        </div>

        {/* 聊天导航器 */}
        {!isEmpty && (
          <ChatNavigator
            rounds={conversationRounds}
            currentRoundIndex={currentRoundIndex}
            onScrollToBottom={scrollToBottom}
            onScrollToRound={scrollToRound}
          />
        )}
      </div>
    </div>
  );
}
