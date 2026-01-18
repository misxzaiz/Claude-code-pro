/**
 * 顶部菜单栏组件
 */

import { useState } from 'react';
import { useWorkspaceStore, useViewStore, useEventChatStore, useConfigStore, useAIChatStore } from '../../stores';
import { useFloatingWindowStore } from '../../stores/floatingWindowStore';
import * as tauri from '../../services/tauri';
import { exportToMarkdown, generateFileName } from '../../services/chatExport';
import { IconHistory } from '../Common/Icons';
import type { UnifiedHistoryItem } from '../../stores/aiChatStore';

interface TopMenuBarProps {
  onNewConversation: () => void;
  onSettings: () => void;
  onCreateWorkspace: () => void;
}

export function TopMenuBar({ onNewConversation, onSettings, onCreateWorkspace }: TopMenuBarProps) {
  const { config } = useConfigStore();
  const { getCurrentWorkspace } = useWorkspaceStore();
  const { showFloatingWindow } = useFloatingWindowStore();
  const [showWorkspaceMenu, setShowWorkspaceMenu] = useState(false);
  const [showViewMenu, setShowViewMenu] = useState(false);
  const [showHistoryMenu, setShowHistoryMenu] = useState(false);
  const [showNewChatConfirm, setShowNewChatConfirm] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [historyItems, setHistoryItems] = useState<UnifiedHistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [restoringSession, setRestoringSession] = useState<string | null>(null);
  const { clearMessages, messages } = useEventChatStore();
  const { restoreFromHistory, getUnifiedHistory } = useAIChatStore();

  const currentWorkspace = getCurrentWorkspace();

  // 计算上下文工作区数量
  const contextCount = useWorkspaceStore(state => state.contextWorkspaceIds.length);

  // 导出对话
  const handleExportChat = async () => {
    if (messages.length === 0) {
      return;
    }

    setIsExporting(true);
    try {
      const content = exportToMarkdown(messages, currentWorkspace?.name);
      const fileName = generateFileName('md');
      const filePath = await tauri.saveChatToFile(content, fileName);

      if (filePath) {
        console.log('对话已导出到:', filePath);
      }
    } catch (error) {
      console.error('导出对话失败:', error);
    } finally {
      setIsExporting(false);
    }
  };

  const handleNewConversation = () => {
    if (messages.length > 0) {
      setShowNewChatConfirm(true);
    } else {
      clearMessages();
      onNewConversation();
    }
  };

  const confirmNewChat = () => {
    clearMessages();
    onNewConversation();
    setShowNewChatConfirm(false);
  };

  // 加载历史会话
  const handleLoadHistory = async () => {
    setLoadingHistory(true);
    try {
      const items = await getUnifiedHistory();
      setHistoryItems(items.slice(0, 10)); // 只显示最近 10 个
    } catch (e) {
      console.error('[TopMenuBar] 加载历史失败:', e);
    } finally {
      setLoadingHistory(false);
    }
  };

  // 恢复会话
  const handleRestoreSession = async (sessionId: string, engineId: 'claude-code' | 'iflow') => {
    setRestoringSession(sessionId);
    try {
      const success = await restoreFromHistory(sessionId, engineId);
      if (success) {
        console.log('[TopMenuBar] 会话已恢复:', sessionId);
        setShowHistoryMenu(false);
      } else {
        console.error('[TopMenuBar] 恢复会话失败');
      }
    } catch (e) {
      console.error('[TopMenuBar] 恢复会话出错:', e);
    } finally {
      setRestoringSession(null);
    }
  };

  // 打开历史菜单时加载历史
  const handleOpenHistoryMenu = () => {
    setShowHistoryMenu(!showHistoryMenu);
    if (!showHistoryMenu) {
      handleLoadHistory();
    }
  };

  return (
    <div className="flex items-center justify-between px-4 h-10 bg-background-elevated border-b border-border shrink-0">
      {/* 左侧：Logo/应用名称 */}
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded bg-gradient-to-br from-primary to-primary-600 flex items-center justify-center shadow-glow">
          <span className="text-xs font-bold text-white">P</span>
        </div>
        <span className="text-sm font-medium text-text-primary">Polaris</span>
      </div>

      {/* 右侧：工作区 | 新对话 | 设置 */}
      <div className="flex items-center gap-1">
        {/* 工作区选择器 - 显示上下文数量 */}
        <div className="relative">
          <button
            onClick={() => setShowWorkspaceMenu(!showWorkspaceMenu)}
            className="min-w-0 max-w-[200px] flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs text-text-secondary
                     hover:text-text-primary hover:bg-background-hover transition-colors"
            title="切换工作区和关联工作区"
          >
            <span className="flex-1 truncate">
              {currentWorkspace?.name || '未选择工作区'}
            </span>
            {contextCount > 0 && (
              <span className="flex items-center justify-center w-4 h-4 text-xs bg-primary/20 text-primary rounded-full">
                {contextCount}
              </span>
            )}
            <svg className="shrink-0 w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* 工作区下拉菜单 */}
          {showWorkspaceMenu && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowWorkspaceMenu(false)}
              />
              <div className="absolute right-0 top-full mt-1 w-56 bg-background-surface border border-border rounded-lg shadow-xl z-20 overflow-hidden">
                <WorkspaceMenuContent
                  onClose={() => setShowWorkspaceMenu(false)}
                  onCreateWorkspace={onCreateWorkspace}
                />
              </div>
            </>
          )}
        </div>

        {/* 分隔线 */}
        <div className="w-px h-4 bg-border-subtle" />

        {/* View 菜单 */}
        <div className="relative">
          <button
            onClick={() => setShowViewMenu(!showViewMenu)}
            className="px-2.5 py-1 rounded-md text-xs text-text-secondary
                     hover:text-text-primary hover:bg-background-hover transition-colors"
          >
            View
          </button>

          {/* View 下拉菜单 */}
          {showViewMenu && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowViewMenu(false)}
              />
              <div className="absolute right-0 top-full mt-1 w-40 bg-background-surface border border-border rounded-lg shadow-xl z-20 overflow-hidden">
                <ViewMenuContent onClose={() => setShowViewMenu(false)} />
              </div>
            </>
          )}
        </div>

        {/* 历史会话菜单 */}
        <div className="relative">
          <button
            onClick={handleOpenHistoryMenu}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs text-text-secondary
                     hover:text-text-primary hover:bg-background-hover transition-colors"
            title="历史会话"
          >
            <IconHistory size={14} />
            <span>历史</span>
          </button>

          {/* 历史会话下拉菜单 */}
          {showHistoryMenu && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowHistoryMenu(false)}
              />
              <div className="absolute right-0 top-full mt-1 w-80 bg-background-surface border border-border rounded-lg shadow-xl z-20 overflow-hidden">
                <HistoryMenuContent
                  historyItems={historyItems}
                  loading={loadingHistory}
                  restoringSession={restoringSession}
                  onRestore={handleRestoreSession}
                />
              </div>
            </>
          )}
        </div>

        {/* 分隔线 */}
        <div className="w-px h-4 bg-border-subtle" />

        {/* 悬浮窗切换按钮 - 仅在手动模式且启用悬浮窗时显示 */}
        {config?.floatingWindow?.enabled && config?.floatingWindow?.mode === 'manual' && (
          <button
            onClick={showFloatingWindow}
            className="p-1.5 rounded-md text-text-tertiary hover:text-text-primary hover:bg-background-hover transition-colors"
            title="切换到悬浮窗"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
          </button>
        )}

        {/* 导出对话按钮 */}
        <button
          onClick={handleExportChat}
          disabled={messages.length === 0 || isExporting}
          className="p-1.5 rounded-md text-text-tertiary hover:text-text-primary hover:bg-background-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="导出对话"
        >
          {isExporting ? (
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 2l4 4-4 4" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 6h-4" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l4-4m-4 4h4" />
            </svg>
          )}
        </button>

        {/* 新对话按钮 */}
        <button
          onClick={handleNewConversation}
          className="p-1.5 rounded-md text-text-tertiary hover:text-text-primary hover:bg-background-hover transition-colors"
          title="新对话 (Cmd+N)"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
        </button>

        {/* 设置按钮 */}
        <button
          onClick={onSettings}
          className="p-1.5 rounded-md text-text-tertiary hover:text-text-primary hover:bg-background-hover transition-colors"
          title="设置"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c-.94 1.543.826 3.31 2.37 2.37.996.608 2.296.07 2.572-1.065c1.756-.426 1.756-2.924 0-3.35a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c.94-1.543-.826-3.31 2.37-2.37.996-.608 2.296-.07 2.572 1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </div>

      {/* 新对话确认对话框 */}
      {showNewChatConfirm && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-50"
            onClick={() => setShowNewChatConfirm(false)}
          />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-80 bg-background-elevated rounded-xl border border-border shadow-xl p-5">
            <h3 className="text-base font-semibold text-text-primary mb-2">
              确认新对话
            </h3>
            <p className="text-sm text-text-secondary mb-5">
              当前对话有 {messages.length} 条消息，确定要开始新对话吗？
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowNewChatConfirm(false)}
                className="px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary hover:bg-background-hover rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={confirmNewChat}
                className="px-3 py-1.5 text-sm bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors"
              >
                确认
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * 工作区菜单内容
 */
