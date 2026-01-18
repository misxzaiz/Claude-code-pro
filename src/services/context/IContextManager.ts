/**
 * 上下文管理器接口
 * 定义了上下文管理的核心操作
 */

import type {
  ContextEntry,
  ContextQueryRequest,
  ContextQueryResult,
  ContextStats,
  BuildPromptOptions,
} from '../../types/context';

/**
 * 上下文变化事件
 */
export interface ChangeEvent {
  type: 'add' | 'update' | 'remove' | 'clear';
  entryId?: string;
  timestamp: number;
}

/**
 * 上下文管理器接口
 */
export interface IContextManager {
  // ========== 查询接口 ==========

  /**
   * 查询上下文
   * @param request 查询请求
   * @returns 查询结果
   */
  query(request: ContextQueryRequest): Promise<ContextQueryResult>;

  /**
   * 获取格式化的上下文提示词
   * @param options 格式化选项
   * @returns 格式化后的提示词字符串
   */
  buildPrompt(options?: BuildPromptOptions): Promise<string>;

  /**
   * 获取当前上下文统计
   */
  getStats(): Promise<ContextStats>;

  /**
   * 获取指定 ID 的上下文条目
   */
  get(id: string): Promise<ContextEntry | undefined>;

  /**
   * 获取所有上下文条目
   */
  getAll(): Promise<ContextEntry[]>;

  // ========== 更新接口 ==========

  /**
   * 添加/更新上下文条目
   * @param entry 上下文条目
   */
  upsert(entry: ContextEntry): Promise<void>;

  /**
   * 批量添加/更新
   */
  upsertMany(entries: ContextEntry[]): Promise<void>;

  /**
   * 更新上下文访问时间（LRU）
   */
  touch(id: string): Promise<void>;

  // ========== 删除接口 ==========

  /**
   * 移除指定上下文
   */
  remove(id: string): Promise<void>;

  /**
   * 按条件批量移除
   */
  removeByFilter(filter: {
    source?: string;
    type?: string;
    workspaceId?: string;
  }): Promise<number>;

  /**
   * 清空所有上下文
   */
  clear(): Promise<void>;

  // ========== 订阅接口 ==========

  /**
   * 订阅上下文变化
   */
  onChange(handler: (event: ChangeEvent) => void): () => void;

  // ========== 工具方法 ==========

  /**
   * 估算文本的 Token 数
   */
  estimateTokens(text: string): number;
}
