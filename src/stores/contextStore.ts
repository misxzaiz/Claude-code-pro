/**
 * 上下文状态管理
 * 整合 ContextManager 和 Zustand，提供 React 组件访问接口
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type {
  ContextEntry,
  ContextQueryRequest,
  ContextQueryResult,
  ContextStats,
  BuildPromptOptions,
  FileReference,
  SymbolReference,
  MessageContextRange,
  ContextSnapshot,
  ContextType,
  ContextSource,
} from '../types/context';
import { ContextManager, getGlobalContextManager } from '../services/context';
import * as tauri from '../services/tauri';

/**
 * 上下文选择器状态
 */
interface ContextPickerState {
  /** 是否显示文件选择器 */
  showFilePicker: boolean;
  /** 是否显示符号选择器 */
  showSymbolPicker: boolean;
  /** 是否显示历史上下文选择器 */
  showHistoryPicker: boolean;
  /** 当前激活的选择器类型 */
  activePicker: ContextType | null;
}

/**
 * Token 预算状态
 */
interface TokenBudgetState {
  used: number;
  limit: number;
  reserved: number;
  get available(): number;
  get usageRatio(): number;
}

/**
 * 自动上下文配置
 */
interface AutoContextConfig {
  /** 自动包含当前编辑文件 */
  includeCurrentFile: boolean;
  /** 自动包含诊断信息 */
  includeDiagnostics: boolean;
  /** 自动包含相关文件 */
  includeRelatedFiles: boolean;
  /** 最大相关文件数 */
  maxRelatedFiles: number;
}

/**
 * 上下文状态管理接口
 */
export interface ContextStore {
  // ========== 选中的上下文 ==========
  /** 选中的文件列表 */
  selectedFiles: FileReference[];
  /** 选中的符号列表 */
  selectedSymbols: SymbolReference[];
  /** 历史消息范围 */
  messageContext: MessageContextRange | null;

  // ========== UI 状态 ==========
  /** 工具栏是否展开 */
  isToolbarExpanded: boolean;
  /** 选择器状态 */
  picker: ContextPickerState;

  // ========== Token 预算 ==========
  tokenBudget: TokenBudgetState;

  // ========== 自动上下文配置 ==========
  autoContext: AutoContextConfig;

  // ========== 统计信息 ==========
  stats: ContextStats | null;

  // ========== 操作方法 ==========

  // --- 文件操作 ---
  /** 添加文件到上下文 */
  addFile: (file: FileReference) => Promise<void>;
  /** 批量添加文件到上下文 */
  addFiles: (files: FileReference[]) => Promise<void>;
  /** 移除文件 */
  removeFile: (path: string) => Promise<void>;
  /** 清空所有文件 */
  clearFiles: () => void;
  /** 设置文件列表 */
  setFiles: (files: FileReference[]) => void;

  // --- 符号操作 ---
  /** 添加符号到上下文 */
  addSymbol: (symbol: SymbolReference) => Promise<void>;
  /** 移除符号 */
  removeSymbol: (file: string, name: string) => Promise<void>;
  /** 清空所有符号 */
  clearSymbols: () => void;

  // --- 历史上下文操作 ---
  /** 设置消息上下文范围 */
  setMessageContext: (context: MessageContextRange | null) => void;

  // --- UI 操作 ---
  /** 切换工具栏展开状态 */
  toggleToolbar: () => void;
  /** 设置工具栏状态 */
  setToolbarExpanded: (expanded: boolean) => void;
  /** 显示选择器 */
  showPicker: (type: ContextType) => void;
  /** 隐藏选择器 */
  hidePicker: () => void;

  // --- 自动上下文配置 ---
  /** 更新自动上下文配置 */
  updateAutoContext: (config: Partial<AutoContextConfig>) => void;

  // --- ContextManager 操作 ---
  /** 查询上下文 */
  queryContext: (request?: Partial<ContextQueryRequest>) => Promise<ContextQueryResult>;
  /** 构建提示词 */
  buildPrompt: (options?: BuildPromptOptions) => Promise<string>;
  /** 获取上下文快照 */
  buildContextSnapshot: () => Promise<ContextSnapshot>;
  /** 刷新统计信息 */
  refreshStats: () => Promise<void>;
  /** 清空所有上下文 */
  clearAllContext: () => Promise<void>;

  // --- 工具方法 ---
  /** 估算文本的 Token 数 */
  estimateTokens: (text: string) => number;

  // --- 内部方法 ---
  /** 获取 ContextManager 实例 */
  getManager: () => ContextManager;
}

/**
 * 语言扩展名映射
 */