function WorkspaceMenuContent({ onCreateWorkspace }: {
  onClose?: () => void;  // 保留以保持兼容性，但不再使用
  onCreateWorkspace: () => void;
}) {
  const {
    workspaces,
    currentWorkspaceId,
    contextWorkspaceIds,
    switchWorkspace,
    deleteWorkspace,
    toggleContextWorkspace,
    getCurrentWorkspace,
  } = useWorkspaceStore();

  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

  const handleSwitchWorkspace = async (id: string) => {
    if (id !== currentWorkspaceId) {
      await switchWorkspace(id);
    }
  };

  const handleCreateWorkspace = () => {
    onCreateWorkspace();
  };

  const handleDeleteWorkspace = async (id: string) => {
    try {
      await deleteWorkspace(id);
      setShowDeleteConfirm(null);
    } catch (error) {
      console.error('删除工作区失败:', error);
    }
  };

  const handleToggleContext = (id: string) => {
    toggleContextWorkspace(id);
  };

  const workspaceToDelete = workspaces.find(w => w.id === showDeleteConfirm);
  const currentWorkspace = getCurrentWorkspace();
  const contextWorkspaces = workspaces.filter(w => contextWorkspaceIds.includes(w.id));

  return (
    <div className="py-1 max-h-[60vh] overflow-y-auto">
      {/* 当前工作区 */}
      <div className="px-3 py-2 text-xs font-medium text-text-tertiary border-b border-border-subtle flex items-center justify-between">
        <span>当前工作区</span>
        <button
          onClick={handleCreateWorkspace}
          className="text-primary hover:text-primary-hover transition-colors"
        >
          + 创建
        </button>
      </div>

      <div className="max-h-48 overflow-y-auto">
        {workspaces.map((workspace) => {
          const isCurrent = workspace.id === currentWorkspaceId;
          const isContext = contextWorkspaceIds.includes(workspace.id);

          return (
            <div
              key={workspace.id}
              className={`group relative flex items-center ${
                isCurrent ? 'bg-primary/10' : ''
              }`}
            >
              {/* 活动工作区指示 */}
              {isCurrent && (
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />
              )}

              <button
                onClick={() => handleSwitchWorkspace(workspace.id)}
                className={`flex-1 text-left px-3 py-2 text-sm transition-colors ${
                  isCurrent
                    ? 'text-primary'
                    : 'text-text-secondary hover:text-text-primary hover:bg-background-hover'
                }`}
              >
                <div className="pr-12 font-medium truncate flex items-center gap-2">
                  {isCurrent && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
                  {workspace.name}
                </div>
                <div className="text-xs truncate text-text-tertiary">
                  {workspace.path}
                </div>
              </button>

              {/* 上下文复选框（所有工作区都显示） */}
              {workspaces.length > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleContext(workspace.id);
                  }}
                  className={`absolute right-8 top-1/2 -translate-y-1/2 p-1 rounded transition-colors ${
                    isContext
                      ? 'text-primary bg-primary/10'
                      : 'text-text-tertiary hover:text-text-primary hover:bg-background-hover'
                  }`}
                  title={isContext ? '从关联移除' : '添加到关联'}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    {isContext ? (
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 4.784M14.12 14.12a3 3 0 100-4.243m4.242 4.242L9.878 9.878" />
                    )}
                  </svg>
                </button>
              )}

              {/* 删除按钮（非当前工作区） */}
              {!isCurrent && workspaces.length > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowDeleteConfirm(workspace.id);
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-text-tertiary hover:text-danger hover:bg-background-surface opacity-0 group-hover:opacity-100 transition-opacity"
                  title="删除工作区"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* 关联工作区区域 */}
      <div className="border-t border-border-subtle mt-1 pt-1">
        <div className="px-3 py-2 text-xs text-text-tertiary flex items-center justify-between">
          <span className="flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            关联工作区 ({contextWorkspaces.length + 1}) {/* +1 包含当前工作区 */}
          </span>
        </div>

        {contextWorkspaces.length > 0 ? (
          <div className="max-h-32 overflow-y-auto">
            {/* 当前工作区 */}
            {currentWorkspace && (
              <div className="group flex items-center px-3 py-1.5 text-sm text-text-secondary bg-primary/5">
                <span className="w-2 h-2 rounded-full bg-primary mr-2" />
                <span className="flex-1 truncate">{currentWorkspace.name}</span>
                <span className="text-xs text-text-tertiary mr-2">当前工作区</span>
              </div>
            )}
            {/* 关联工作区列表 */}
            {contextWorkspaces.map((workspace) => (
              <div
                key={workspace.id}
                className="group flex items-center px-3 py-1.5 text-sm text-text-secondary hover:bg-background-hover"
              >
                <span className="w-2 h-2 rounded-full bg-primary/50 mr-2" />
                <span className="flex-1 truncate">{workspace.name}</span>
                <button
                  onClick={() => handleToggleContext(workspace.id)}
                  className="p-1 rounded text-text-tertiary hover:text-danger opacity-0 group-hover:opacity-100 transition-opacity"
                  title="从关联移除"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-3 py-3 text-xs text-text-tertiary text-center">
            未设置关联工作区
          </div>
        )}
      </div>

      {/* 提示信息 */}
      {contextWorkspaces.length > 0 && (
        <div className="mx-2 my-2 p-2 bg-primary/5 border border-primary/20 rounded text-xs text-text-secondary">
          AI 可访问关联工作区
        </div>
      )}

      {/* 删除确认弹窗 */}
      {showDeleteConfirm && workspaceToDelete && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-50"
            onClick={() => setShowDeleteConfirm(null)}
          />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-80 bg-background-elevated rounded-xl border border-border shadow-xl p-5">
            <h3 className="text-base font-semibold text-text-primary mb-2">
              删除工作区
            </h3>
            <p className="text-sm text-text-secondary mb-4">
              确定要删除 <span className="font-medium text-text-primary">"{workspaceToDelete.name}"</span> 吗？
            </p>
            <p className="text-xs text-text-tertiary mb-5">
              此操作只会从列表中移除该工作区，不会删除实际的文件夹。
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className="px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary hover:bg-background-hover rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={() => handleDeleteWorkspace(showDeleteConfirm)}
                className="px-3 py-1.5 text-sm bg-danger text-white rounded-lg hover:bg-danger-hover transition-colors"
              >
                删除
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * View 菜单内容
 */
function ViewMenuContent({ onClose }: { onClose: () => void }) {
  const {
    showSidebar,
    showEditor,
    showToolPanel,
    showDeveloperPanel,
    toggleSidebar,
    toggleEditor,
    toggleToolPanel,
    toggleDeveloperPanel,
    setAIOnlyMode,
    resetView
  } = useViewStore();

  const handleToggle = (action: () => void) => {
    action();
    onClose();
  };

  return (
    <div className="py-1">
      <button
        onClick={() => handleToggle(toggleSidebar)}
        className="w-full flex items-center justify-between gap-3 px-3 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-background-hover transition-colors"
      >
        <span>文件浏览器</span>
        <div className={`w-4 h-4 rounded border ${showSidebar ? 'bg-primary border-primary' : 'border-border'} flex items-center justify-center`}>
          {showSidebar && (
            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>
      </button>

      <button
        onClick={() => handleToggle(toggleEditor)}
        className="w-full flex items-center justify-between gap-3 px-3 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-background-hover transition-colors"
      >
        <span>编辑器</span>
        <div className={`w-4 h-4 rounded border ${showEditor ? 'bg-primary border-primary' : 'border-border'} flex items-center justify-center`}>
          {showEditor && (
            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>
      </button>

      <button
        onClick={() => handleToggle(toggleToolPanel)}
        className="w-full flex items-center justify-between gap-3 px-3 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-background-hover transition-colors"
      >
        <span>工具面板</span>
        <div className={`w-4 h-4 rounded border ${showToolPanel ? 'bg-primary border-primary' : 'border-border'} flex items-center justify-center`}>
          {showToolPanel && (
            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>
      </button>

      <button
        onClick={() => handleToggle(toggleDeveloperPanel)}
        className="w-full flex items-center justify-between gap-3 px-3 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-background-hover transition-colors"
      >
        <span className="flex items-center gap-2">
          Developer
          <span className="text-xs text-text-tertiary bg-background-surface px-1.5 py-0.5 rounded">调试</span>
        </span>
        <div className={`w-4 h-4 rounded border ${showDeveloperPanel ? 'bg-primary border-primary' : 'border-border'} flex items-center justify-center`}>
          {showDeveloperPanel && (
            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>
      </button>

      <div className="border-t border-border-subtle mt-1 pt-1">
        <button
          onClick={() => handleToggle(setAIOnlyMode)}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-background-hover transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          仅 AI 对话
        </button>
      </div>

      <div className="border-t border-border-subtle mt-1 pt-1">
        <button
          onClick={() => handleToggle(resetView)}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-background-hover transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          重置视图
        </button>
      </div>
    </div>
  );
}

/**
 * 历史会话菜单内容
 */
function HistoryMenuContent({
  historyItems,
  loading,
  restoringSession,
  onRestore
}: {
  historyItems: UnifiedHistoryItem[];
  loading: boolean;
  restoringSession: string | null;
  onRestore: (sessionId: string, engineId: 'claude-code' | 'iflow') => void;
}) {
  // 格式化时间
  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return '刚刚';
    if (diffMins < 60) return `${diffMins} 分钟前`;
    if (diffHours < 24) return `${diffHours} 小时前`;
    if (diffDays < 7) return `${diffDays} 天前`;

    return date.toLocaleDateString('zh-CN', {
      month: 'short',
      day: 'numeric',
    });
  };

  // 获取引擎名称
  const getEngineName = (engineId: 'claude-code' | 'iflow') => {
    return engineId === 'claude-code' ? 'Claude Code' : 'IFlow';
  };

  // 获取引擎颜色
  const getEngineColor = (engineId: 'claude-code' | 'iflow') => {
    return engineId === 'claude-code'
      ? 'text-blue-500 bg-blue-50 dark:bg-blue-900/20'
      : 'text-purple-500 bg-purple-50 dark:bg-purple-900/20';
  };

  return (
    <div className="py-1">
      {/* 头部 */}
      <div className="px-3 py-2 border-b border-border-subtle">
        <h3 className="text-sm font-medium text-text-primary">历史会话</h3>
      </div>

      {/* 加载状态 */}
      {loading && (
        <div className="flex items-center justify-center py-8">
          <svg className="w-5 h-5 animate-spin text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </div>
      )}

      {/* 历史会话列表 */}
      {!loading && historyItems.length === 0 && (
        <div className="flex flex-col items-center justify-center py-8 text-text-tertiary">
          <IconHistory size={24} className="mb-2 opacity-50" />
          <p className="text-sm">暂无历史会话</p>
        </div>
      )}

      {!loading && historyItems.length > 0 && (
        <div className="max-h-80 overflow-y-auto">
          {historyItems.map((item) => {
            const isRestoring = restoringSession === item.id;

            return (
              <button
                key={item.id}
                onClick={() => onRestore(item.id, item.engineId)}
                disabled={isRestoring}
                className="w-full text-left px-3 py-2.5 hover:bg-background-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed border-b border-border-subtle last:border-b-0"
              >
                <div className="flex items-start gap-2">
                  {/* 引擎标识 */}
                  <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${getEngineColor(item.engineId)}`}>
                    {getEngineName(item.engineId)}
                  </span>

                  {/* 标题 */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-text-primary truncate">
                      {item.title}
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-xs text-text-tertiary">
                      <span>{item.messageCount} 条消息</span>
                      <span>•</span>
                      <span>{formatTime(item.timestamp)}</span>
                    </div>
                  </div>

                  {/* 恢复指示器 */}
                  {isRestoring && (
                    <svg className="w-4 h-4 animate-spin text-primary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* 底部提示 */}
      {!loading && historyItems.length > 0 && (
        <div className="px-3 py-2 border-t border-border-subtle text-xs text-text-tertiary">
          显示最近 {historyItems.length} 个会话
        </div>
      )}
    </div>
  );
}
