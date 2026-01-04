/**
 * 顶部菜单栏组件
 */

import { useState } from 'react';
import { useWorkspaceStore, useViewStore } from '../../stores';
import { useChatStore } from '../../stores';

interface TopMenuBarProps {
  onNewConversation: () => void;
  onSettings: () => void;
  onCreateWorkspace: () => void;
}

export function TopMenuBar({ onNewConversation, onSettings, onCreateWorkspace }: TopMenuBarProps) {
  const { getCurrentWorkspace } = useWorkspaceStore();
  const [showWorkspaceMenu, setShowWorkspaceMenu] = useState(false);
  const [showViewMenu, setShowViewMenu] = useState(false);
  const [showNewChatConfirm, setShowNewChatConfirm] = useState(false);
  const { clearMessages, messages } = useChatStore();

  const currentWorkspace = getCurrentWorkspace();

  const handleNewConversation = () => {
    // 如果有消息，显示确认对话框
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

  return (
    <div className="flex items-center justify-between px-4 h-10 bg-background-elevated border-b border-border shrink-0">
      {/* 左侧：Logo/应用名称 */}
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded bg-gradient-to-br from-primary to-primary-600 flex items-center justify-center shadow-glow">
          <span className="text-xs font-bold text-white">C</span>
        </div>
        <span className="text-sm font-medium text-text-primary">Claude Code Pro</span>
      </div>

      {/* 右侧：工作区 | 新对话 | 设置 */}
      <div className="flex items-center gap-1">
        {/* 工作区选择器 */}
        <div className="relative">
          <button
            onClick={() => setShowWorkspaceMenu(!showWorkspaceMenu)}
            className="min-w-0 max-w-[200px] flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs text-text-secondary
                     hover:text-text-primary hover:bg-background-hover transition-colors"
            title="切换工作区"
          >
            <span className="flex-1 truncate">
              {currentWorkspace?.name || '未选择工作区'}
            </span>
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
              <div className="absolute right-0 top-full mt-1 w-48 bg-background-surface border border-border rounded-lg shadow-xl z-20 overflow-hidden">
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

        {/* 分隔线 */}
        <div className="w-px h-4 bg-border-subtle" />

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

/** 工作区菜单内容 */
function WorkspaceMenuContent({ onClose, onCreateWorkspace }: { onClose: () => void; onCreateWorkspace: () => void }) {
  const { workspaces, currentWorkspaceId, switchWorkspace, deleteWorkspace } = useWorkspaceStore();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

  const handleSwitchWorkspace = async (id: string) => {
    if (id !== currentWorkspaceId) {
      await switchWorkspace(id);
    }
    onClose();
  };

  const handleCreateWorkspace = () => {
    onClose();
    onCreateWorkspace();
  };

  const handleDeleteWorkspace = async (id: string) => {
    try {
      await deleteWorkspace(id);
      setShowDeleteConfirm(null);
      // 如果删除后还有工作区，关闭菜单
      if (workspaces.length > 1) {
        onClose();
      }
    } catch (error) {
      console.error('删除工作区失败:', error);
    }
  };

  // 获取要删除的工作区信息
  const workspaceToDelete = workspaces.find(w => w.id === showDeleteConfirm);

  return (
    <div className="py-1">
      <div className="px-3 py-2 text-xs font-medium text-text-tertiary border-b border-border-subtle">
        工作区
      </div>

      {workspaces.length === 0 ? (
        <div className="px-3 py-4 text-center text-sm text-text-tertiary">
          暂无工作区
        </div>
      ) : (
        <div className="max-h-64 overflow-y-auto">
          {workspaces.map((workspace) => (
            <div
              key={workspace.id}
              className={`group relative flex items-center ${
                workspace.id === currentWorkspaceId
                  ? 'bg-primary/10'
                  : ''
              }`}
            >
              <button
                onClick={() => handleSwitchWorkspace(workspace.id)}
                className={`flex-1 text-left px-3 py-2 text-sm transition-colors ${
                  workspace.id === currentWorkspaceId
                    ? 'text-primary'
                    : 'text-text-secondary hover:text-text-primary hover:bg-background-hover'
                }`}
              >
                <div className="pr-6 font-medium truncate">{workspace.name}</div>
                <div className="text-xs truncate text-text-tertiary">
                  {workspace.path}
                </div>
              </button>

              {/* 删除按钮：只在非当前工作区且有多个工作区时显示 */}
              {workspace.id !== currentWorkspaceId && workspaces.length > 1 && (
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

              {/* 当前工作区标识 */}
              {workspace.id === currentWorkspaceId && (
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="border-t border-border-subtle mt-1 pt-1">
        <button
          onClick={handleCreateWorkspace}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-background-hover transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          创建工作区
        </button>
      </div>

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

/** View 菜单内容 */
function ViewMenuContent({ onClose }: { onClose: () => void }) {
  const { showSidebar, showEditor, showToolPanel, toggleSidebar, toggleEditor, toggleToolPanel, setAIOnlyMode, resetView } = useViewStore();

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