const LANGUAGE_MAP: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  py: 'python',
  rs: 'rust',
  go: 'go',
  java: 'java',
  kt: 'kotlin',
  cs: 'csharp',
  cpp: 'cpp',
  c: 'c',
  h: 'c',
  hpp: 'cpp',
  cc: 'cpp',
  rb: 'ruby',
  php: 'php',
  scala: 'scala',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  fish: 'shell',
  ps1: 'powershell',
  json: 'json',
  xml: 'xml',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'toml',
  md: 'markdown',
  txt: 'text',
  html: 'html',
  css: 'css',
  scss: 'scss',
  less: 'less',
  vue: 'vue',
  svelte: 'svelte',
};

/**
 * 获取文件语言
 */
function getLanguageFromPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  return ext ? LANGUAGE_MAP[ext] || 'text' : 'text';
}

/**
 * 创建 Token 预算状态
 */
function createTokenBudgetState(): TokenBudgetState {
  const state = {
    used: 0,
    limit: 6000,  // 默认 6K 可用 (8K - 2K 预留)
    reserved: 2000,
    get available() {
      return this.limit - this.used;
    },
    get usageRatio() {
      return this.limit > 0 ? this.used / this.limit : 0;
    },
  };
  return new Proxy(state, {
    get(target, prop) {
      const value = (target as any)[prop];
      if (typeof value === 'function') {
        return value.call(target);
      }
      return value;
    },
  }) as TokenBudgetState;
}

/**
 * 上下文 Store
 */
