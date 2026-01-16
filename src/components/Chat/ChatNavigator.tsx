/**
 * 聊天导航组件
 *
 * 功能：
 * - 右侧进度条显示当前位置
 * - 悬停展开对话目录
 * - 点击对话轮次快速跳转
 * - 一键回到底部
 */

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { clsx } from 'clsx';
import { MessageCircle, User, Bot, ArrowDown, Wrench } from 'lucide-react';
import type { ConversationRound } from '../../utils/conversationRounds';

interface ChatNavigatorProps {
  /** 对话轮次列表 */
  rounds: ConversationRound[];
  /** 当前可见的轮次索引 */
  currentRoundIndex: number;
  /** 回到底部回调 */
  onScrollToBottom: () => void;
  /** 滚动到指定轮次 */
  onScrollToRound: (roundIndex: number) => void;
}

/** 延迟隐藏时间（毫秒） */
const HIDE_DELAY = 150;

/** 悬停展开延迟（毫秒） */
const SHOW_DELAY = 0;

/** 触发区域宽度（像素） */
const TRIGGER_WIDTH = 20;

/** 进度条基础宽度（像素） */
const PROGRESS_BAR_WIDTH = 6;

/** 进度条悬停宽度（像素） */
const PROGRESS_BAR_HOVER_WIDTH = 12;

/** 触发区域垂直范围 - 中间 40% */
const TRIGGER_AREA_TOP = '30%';
const TRIGGER_AREA_BOTTOM = '30%';

/** 面板最小顶部间距 */
const PANEL_MIN_TOP = 8;

