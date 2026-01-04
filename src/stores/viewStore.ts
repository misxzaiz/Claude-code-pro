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
  sidebarWidth: number;      // 侧边栏宽度（像素）
  editorWidth: number;       // 编辑器宽度百分比（0-100）
  toolPanelWidth: number;    // 工具面板宽度（像素）
}

/** 视图操作 */
interface ViewActions {
  toggleSidebar: () => void;
  toggleEditor: () => void;
  toggleToolPanel: () => void;
  setAIOnlyMode: () => void;
  resetView: () => void;
  setSidebarWidth: (width: number) => void;
  setEditorWidth: (width: number) => void;
  setToolPanelWidth: (width: number) => void;
}

/** 完整的 View Store 类型 */
export type ViewStore = ViewState & ViewActions;

export const useViewStore = create<ViewStore>()(
  persist(
    (set) => ({
      // 初始状态
      showSidebar: true,
      showEditor: true,
      showToolPanel: true,
      sidebarWidth: 240,
      editorWidth: 50,
      toolPanelWidth: 320,

      // 切换侧边栏
      toggleSidebar: () => set((state) => ({ showSidebar: !state.showSidebar })),

      // 切换编辑器
      toggleEditor: () => set((state) => ({ showEditor: !state.showEditor })),

      // 切换工具面板
      toggleToolPanel: () => set((state) => ({ showToolPanel: !state.showToolPanel })),

      // 仅 AI 对话模式
      setAIOnlyMode: () => set({
        showSidebar: false,
        showEditor: false,
        showToolPanel: false,
      }),

      // 重置视图
      resetView: () => set({
        showSidebar: true,
        showEditor: true,
        showToolPanel: true,
      }),

      // 设置侧边栏宽度
      setSidebarWidth: (width: number) => set({ sidebarWidth: width }),

      // 设置编辑器宽度百分比
      setEditorWidth: (width: number) => set({ editorWidth: width }),

      // 设置工具面板宽度
      setToolPanelWidth: (width: number) => set({ toolPanelWidth: width }),
    }),
    {
      name: 'view-store',
    }
  )
);
