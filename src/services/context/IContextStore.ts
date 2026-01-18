/**
 * 上下文存储接口
 * 定义了上下文存储的抽象操作，支持多种存储实现
 */

import type { ContextEntry, ContextStats } from '../../types/context';
import type { ChangeEvent } from './IContextManager';

/**
 * 上下文存储接口
 */
export interface IContextStore {
  /**
   * 添加或更新上下文条目
   */
  upsert(entry: ContextEntry): Promise<void>;

  /**
   * 批量添加或更新
   */
  upsertMany(entries: ContextEntry[]): Promise<void>;

  /**
   * 获取指定 ID 的上下文条目
   */
  get(id: string): Promise<ContextEntry | undefined>;

  /**
   * 获取所有上下文条目
   */
  getAll(): Promise<ContextEntry[]>;

  /**
   * 删除指定 ID 的上下文条目
   */
  remove(id: string): Promise<void>;

  /**
   * 按条件删除
   */
  removeByFilter(filter: ContextFilter): Promise<number>;

  /**
   * 清空所有上下文
   */
  clear(): Promise<void>;

  /**
   * 获取统计信息
   */
  getStats(): Promise<ContextStats>;

  /**
   * 更新访问时间（LRU）
   */
  touch(id: string): Promise<void>;

  /**
   * 订阅变化事件
   */
  onChange(handler: ChangeHandler): () => void;
}

/**
 * 上下文过滤器
 */
export interface ContextFilter {
  /** 来源过滤 */
  source?: string;
  /** 类型过滤 */
  type?: string;
  /** 工作区过滤 */
  workspaceId?: string;
  /** 过期时间过滤（删除在此时间前过期的条目） */
  expiredBefore?: number;
}

/**
 * 变化处理器
 */
export type ChangeHandler = (event: ChangeEvent) => void;
