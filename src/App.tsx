import { useEffect, useState, useRef } from 'react';
import { Layout, Sidebar, Main, StatusIndicator, SettingsModal, FileExplorer, ResizeHandle, ConnectingOverlay, ErrorBoundary } from './components/Common';
import { EnhancedChatMessages, ChatInput } from './components/Chat';
import { ToolPanel } from './components/ToolPanel';
import { EditorPanel } from './components/Editor';
import { DeveloperPanel } from './components/Developer';
import { TopMenuBar as TopMenuBarComponent } from './components/TopMenuBar';
import { CreateWorkspaceModal } from './components/Workspace';
import { useConfigStore, useEventChatStore, useViewStore, useWorkspaceStore, useFloatingWindowStore } from './stores';
import * as tauri from './services/tauri';
import { bootstrapEngines } from './core/engine-bootstrap';
import { listen, emit } from '@tauri-apps/api/event';
import './index.css';

function App() {
  const { healthStatus, isConnecting, connectionState, loadConfig } = useConfigStore();
  const {
    isStreaming,
    sendMessage,
    interruptChat,
    error,
    restoreFromStorage,
    saveToStorage,
    initializeEventListeners,
    messages,
  } = useEventChatStore();
  const workspaces = useWorkspaceStore(state => state.workspaces);
  const currentWorkspace = useWorkspaceStore(state => state.getCurrentWorkspace());
  const currentWorkspacePath = currentWorkspace?.path;
  const [showSettings, setShowSettings] = useState(false);
  const [showCreateWorkspace, setShowCreateWorkspace] = useState(false);
  // 使用 ref 确保初始化只执行一次
  const isInitialized = useRef(false);
  const hasCheckedWorkspaces = useRef(false);
  const mouseLeaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const {
    showSidebar,
    showEditor,
    showToolPanel,
    showDeveloperPanel,
    sidebarWidth,
    editorWidth,
    toolPanelWidth,
    developerPanelWidth,
    setSidebarWidth,
    setEditorWidth,
    setToolPanelWidth,
    setDeveloperPanelWidth
  } = useViewStore();
  const { showFloatingWindow } = useFloatingWindowStore();

  // 初始化配置（只执行一次）
  useEffect(() => {
    const initializeApp = async () => {
      // 双重检查：防止 Strict Mode 或其他原因导致重复执行
      if (isInitialized.current) return;
      isInitialized.current = true;

      try {
        // 先加载配置，获取默认引擎
        await loadConfig();

        // 获取默认引擎 ID
        const config = useConfigStore.getState().config;
        const defaultEngine = config?.defaultEngine || 'claude-code';

        // 按需初始化 AI Engine Registry，只加载默认引擎
        await bootstrapEngines(defaultEngine);

        // 尝试从本地存储恢复聊天状态
        const restored = restoreFromStorage();
        if (restored) {
          console.log('[App] 已从崩溃中恢复聊天状态');
        }
      } catch (error) {
        console.error('[App] 初始化失败:', error);
        // 失败时重置标志，允许重试
        isInitialized.current = false;
      }
    };

    initializeApp();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 单独的 effect：检查工作区状态
  // 使用 ref 确保只检查一次，避免重复弹出模态框
  useEffect(() => {
    if (hasCheckedWorkspaces.current) return;

    // zustand persist 是异步恢复的，需要等待 workspaces 加载完成
    // 如果 workspaces 为空数组且已经过了初始化阶段，说明真的没有工作区
    if (workspaces.length === 0 && isInitialized.current) {
      console.log('[App] 无工作区，显示创建工作区模态框');
      setShowCreateWorkspace(true);
      hasCheckedWorkspaces.current = true;
    } else if (workspaces.length > 0) {
      // 有工作区，标记已检查
      hasCheckedWorkspaces.current = true;
    }
  }, [workspaces.length]);

  // 同步当前工作区路径到后端配置
  useEffect(() => {
    if (!currentWorkspacePath || !isInitialized.current) return;

    const syncWorkspace = async () => {
      try {
        await tauri.setWorkDir(currentWorkspacePath);
        console.log('[App] 工作区路径已同步:', currentWorkspacePath);
      } catch (error) {
        console.error('[App] 同步工作区路径失败:', error);
      }
    };

    syncWorkspace();
  }, [currentWorkspacePath]);

  // 监听崩溃保存事件
  useEffect(() => {
    const handleCrashSave = () => {
      console.log('[App] 检测到崩溃信号，保存状态...');
      saveToStorage();
    };

    window.addEventListener('app:crash-save', handleCrashSave);
    return () => window.removeEventListener('app:crash-save', handleCrashSave);
  }, [saveToStorage]);

  // 监听恢复事件
  useEffect(() => {
    const handleRecover = () => {
      console.log('[App] 收到恢复信号...');
      const restored = restoreFromStorage();
      if (restored) {
        window.location.reload();
      }
    };

    window.addEventListener('app:recover', handleRecover);
    return () => window.removeEventListener('app:recover', handleRecover);
  }, [restoreFromStorage]);

  // 监听工作区切换事件，清除聊天错误
  useEffect(() => {
    const handleWorkspaceSwitched = () => {
      // 清除聊天相关的错误提示
      const { error } = useEventChatStore.getState();
      if (error) {
        useEventChatStore.getState().setError(null);
      }
    };

    window.addEventListener('workspace-switched', handleWorkspaceSwitched);
    return () => window.removeEventListener('workspace-switched', handleWorkspaceSwitched);
  }, []);

  // 初始化事件监听器（事件驱动架构核心）
  const eventListenersCleanupRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (eventListenersCleanupRef.current) return; // 已经初始化过了
    const cleanup = initializeEventListeners();
    eventListenersCleanupRef.current = cleanup;
    return () => {
      if (cleanup) cleanup();
    };
  }, [initializeEventListeners]);

  // 鼠标移出检测 - 自动切换到悬浮窗模式
  useEffect(() => {
    const handleMouseLeave = () => {
      // TODO @setting 可以改为用户配置方式
      // 延迟 0 秒后切换到悬浮窗，给用户时间移回窗口
      mouseLeaveTimerRef.current = setTimeout(() => {
        // 只在有聊天消息时才显示悬浮窗
        // if (messages.length > 0) {
          showFloatingWindow();
        // }
      }, 0);
    };

    const handleMouseEnter = () => {
      // 鼠标移回窗口，取消切换
      if (mouseLeaveTimerRef.current) {
        clearTimeout(mouseLeaveTimerRef.current);
        mouseLeaveTimerRef.current = null;
      }
    };

    document.addEventListener('mouseleave', handleMouseLeave);
    document.addEventListener('mouseenter', handleMouseEnter);

    return () => {
      document.removeEventListener('mouseleave', handleMouseLeave);
      document.removeEventListener('mouseenter', handleMouseEnter);
      if (mouseLeaveTimerRef.current) {
        clearTimeout(mouseLeaveTimerRef.current);
      }
    };
  }, [messages.length, showFloatingWindow]);

  // 跨窗口数据同步 - 监听悬浮窗发送的消息
  useEffect(() => {
    const unlistenPromise = listen('floating:send_message', async (event: any) => {
      const { message } = event.payload;
      await sendMessage(message);
    });

    return () => {
      unlistenPromise.then(unlisten => unlisten());
    };
  }, [sendMessage]);

  // 跨窗口数据同步 - 将消息变化通知悬浮窗
  useEffect(() => {
    // 保存消息预览到 localStorage，供悬浮窗读取
    const messagePreview = messages.map(msg => {
      let content = ''
      if (msg.type === 'user') {
        content = msg.content
      } else if (msg.type === 'assistant' && 'blocks' in msg) {
        content = msg.blocks.map((b: any) =>
          b.type === 'text' ? b.content : `[${b.name || 'tool'}]`
        ).join(' ')
      } else if (msg.type === 'system') {
        content = (msg as any).content || ''
      } else if (msg.type === 'tool') {
        content = (msg as any).summary || ''
      } else if (msg.type === 'tool_group') {
        content = (msg as any).summary || ''
      } else {
        content = ''
      }
      return {
        id: msg.id,
        type: msg.type,
        content,
        timestamp: msg.timestamp,
      }
    })
    localStorage.setItem('chat_messages_preview', JSON.stringify(messagePreview))

    // 通知悬浮窗有新消息
    if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1]
      let content = ''
      if (lastMessage.type === 'user') {
        content = lastMessage.content
      } else if (lastMessage.type === 'assistant' && 'blocks' in lastMessage) {
        content = lastMessage.blocks.map((b: any) =>
          b.type === 'text' ? b.content : `[${b.name || 'tool'}]`
        ).join(' ')
      } else if (lastMessage.type === 'system') {
        content = (lastMessage as any).content || ''
      } else if (lastMessage.type === 'tool') {
        content = (lastMessage as any).summary || ''
      } else if (lastMessage.type === 'tool_group') {
        content = (lastMessage as any).summary || ''
      } else {
        content = ''
      }
      emit('chat:new-message', {
        id: lastMessage.id,
        type: lastMessage.type,
        content,
        timestamp: lastMessage.timestamp,
      })
    }
  }, [messages])

  // 跨窗口数据同步 - 同步流式状态
  useEffect(() => {
    emit('chat:streaming_changed', { isStreaming });
  }, [isStreaming]);

  // Sidebar 拖拽处理（右边手柄）
  const handleSidebarResize = (delta: number) => {
    const newWidth = Math.max(150, Math.min(600, sidebarWidth + delta));
    setSidebarWidth(newWidth);
  };

  // ToolPanel 拖拽处理（左边手柄）
  const handleToolPanelResize = (delta: number) => {
    const newWidth = Math.max(200, Math.min(600, toolPanelWidth - delta));
    setToolPanelWidth(newWidth);
  };

  // DeveloperPanel 拖拽处理（左边手柄）
  const handleDeveloperPanelResize = (delta: number) => {
    const newWidth = Math.max(300, Math.min(800, developerPanelWidth - delta));
    setDeveloperPanelWidth(newWidth);
  };

  // Editor/Chat 分割拖拽处理
  const handleEditorResize = (delta: number) => {
    const containerWidth = window.innerWidth - sidebarWidth - toolPanelWidth - (showDeveloperPanel ? developerPanelWidth : 0);
    const currentEditorWidth = containerWidth * (editorWidth / 100);
    const newEditorWidth = currentEditorWidth + delta;
    const minEditorWidth = containerWidth * 0.3;
    const maxEditorWidth = containerWidth * 0.7;

    const clampedWidth = Math.max(minEditorWidth, Math.min(maxEditorWidth, newEditorWidth));
    const newPercent = (clampedWidth / containerWidth) * 100;

    setEditorWidth(Math.round(newPercent));
  };

  return (
    <ErrorBoundary>
      <Layout>
        {/* 连接中蒙板 */}
        {(isConnecting || connectionState === 'failed') && <ConnectingOverlay />}

      {/* 顶部菜单栏 */}
      <TopMenuBarComponent
        onNewConversation={() => {
          // 新对话功能直接清空消息
        }}
        onSettings={() => setShowSettings(true)}
        onCreateWorkspace={() => setShowCreateWorkspace(true)}
      />

      {/* 主体内容区域：Sidebar | Main | ToolPanel */}
      <div className="flex flex-1 overflow-hidden">
        {/* 条件渲染 Sidebar */}
        {showSidebar && (
          <>
            <Sidebar width={sidebarWidth}>
              <FileExplorer />
            </Sidebar>
            <ResizeHandle
              direction="horizontal"
              position="right"
              onDrag={handleSidebarResize}
            />
          </>
        )}

        <Main className="flex-row">
          {/* 条件渲染 Editor */}
          {showEditor && (
            <div
              className="border-r border-border flex flex-col"
              style={{ width: `${editorWidth}%` }}
            >
              <EditorPanel />
            </div>
          )}

          {/* Editor/Chat 分割手柄 */}
          {showEditor && (
            <ResizeHandle
              direction="horizontal"
              position="right"
              onDrag={handleEditorResize}
            />
          )}

          {/* 聊天区域 */}
          <div className="flex flex-col min-w-[300px] flex-1">
            {/* 状态指示器 */}
            <div className="flex items-center justify-between px-4 py-2 bg-background-elevated border-b border-border-subtle">
              <span className="text-sm text-text-primary">AI 对话</span>
              <StatusIndicator
                status={healthStatus?.claudeAvailable ? 'online' : 'offline'}
                label={healthStatus?.claudeVersion ?? 'Claude 未连接'}
              />
            </div>

            {error && (
              <div className="mx-4 mt-4 p-3 bg-danger-faint border border-danger/30 rounded-xl text-danger text-sm">
                {error}
              </div>
            )}

            <EnhancedChatMessages />

            <ChatInput
              onSend={sendMessage}
              onInterrupt={interruptChat}
              disabled={!healthStatus?.claudeAvailable || !currentWorkspace}
              isStreaming={isStreaming}
            />
          </div>
        </Main>

        {/* ToolPanel 拖拽手柄 */}
        {showToolPanel && (
          <ResizeHandle
            direction="horizontal"
            position="left"
            onDrag={handleToolPanelResize}
          />
        )}

        {/* 条件渲染 ToolPanel */}
        {showToolPanel && <ToolPanel width={toolPanelWidth} />}

        {/* DeveloperPanel 拖拽手柄 */}
        {showDeveloperPanel && (
          <ResizeHandle
            direction="horizontal"
            position="left"
            onDrag={handleDeveloperPanelResize}
          />
        )}

        {/* 条件渲染 DeveloperPanel */}
        {showDeveloperPanel && <DeveloperPanel width={developerPanelWidth} />}
      </div>

      {/* 设置模态框 */}
      {showSettings && (
        <SettingsModal onClose={() => setShowSettings(false)} />
      )}

      {/* 创建工作区模态框 */}
      {showCreateWorkspace && (
        <CreateWorkspaceModal onClose={() => setShowCreateWorkspace(false)} />
      )}

      </Layout>
    </ErrorBoundary>
  );
}

export default App;