export const useContextStore = create<ContextStore>()(
  subscribeWithSelector((set, get) => {
    // 初始化 ContextManager
    const manager = getGlobalContextManager();

    // 订阅 ContextManager 变化
    manager.onChange(async () => {
      // 刷新统计信息
      const stats = await manager.getStats();
      set({ stats });
    });

    return {
      // ========== 初始状态 ==========
      selectedFiles: [],
      selectedSymbols: [],
      messageContext: null,
      isToolbarExpanded: false,
      picker: {
        showFilePicker: false,
        showSymbolPicker: false,
        showHistoryPicker: false,
        activePicker: null,
      },
      tokenBudget: createTokenBudgetState(),
      autoContext: {
        includeCurrentFile: true,
        includeDiagnostics: true,
        includeRelatedFiles: true,
        maxRelatedFiles: 3,
      },
      stats: null,

      // ========== 文件操作 ==========

      addFile: async (file: FileReference) => {
        const state = get();

        // 检查是否已存在
        if (state.selectedFiles.some(f => f.path === file.path)) {
          console.log('[ContextStore] 文件已存在:', file.path);
          return;
        }

        // 读取文件内容
        let fileContent = '';
        let actualTokens = 0;
        try {
          fileContent = await tauri.getFileContent(file.path);
          actualTokens = manager.estimateTokens(fileContent);
        } catch (error) {
          console.warn('[ContextStore] 读取文件内容失败:', error);
          // 使用估算值
          actualTokens = 500;
        }

        // 确定语言
        const language = file.language || getLanguageFromPath(file.path);

        // 创建上下文条目
        const entry: ContextEntry = {
          id: `file:${file.workspaceId}:${file.path}`,
          source: 'user_selection' as ContextSource,
          type: file.type === 'selection' ? ('selection' as ContextType) : ('file' as ContextType),
          priority: 5,
          content: {
            type: 'file',
            path: file.path,
            content: fileContent,
            language: language,
          },
          metadata: {
            workspaceId: file.workspaceId,
            language: language,
            tags: file.type === 'selection' ? ['selection'] : undefined,
          },
          createdAt: Date.now(),
          lastAccessedAt: Date.now(),
          accessCount: 1,
          estimatedTokens: actualTokens,
        };

        await manager.upsert(entry);

        set((state) => ({
          selectedFiles: [...state.selectedFiles, { ...file, language, estimatedTokens: actualTokens }],
          tokenBudget: {
            ...state.tokenBudget,
            used: state.tokenBudget.used + actualTokens,
          },
        }));
      },

      addFiles: async (files: FileReference[]) => {
        // 逐个添加文件
        for (const file of files) {
          await get().addFile(file);
        }
      },

      removeFile: async (path: string) => {
        const state = get();

        // 找到对应的文件
        const file = state.selectedFiles.find(f => f.path === path);
        if (!file) return;

        // 从 ContextManager 移除
        await manager.remove(`file:${file.workspaceId}:${file.path}`);

        // 更新 Token 使用量
        const tokensFreed = file.estimatedTokens || 0;

        set((state) => ({
          selectedFiles: state.selectedFiles.filter(f => f.path !== path),
          tokenBudget: {
            ...state.tokenBudget,
            used: Math.max(0, state.tokenBudget.used - tokensFreed),
          },
        }));
      },

      clearFiles: () => {
        set({
          selectedFiles: [],
          tokenBudget: {
            ...get().tokenBudget,
            used: 0,
          },
        });
      },

      setFiles: (files: FileReference[]) => {
        set({ selectedFiles: files });
      },

      // ========== 符号操作 ==========

      addSymbol: async (symbol: SymbolReference) => {
        const entry: ContextEntry = {
          id: `symbol:${symbol.file}:${symbol.name}`,
          source: 'user_selection' as ContextSource,
          type: 'symbol' as ContextType,
          priority: 5,
          content: {
            type: 'symbol',
            name: symbol.name,
            definition: symbol.definition,
            kind: symbol.kind,
          },
          metadata: {
            tags: ['symbol'],
          },
          createdAt: Date.now(),
          lastAccessedAt: Date.now(),
          accessCount: 1,
          estimatedTokens: 100,
        };

        await manager.upsert(entry);

        set((state) => ({
          selectedSymbols: [...state.selectedSymbols, symbol],
        }));
      },

      removeSymbol: async (file: string, name: string) => {
        await manager.remove(`symbol:${file}:${name}`);

        set((state) => ({
          selectedSymbols: state.selectedSymbols.filter(
            s => s.file !== file || s.name !== name
          ),
        }));
      },

      clearSymbols: () => {
        set({ selectedSymbols: [] });
      },

      // ========== 历史上下文操作 ==========

      setMessageContext: (context: MessageContextRange | null) => {
        set({ messageContext: context });
      },

      // ========== UI 操作 ==========

      toggleToolbar: () => {
        set((state) => ({ isToolbarExpanded: !state.isToolbarExpanded }));
      },

      setToolbarExpanded: (expanded: boolean) => {
        set({ isToolbarExpanded: expanded });
      },

      showPicker: (type: ContextType) => {
        set({
          picker: {
            showFilePicker: type === 'file' || type === 'file_structure' || type === 'selection',
            showSymbolPicker: type === 'symbol',
            showHistoryPicker: type === 'user_message',
            activePicker: type,
          },
        });
      },

      hidePicker: () => {
        set({
          picker: {
            showFilePicker: false,
            showSymbolPicker: false,
            showHistoryPicker: false,
            activePicker: null,
          },
        });
      },

      // ========== 自动上下文配置 ==========

      updateAutoContext: (config: Partial<AutoContextConfig>) => {
        set((state) => ({
          autoContext: { ...state.autoContext, ...config },
        }));
      },

      // ========== ContextManager 操作 ==========

      queryContext: async (request?: Partial<ContextQueryRequest>) => {
        const state = get();
        const manager = state.getManager();

        const query: ContextQueryRequest = {
          maxTokens: request?.maxTokens ?? state.tokenBudget.available,
          includeDiagnostics: request?.includeDiagnostics ?? state.autoContext.includeDiagnostics,
          ...request,
        };

        const result = await manager.query(query);

        // 更新 Token 预算状态
        set((state) => ({
          tokenBudget: {
            ...state.tokenBudget,
            used: result.totalTokens,
          },
        }));

        return result;
      },

      buildPrompt: async (options?: BuildPromptOptions) => {
        const state = get();
        const manager = state.getManager();
        return manager.buildPrompt(options);
      },

      buildContextSnapshot: async (): Promise<ContextSnapshot> => {
        const state = get();
        const result = await state.queryContext();

        return {
          workspaceId: null,  // 从 workspaceStore 获取
          selectedFiles: state.selectedFiles,
          selectedSymbols: state.selectedSymbols,
          messageContext: state.messageContext,
          projectInfo: result.summary.projectInfo ?? null,
          diagnostics: result.entries
            .filter(e => e.type === 'diagnostics')
            .flatMap(e => (e.content as any).items ?? []),
          estimatedTokens: result.totalTokens,
        };
      },

      refreshStats: async () => {
        const state = get();
        const manager = state.getManager();
        const stats = await manager.getStats();
        set({ stats });
      },

      clearAllContext: async () => {
        const state = get();
        const manager = state.getManager();
        await manager.clear();
        set({
          selectedFiles: [],
          selectedSymbols: [],
          messageContext: null,
          tokenBudget: {
            ...state.tokenBudget,
            used: 0,
          },
        });
      },

      // ========== 工具方法 ==========

      estimateTokens: (text: string) => {
        return manager.estimateTokens(text);
      },

      // ========== 内部方法 ==========

      getManager: () => manager,
    };
  })
);
