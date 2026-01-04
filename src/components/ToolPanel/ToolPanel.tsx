/**
 * 工具面板主组件
 */

import { useToolPanelStore } from '../../stores';
import { clsx } from 'clsx';
import { ToolList } from './ToolList';
import { ToolDetail } from './ToolDetail';

interface ToolPanelProps {
  className?: string;
  width?: number; // 可选的自定义宽度（像素）
}

export function ToolPanel({ className = '', width }: ToolPanelProps) {
  const { isOpen, selectedToolId, selectTool, tools } = useToolPanelStore();

  if (tools.length === 0 && !selectedToolId) {
    return null;
  }

  // 计算宽度：打开时使用自定义宽度或默认280px，关闭时固定40px
  const widthStyle = isOpen
    ? { width: width ? `${width}px` : '280px' }
    : { width: '40px' };

  return (
    <aside
      className={clsx(
        'flex flex-col border-l border-border bg-background-elevated transition-all duration-300 shrink-0',
        className
      )}
      style={widthStyle}
    >
      {/* 头部 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle shrink-0">
        {isOpen ? (
          <>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-primary shadow-glow" />
              <span className="text-sm font-medium text-text-primary">工具调用</span>
              <span className="text-xs text-text-tertiary bg-background-surface px-2 py-0.5 rounded-md">
                {tools.length}
              </span>
            </div>
            <button
              onClick={() => useToolPanelStore.getState().setOpen(false)}
              className="p-1.5 text-text-tertiary hover:text-text-primary transition-colors rounded-lg hover:bg-background-hover"
              title="折叠面板"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
              </svg>
            </button>
          </>
        ) : (
          <button
            onClick={() => useToolPanelStore.getState().setOpen(true)}
            className="w-full h-full flex items-center justify-center text-text-tertiary hover:text-text-primary transition-colors"
            title="展开工具面板"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
            </svg>
          </button>
        )}
      </div>

      {/* 内容区 */}
      {isOpen && (
        <div className="flex-1 overflow-hidden">
          {selectedToolId ? (
            <ToolDetail
              toolId={selectedToolId}
              onBack={() => selectTool(null)}
            />
          ) : (
            <ToolList />
          )}
        </div>
      )}

      {/* 底部状态栏 */}
      {isOpen && !selectedToolId && (
        <div className="px-4 py-3 border-t border-border-subtle text-xs text-text-tertiary bg-background-surface">
          <div className="flex items-center justify-between">
            <span>运行中: {tools.filter(t => t.status === 'running').length}</span>
            <span>完成: {tools.filter(t => t.status === 'completed').length}</span>
          </div>
        </div>
      )}
    </aside>
  );
}
