/**
 * 内存上下文存储实现
 * 使用 Map 存储上下文条目，支持 LRU 缓存策略
 */

import type {
  ContextEntry,
  ContextStats,
  StatsBySource,
  StatsByType,
  StatsByPriority,
} from '../../types/context';
import type {
  IContextStore,
  ContextFilter,
  ChangeHandler,
} from './IContextStore';
import type { ChangeEvent } from './IContextManager';

/**
 * 内存上下文存储
 */
export class MemoryContextStore implements IContextStore {
  private entries = new Map<string, ContextEntry>();
  private listeners = new Set<ChangeHandler>();

  async upsert(entry: ContextEntry): Promise<void> {
    const isNew = !this.entries.has(entry.id);
    this.entries.set(entry.id, entry);
    this.emit({ type: isNew ? 'add' : 'update', entryId: entry.id, timestamp: Date.now() });
  }

  async upsertMany(entries: ContextEntry[]): Promise<void> {
    for (const entry of entries) {
      this.entries.set(entry.id, entry);
    }
    this.emit({ type: 'add', timestamp: Date.now() });
  }

  async get(id: string): Promise<ContextEntry | undefined> {
    const entry = this.entries.get(id);
    if (entry) {
      // 更新访问时间
      entry.lastAccessedAt = Date.now();
      entry.accessCount++;
    }
    return entry;
  }

  async getAll(): Promise<ContextEntry[]> {
    return Array.from(this.entries.values());
  }

  async remove(id: string): Promise<void> {
    const entry = this.entries.get(id);
    if (entry) {
      this.entries.delete(id);
      this.emit({ type: 'remove', entryId: id, timestamp: Date.now() });
    }
  }

  async removeByFilter(filter: ContextFilter): Promise<number> {
    let removed = 0;

    for (const [id, entry] of this.entries) {
      let shouldRemove = false;

      if (filter.source && entry.source !== filter.source) {
        continue;
      }
      if (filter.type && entry.type !== filter.type) {
        continue;
      }
      if (filter.workspaceId && entry.metadata?.workspaceId !== filter.workspaceId) {
        continue;
      }
      if (filter.expiredBefore !== undefined) {
        if (entry.expiresAt && entry.expiresAt < filter.expiredBefore) {
          shouldRemove = true;
        }
      }

      if (shouldRemove || (filter.source || filter.type || filter.workspaceId)) {
        this.entries.delete(id);
        removed++;
      }
    }

    if (removed > 0) {
      this.emit({ type: 'remove', timestamp: Date.now() });
    }

    return removed;
  }

  async clear(): Promise<void> {
    const count = this.entries.size;
    this.entries.clear();
    if (count > 0) {
      this.emit({ type: 'clear', timestamp: Date.now() });
    }
  }

  async getStats(): Promise<ContextStats> {
    const entries = Array.from(this.entries.values());

    const bySource: StatsBySource = {
      project: 0,
      workspace: 0,
      ide: 0,
      user_selection: 0,
      semantic_related: 0,
      history: 0,
      diagnostics: 0,
    };

    const byType: StatsByType = {
      file: 0,
      file_structure: 0,
      symbol: 0,
      symbol_reference: 0,
      selection: 0,
      diagnostics: 0,
      dependency: 0,
      project_meta: 0,
      user_message: 0,
      tool_result: 0,
    };

    const byPriority: StatsByPriority = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

    let totalTokens = 0;
    let oldestEntry: number | undefined;
    let newestEntry = 0;

    for (const entry of entries) {
      // 统计来源
      bySource[entry.source]++;

      // 统计类型
      byType[entry.type]++;

      // 统计优先级
      byPriority[entry.priority]++;

      // 统计 Token
      totalTokens += entry.estimatedTokens;

      // 时间范围
      if (!oldestEntry || entry.createdAt < oldestEntry) {
        oldestEntry = entry.createdAt;
      }
      if (entry.createdAt > newestEntry) {
        newestEntry = entry.createdAt;
      }
    }

    return {
      totalEntries: entries.length,
      totalTokens,
      bySource,
      byType,
      byPriority,
      oldestEntry,
      newestEntry,
    };
  }

  async touch(id: string): Promise<void> {
    const entry = this.entries.get(id);
    if (entry) {
      entry.lastAccessedAt = Date.now();
      entry.accessCount++;
    }
  }

  onChange(handler: ChangeHandler): () => void {
    this.listeners.add(handler);
    return () => this.listeners.delete(handler);
  }

  private emit(event: ChangeEvent): void {
    this.listeners.forEach(handler => handler(event));
  }

  /**
   * 清理过期的上下文条目
   */
  async cleanupExpired(): Promise<number> {
    const now = Date.now();
    let removed = 0;

    for (const [id, entry] of this.entries) {
      if (entry.expiresAt && entry.expiresAt < now) {
        this.entries.delete(id);
        removed++;
      }
    }

    if (removed > 0) {
      this.emit({ type: 'remove', timestamp: Date.now() });
    }

    return removed;
  }

  /**
   * 获取条目数量
   */
  get size(): number {
    return this.entries.size;
  }
}
