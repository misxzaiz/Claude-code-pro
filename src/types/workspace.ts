/**
 * 工作区相关类型定义
 */

/** 工作区基础信息 */
export interface Workspace {
  id: string;
  name: string;
  path: string;
  createdAt: string;
  lastAccessed: string;
}

/** 工作区状态 */
export interface WorkspaceState {
  workspaces: Workspace[];
  currentWorkspaceId: string | null;
  isLoading: boolean;
  error: string | null;
}

/** 工作区操作 */
export interface WorkspaceActions {
  // 基础操作
  createWorkspace: (name: string, path: string) => Promise<void>;
  switchWorkspace: (id: string) => Promise<void>;
  deleteWorkspace: (id: string) => Promise<void>;
  updateWorkspace: (id: string, updates: Partial<Workspace>) => Promise<void>;
  
  // 工具方法
  getCurrentWorkspace: () => Workspace | null;
  validateWorkspacePath: (path: string) => Promise<boolean>;
  clearError: () => void;
}

/** 完整的工作区 Store 类型 */
export type WorkspaceStore = WorkspaceState & WorkspaceActions;