import { useEffect, useCallback } from 'react';
import { useFileExplorerStore, useWorkspaceStore, useCommandStore } from '../../stores';
import { FileTree } from './FileTree';
import { SearchBar } from './SearchBar';

export function FileExplorer() {
  const {
    current_path,
    loading,
    is_refreshing,
    error,
    load_directory,
    refresh_directory,
    clear_error
  } = useFileExplorerStore();

  const { getCurrentWorkspace } = useWorkspaceStore();
  const { loadCustomCommands } = useCommandStore();

  // 监听工作区变化，自动加载新工作区
  useEffect(() => {
    const handleWorkspaceChange = (event: CustomEvent) => {
      const { workspaceId } = event.detail;
      console.log('Workspace changed:', workspaceId);
      // 获取当前工作区信息并加载
      const currentWorkspace = getCurrentWorkspace();

      if (currentWorkspace) {
        console.log('Loading workspace:', currentWorkspace.path);
        load_directory(currentWorkspace.path);
        // 加载自定义命令
        loadCustomCommands(currentWorkspace.path);
      }
    };

    window.addEventListener('workspace-changed', handleWorkspaceChange as EventListener);
    
    return () => {
      window.removeEventListener('workspace-changed', handleWorkspaceChange as EventListener);
    };
  }, [load_directory, getCurrentWorkspace]);

  // 快捷键支持
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // F5 或 Ctrl+R 刷新
      if (event.key === 'F5' || (event.ctrlKey && event.key === 'r')) {
        event.preventDefault();
        refresh_directory();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [refresh_directory]);

  // 初始化加载工作区目录
  useEffect(() => {
    const currentWorkspace = getCurrentWorkspace();

    if (currentWorkspace && current_path !== currentWorkspace.path) {
      console.log('Initial loading workspace:', currentWorkspace.path);
      load_directory(currentWorkspace.path);
      loadCustomCommands(currentWorkspace.path);
    }
  }, [load_directory, current_path, getCurrentWorkspace, loadCustomCommands]);

  const handleRefresh = useCallback(() => {
    clear_error();
    refresh_directory();
  }, [clear_error, refresh_directory]);

  const currentWorkspace = getCurrentWorkspace();

  return (
    <div className="h-full flex flex-col">
      {/* 顶部区域 */}
      <div className="border-b border-border bg-background-surface">
        {/* 第一行：工作区名称 */}
        <div className="px-3 py-2">
          <div className="text-sm font-medium text-text-primary truncate" title={currentWorkspace?.path}>
            {currentWorkspace?.name || '未选择工作区'}
          </div>
        </div>

        {/* 第二行：工具栏 */}
        <div className="flex items-center justify-between px-3 py-2 border-t border-border-subtle">
          {/* 左侧：工具按钮区域（预留扩展空间） */}
          <div className="flex items-center gap-1">
            {/* 未来可添加其他工具按钮，如：返回/前进、收起全部、显示隐藏文件等 */}
          </div>

          {/* 右侧：刷新按钮 */}
          <button
            onClick={handleRefresh}
            disabled={loading || is_refreshing}
            className={`
              p-1.5 rounded-lg transition-all duration-200
              ${loading || is_refreshing
                ? 'text-text-tertiary cursor-not-allowed'
                : 'text-text-secondary hover:text-text-primary hover:bg-background-hover'
              }
            `}
            title="刷新目录 (F5)"
          >
            <svg
              className={`w-4 h-4 ${is_refreshing ? 'animate-spin' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      {/* 搜索栏 */}
      <SearchBar />
      
      {/* 错误提示 */}
      {error && (
        <div className="mx-2 p-2 bg-danger-faint border border-danger/30 rounded-lg text-danger text-xs">
          {error}
        </div>
      )}

      {/* 文件树 */}
      <div className="flex-1 overflow-auto overflow-x-auto">
        <FileTree />
      </div>
    </div>
  );
}

/*
TODO: 后续优化方案 - 实现文件系统监听自动刷新
当前实现：手动刷新按钮 + F5快捷键
目标实现：
1. 使用 Rust notify crate 监听文件系统变化
2. 自动检测文件创建、删除、修改、重命名
3. 实时更新文件树，无需手动刷新
4. 优化监听性能，避免过度刷新
5. 处理监听错误和边界情况

技术方案：
- 后端：使用 notify::RecommendedWatcher 监听工作区目录
- 前端：通过 Tauri events 接收文件系统变化通知
- 缓存策略：智能更新受影响的目录节点
- 性能优化：防抖处理，避免频繁更新

实现优先级：高
预期收益：用户体验显著提升，工作流程更加流畅
*/