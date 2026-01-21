/**
 * 视图显示状态管理
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** 视图状态 */
interface ViewState {
  showSidebar: boolean;
  showEditor: boolean;
  showToolPanel: boolean;
  showDeveloperPanel: boolean;
  showSessionHistory: boolean; // 会话历史面板
  showTerminal: boolean; // 终端面板
  sidebarWidth: number;      // 侧边栏宽度（像素）
  editorWidth: number;       // 编辑器宽度百分比（0-100）
  toolPanelWidth: number;    // 工具面板宽度（像素）
  developerPanelWidth: number; // Developer 面板宽度（像素）
  terminalHeight: number; // 终端面板高度（像素）
}

/** 视图操作 */
interface ViewActions {
  toggleSidebar: () => void;
  toggleEditor: () => void;
  toggleToolPanel: () => void;
  toggleDeveloperPanel: () => void;
  toggleSessionHistory: () => void;
  toggleTerminal: () => void;
  setShowEditor: (show: boolean) => void;
  setAIOnlyMode: () => void;
  resetView: () => void;
  setSidebarWidth: (width: number) => void;
  setEditorWidth: (width: number) => void;
  setToolPanelWidth: (width: number) => void;
  setDeveloperPanelWidth: (width: number) => void;
  setTerminalHeight: (height: number) => void;
}

/** 完整的 View Store 类型 */
export type ViewStore = ViewState & ViewActions;

export const useViewStore = create<ViewStore>()(
  persist(
    (set) => ({
      // 初始状态
      showSidebar: true,
      showEditor: false,
      showToolPanel: true,
      showDeveloperPanel: false,  // 默认关闭 Developer 面板
      showSessionHistory: false,  // 默认关闭会话历史面板
      showTerminal: false,  // 默认关闭终端面板
      sidebarWidth: 240,
      editorWidth: 50,
      toolPanelWidth: 320,
      developerPanelWidth: 400,
      terminalHeight: 300,

      // 切换侧边栏
      toggleSidebar: () => set((state) => ({ showSidebar: !state.showSidebar })),

      // 切换编辑器
      toggleEditor: () => set((state) => ({ showEditor: !state.showEditor })),

      // 设置编辑器显示状态
      setShowEditor: (show: boolean) => set({ showEditor: show }),

      // 切换工具面板
      toggleToolPanel: () => set((state) => ({ showToolPanel: !state.showToolPanel })),

      // 切换 Developer 面板
      toggleDeveloperPanel: () => set((state) => ({ showDeveloperPanel: !state.showDeveloperPanel })),

      // 切换会话历史面板
      toggleSessionHistory: () => set((state) => ({ showSessionHistory: !state.showSessionHistory })),

      // 切换终端面板
      toggleTerminal: () => set((state) => ({ showTerminal: !state.showTerminal })),

      // 仅 AI 对话模式
      setAIOnlyMode: () => set({
        showSidebar: false,
        showEditor: false,
        showToolPanel: false,
        showDeveloperPanel: false,
      }),

      // 重置视图
      resetView: () => set({
        showSidebar: true,
        showEditor: false,
        showToolPanel: true,
        showDeveloperPanel: false,
      }),

      // 设置侧边栏宽度
      setSidebarWidth: (width: number) => set({ sidebarWidth: width }),

      // 设置编辑器宽度百分比
      setEditorWidth: (width: number) => set({ editorWidth: width }),

      // 设置工具面板宽度
      setToolPanelWidth: (width: number) => set({ toolPanelWidth: width }),

      // 设置 Developer 面板宽度
      setDeveloperPanelWidth: (width: number) => set({ developerPanelWidth: width }),

      // 设置终端面板高度
      setTerminalHeight: (height: number) => set({ terminalHeight: height }),
    }),
    {
      name: 'view-store',
    }
  )
);
