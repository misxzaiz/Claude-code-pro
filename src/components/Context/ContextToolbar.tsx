/**
 * 上下文工具栏组件
 * 显示当前选中的上下文，提供添加/移除操作
 */

import { useState, useCallback } from 'react';
import { clsx } from 'clsx';
import {
  File,
  X,
  ChevronDown,
  ChevronUp,
  Loader2,
} from 'lucide-react';
import { useContextStore } from '../../stores';
import type { FileReference } from '../../types/context';
import { ContextFilePicker } from './ContextFilePicker';

interface ContextToolbarProps {
  className?: string;
}

export function ContextToolbar({ className }: ContextToolbarProps) {
  const {
    selectedFiles,
    selectedSymbols,
    tokenBudget,
    isToolbarExpanded,
    removeFile,
    clearFiles,
    clearSymbols,
    addFiles,
    toggleToolbar,
  } = useContextStore();

  const [showFilePicker, setShowFilePicker] = useState(false);

  // 切换工具栏展开
  const handleToggle = useCallback(() => {
    toggleToolbar();
  }, [toggleToolbar]);

  // 添加文件
  const handleAddFiles = useCallback(async (files: FileReference[]) => {
    await addFiles(files);
    setShowFilePicker(false);
  }, [addFiles]);

  // 移除文件
  const handleRemoveFile = useCallback((e: React.MouseEvent, path: string) => {
    e.stopPropagation();
    removeFile(path);
  }, [removeFile]);

  // 清空所有
  const handleClearAll = useCallback(() => {
    clearFiles();
    clearSymbols();
  }, [clearFiles, clearSymbols]);

  // 获取文件名
  const getFileName = (path: string): string => {
    return path.split('/').pop() || path;
  };

  // 获取文件语言图标颜色
  const getLanguageColor = (language?: string): string => {
    const colors: Record<string, string> = {
      typescript: 'text-blue-400',
      javascript: 'text-yellow-400',
      python: 'text-green-400',
      rust: 'text-orange-400',
      go: 'text-cyan-400',
      java: 'text-red-400',
    };
    return colors[language || ''] || 'text-text-muted';
  };

  const selectedCount = selectedFiles.length + selectedSymbols.length;
  const totalTokens = tokenBudget.used;
  const maxTokens = tokenBudget.limit;
  const usagePercent = (totalTokens / maxTokens) * 100;

  return (
    <>
      <div className={clsx('border-t border-border bg-background-elevated', className)}>
        {/* 主工具栏 */}
        <div className="flex items-center gap-2 px-4 py-2">
          {/* 左侧：上下文类型按钮 */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowFilePicker(true)}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors',
                selectedFiles.length > 0
                  ? 'bg-primary-faint text-primary'
                  : 'text-text-secondary hover:bg-background-hover'
              )}
              title="添加文件"
            >
              <File className="w-4 h-4" />
              <span>文件</span>
              {selectedFiles.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-primary text-white">
                  {selectedFiles.length}
                </span>
              )}
            </button>

            {/* 符号和历史按钮暂未实现，隐藏 */}
            {/* <button
              className={clsx(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors',
                selectedSymbols.length > 0
                  ? 'bg-primary-faint text-primary'
                  : 'text-text-secondary hover:bg-background-hover'
              )}
              title="添加符号"
            >
              <Code2 className="w-4 h-4" />
              <span>符号</span>
            </button>

            <button
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-text-secondary hover:bg-background-hover transition-colors"
              title="添加历史上下文"
            >
              <History className="w-4 h-4" />
              <span>历史</span>
            </button> */}
          </div>

          {/* 分隔线 */}
          <div className="w-px h-5 bg-border mx-1" />

          {/* 中间：上下文预览（展开时显示） */}
          {isToolbarExpanded && selectedFiles.length > 0 && (
            <div className="flex-1 flex items-center gap-2 overflow-x-auto">
              {selectedFiles.slice(0, 5).map((file) => (
                <div
                  key={file.path}
                  className={clsx(
                    'flex items-center gap-1.5 px-2 py-1 rounded-lg border text-xs max-w-[200px] group',
                    'bg-background-surface border-border hover:border-primary transition-colors'
                  )}
                >
                  <File className={clsx('w-3.5 h-3.5 shrink-0', getLanguageColor(file.language))} />
                  <span className="truncate text-text-primary">{getFileName(file.path)}</span>
                  <button
                    onClick={(e) => handleRemoveFile(e, file.path)}
                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-background-hover text-text-muted hover:text-text-primary transition-all"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              {selectedFiles.length > 5 && (
                <span className="text-xs text-text-tertiary">
                  +{selectedFiles.length - 5} 更多
                </span>
              )}
            </div>
          )}

          {/* 右侧：Token 计量表和操作 */}
          <div className="flex items-center gap-2">
            {/* Token 计量表 */}
            <div
              className={clsx(
                'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs',
                usagePercent > 80 ? 'bg-error-faint text-error' : 'bg-background-surface text-text-secondary'
              )}
            >
              {usagePercent > 80 && <Loader2 className="w-3 h-3 animate-spin" />}
              <span className="font-mono">
                {totalTokens.toLocaleString()}/{maxTokens.toLocaleString()}
              </span>
              <span className="text-text-tertiary">Tokens</span>
            </div>

            {/* 清空按钮 */}
            {selectedCount > 0 && (
              <button
                onClick={handleClearAll}
                className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-background-hover transition-colors"
                title="清空所有上下文"
              >
                <X className="w-4 h-4" />
              </button>
            )}

            {/* 展开/收起按钮 */}
            <button
              onClick={handleToggle}
              className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-background-hover transition-colors"
              title={isToolbarExpanded ? '收起' : '展开'}
            >
              {isToolbarExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Token 进度条 */}
        <div className="px-4 pb-2">
          <div className="h-1 bg-background-surface rounded-full overflow-hidden">
            <div
              className={clsx(
                'h-full rounded-full transition-all duration-300',
                usagePercent > 80 ? 'bg-error' : usagePercent > 50 ? 'bg-warning' : 'bg-primary'
              )}
              style={{ width: `${Math.min(usagePercent, 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* 文件选择器 */}
      {showFilePicker && (
        <ContextFilePicker
          onClose={() => setShowFilePicker(false)}
          onConfirm={handleAddFiles}
        />
      )}
    </>
  );
}