export function ChatNavigator({
  rounds,
  currentRoundIndex,
  onScrollToBottom,
  onScrollToRound,
}: ChatNavigatorProps) {
  const [isPanelVisible, setIsPanelVisible] = useState(false);

  // 使用 ref 存储悬停状态，避免闭包陷阱
  const isHoveringRef = useRef(false);
  const isHoveringPanelRef = useRef(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 当前高亮项的 ref，用于自动滚动到可视区域
  const currentItemRef = useRef<HTMLDivElement>(null);

  // 清除所有定时器
  const clearTimers = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    if (showTimerRef.current) {
      clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
  }, []);

  // 隐藏面板（带延迟）
  const scheduleHide = useCallback(() => {
    clearTimers();
    hideTimerRef.current = setTimeout(() => {
      // 直接读取 ref 的当前值，不依赖闭包
      if (!isHoveringRef.current && !isHoveringPanelRef.current) {
        setIsPanelVisible(false);
      }
    }, HIDE_DELAY);
  }, [clearTimers]);

  // 显示面板（带延迟）
  const scheduleShow = useCallback(() => {
    clearTimers();
    showTimerRef.current = setTimeout(() => {
      setIsPanelVisible(true);
    }, SHOW_DELAY);
  }, [clearTimers]);

  // 进度条悬停处理
  const handleProgressBarMouseEnter = useCallback(() => {
    isHoveringRef.current = true;
    setIsHovering(true);
    scheduleShow();
  }, [scheduleShow]);

  const handleProgressBarMouseLeave = useCallback(() => {
    isHoveringRef.current = false;
    setIsHovering(false);
    scheduleHide();
  }, [scheduleHide]);

  // 面板悬停处理
  const handlePanelMouseEnter = useCallback(() => {
    isHoveringPanelRef.current = true;
    clearTimers();
  }, [clearTimers]);

  const handlePanelMouseLeave = useCallback(() => {
    isHoveringPanelRef.current = false;
    scheduleHide();
  }, [scheduleHide]);

  // 组件卸载时清理定时器
  useEffect(() => {
    return () => clearTimers();
  }, [clearTimers]);

  // 计算当前位置指示器的位置
  // 映射到中间 40% 区域（30%-70%）
  const currentPositionPercent = useMemo(() => {
    if (rounds.length === 0) return 30;
    if (currentRoundIndex < 0) return 30;
    if (currentRoundIndex >= rounds.length) return 70;
    const fullPercent = ((currentRoundIndex + 1) / rounds.length) * 100;
    // 映射 0-100% 到 30-70% 范围
    return 30 + (fullPercent * 0.4);
  }, [currentRoundIndex, rounds.length]);

  // 计算面板动态位置，确保不超出视口
  const panelStyle = useMemo(() => {
    const viewportHeight = window.innerHeight;
    const triggerTop = viewportHeight * 0.3;  // 30% 位置
    const panelMaxHeight = viewportHeight * 0.4;  // 40vh

    // 确保面板顶部不会超出视口
    const top = Math.max(triggerTop, PANEL_MIN_TOP);

    return {
      right: '20px',
      top: `${top}px`,
      maxHeight: `${panelMaxHeight}px`,
    };
  }, []);

  // 当面板显示或当前项变化时，滚动到当前项
  useEffect(() => {
    if (isPanelVisible && currentItemRef.current) {
      currentItemRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }
  }, [isPanelVisible, currentRoundIndex]);

  // 悬停状态（用于样式）
  const [isHovering, setIsHovering] = useState(false);

  // 点击对话轮次
  const handleRoundClick = useCallback((roundIndex: number) => {
    onScrollToRound(roundIndex);
    setIsPanelVisible(false);
  }, [onScrollToRound]);

  // 点击回到底部
  const handleScrollToBottom = useCallback(() => {
    onScrollToBottom();
    setIsPanelVisible(false);
  }, [onScrollToBottom]);

  if (rounds.length === 0) {
    return null;
  }

  return (
    <div className="absolute inset-y-0 right-0 pointer-events-none">
      {/* 透明触发区域 - 中间 40% */}
      <div
        className="absolute pointer-events-auto cursor-pointer"
        style={{
          right: '16px',
          width: TRIGGER_WIDTH,
          top: TRIGGER_AREA_TOP,
          bottom: TRIGGER_AREA_BOTTOM,
        }}
        onMouseEnter={handleProgressBarMouseEnter}
        onMouseLeave={handleProgressBarMouseLeave}
      />

      {/* 进度条（仅视觉） - 中间 40% */}
      <div
        className={clsx(
          'absolute rounded-l-full transition-all duration-200 pointer-events-none',
          isHovering || isPanelVisible
            ? 'bg-primary/50 shadow-glow'
            : 'bg-primary/30',
        )}
        style={{
          right: '16px',
          width: isHovering || isPanelVisible ? PROGRESS_BAR_HOVER_WIDTH : PROGRESS_BAR_WIDTH,
          top: TRIGGER_AREA_TOP,
          bottom: TRIGGER_AREA_BOTTOM,
        }}
      />

      {/* 当前位置指示器 - 映射到 30-70% 范围 */}
      <div
        className={clsx(
          'absolute bg-primary rounded-full shadow-glow transition-all duration-200 pointer-events-none',
          isHovering || isPanelVisible
            ? 'w-3 h-3 bg-primary'
            : 'w-2.5 h-2.5 bg-primary/80',
        )}
        style={{
          right: '16px',
          top: `${currentPositionPercent}%`,
          transform: 'translate(50%, -50%)'
        }}
      />

      {/* 悬浮面板 - 对齐中间区域 */}
      {isPanelVisible && (
        <div
          className={clsx(
            'absolute w-56 bg-background-elevated/95 backdrop-blur-sm',
            'border border-border rounded-lg shadow-lg shadow-primary/10',
            'overflow-hidden animate-in fade-in zoom-in-95 duration-150',
            'pointer-events-auto'
          )}
          style={panelStyle}
          onMouseEnter={handlePanelMouseEnter}
          onMouseLeave={handlePanelMouseLeave}
        >
          {/* 标题 */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-border-subtle bg-background-surface">
            <span className="text-xs font-medium text-text-secondary flex items-center gap-1.5">
              <MessageCircle className="w-3.5 h-3.5" />
              对话导航
            </span>
            <span className="text-xs text-text-tertiary">
              {rounds.length} 轮
            </span>
          </div>

          {/* 对话轮次列表 */}
          <div className="overflow-y-auto chat-navigator-list" style={{ maxHeight: 'calc(40vh - 100px)' }}>
            {rounds.map((round, idx) => (
              <div
                key={round.roundIndex}
                ref={idx === currentRoundIndex ? currentItemRef : null}
                className={clsx(
                  'px-3 py-2 border-b border-border-subtle/50 cursor-pointer transition-colors',
                  'hover:bg-background-hover',
                  idx === currentRoundIndex && 'bg-primary/10 border-l-2 border-l-primary'
                )}
                onClick={() => handleRoundClick(idx)}
              >
                {/* 轮次标题 */}
                <div className="flex items-center gap-2 mb-1">
                  <span className={clsx(
                    'text-xs font-medium',
                    idx === currentRoundIndex ? 'text-primary' : 'text-text-tertiary'
                  )}>
                    第 {round.roundIndex + 1} 轮
                  </span>
                  {round.hasTools && (
                    <Wrench className="w-3 h-3 text-warning" />
                  )}
                  <span className="text-xs text-text-tertiary ml-auto">
                    {round.timestamp}
                  </span>
                </div>

                {/* 用户消息 */}
                <div className="flex items-start gap-1.5 mb-1">
                  <User className="w-3 h-3 text-text-secondary shrink-0 mt-0.5" />
                  <p className="text-xs text-text-secondary line-clamp-1">
                    {round.userSummary}
                  </p>
                </div>

                {/* 助手回复 */}
                {round.assistantMessage ? (
                  <div className="flex items-start gap-1.5">
                    <Bot className="w-3 h-3 text-primary shrink-0 mt-0.5" />
                    <p className={clsx(
                      'text-xs line-clamp-1',
                      idx === currentRoundIndex ? 'text-text-primary' : 'text-text-tertiary'
                    )}>
                      {round.assistantSummary || '[回复中...]'}
                    </p>
                  </div>
                ) : (
                  <div className="flex items-start gap-1.5">
                    <Bot className="w-3 h-3 text-text-tertiary shrink-0 mt-0.5" />
                    <p className="text-xs text-text-tertiary italic">
                      等待回复...
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* 底部按钮 */}
          <div className="p-2 border-t border-border-subtle bg-background-surface">
            <button
              className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-text-secondary hover:text-primary hover:bg-primary/10 rounded-md transition-colors"
              onClick={handleScrollToBottom}
            >
              <ArrowDown className="w-4 h-4" />
              回到底部
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
