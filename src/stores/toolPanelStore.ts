/**
 * 工具面板状态管理
 */

import { create } from 'zustand';
import type { ToolCall } from '../types';

interface ToolPanelState {
  /** 面板是否展开 */
  isOpen: boolean;
  /** 当前选中的工具 ID */
  selectedToolId: string | null;
  /** 工具列表 */
  tools: ToolCall[];

  /** 切换面板展开/折叠 */
  toggle: () => void;
  /** 设置面板展开状态 */
  setOpen: (open: boolean) => void;
  /** 选中工具 */
  selectTool: (id: string | null) => void;
  /** 添加工具 */
  addTool: (tool: ToolCall) => void;
  /** 更新工具 */
  updateTool: (id: string, updates: Partial<ToolCall>) => void;
  /** 清空工具列表 */
  clearTools: () => void;
}

export const useToolPanelStore = create<ToolPanelState>((set) => ({
  isOpen: true,  // 默认展开
  selectedToolId: null,
  tools: [],

  toggle: () => {
    set((state) => ({ isOpen: !state.isOpen }));
  },

  setOpen: (open) => {
    set({ isOpen: open });
  },

  selectTool: (id) => {
    set({ selectedToolId: id });
  },

  addTool: (tool) => {
    set((state) => {
      // 检查是否已存在（通过 id）
      const exists = state.tools.some(t => t.id === tool.id);
      if (exists) {
        return state;
      }
      return {
        tools: [...state.tools, tool]
      };
    });
  },

  updateTool: (id, updates) => {
    set((state) => ({
      tools: state.tools.map(tool =>
        tool.id === id
          ? { ...tool, ...updates }
          : tool
      )
    }));
  },

  clearTools: () => {
    set({ tools: [], selectedToolId: null });
  },
}));

/** 根据名称查找并更新工具（用于 tool_end 事件） */
export function updateToolByName(name: string, updates: Partial<Omit<ToolCall, 'id' | 'name' | 'startedAt'>>) {
  const { tools, updateTool } = useToolPanelStore.getState();
  const runningTool = tools.find(t => t.name === name && t.status === 'running');
  if (runningTool) {
    updateTool(runningTool.id, updates);
  }
}

/** 根据工具使用 ID 查找并更新（用于 tool_result 事件） */
export function updateToolByToolUseId(toolUseId: string, updates: Partial<Omit<ToolCall, 'id' | 'name' | 'startedAt'>>) {
  const { tools, updateTool } = useToolPanelStore.getState();
  // 在我们的实现中，tool.id 就是 toolUseId
  const tool = tools.find(t => t.id === toolUseId);
  if (tool) {
    updateTool(tool.id, updates);
  }
}
