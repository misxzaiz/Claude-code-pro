/**
 * 优先级管理器
 * 负责根据规则动态调整上下文条目的优先级
 */

import type {
  ContextEntry,
  ContextSource,
  ContextPriority,
  ContextQueryRequest,
  PriorityConfig,
  PriorityAdjustmentRule,
} from '../../types/context';

/**
 * 默认优先级配置
 */
const DEFAULT_PRIORITIES: Record<ContextSource, ContextPriority> = {
  // 用户显式操作 - 最高优先级
  user_selection: 5,

  // IDE 当前上下文 - 高优先级
  ide: 4,

  // 语义相关 - 中高优先级
  semantic_related: 3,

  // 项目和工作区 - 中等优先级
  project: 2,
  workspace: 2,

  // 历史和诊断 - 低优先级
  history: 1,
  diagnostics: 1,
};

/**
 * 内置优先级调整规则
 */
const BUILTIN_RULES: PriorityAdjustmentRule[] = [
  // 规则 1: 用户消息中明确提到的文件 -> 最高优先级
  {
    name: 'mentioned_files',
    condition: (entry, query) => {
      if (entry.type !== 'file' && entry.type !== 'file_structure') {
        return false;
      }
      const filePath = (entry.content as any).path;
      return query.mentionedFiles?.includes(filePath) ?? false;
    },
    adjustment: () => 5,
  },

  // 规则 2: 当前编辑的文件 -> 优先级+1
  {
    name: 'current_file',
    condition: (entry, query) => {
      if (entry.type !== 'file' && entry.type !== 'file_structure') {
        return false;
      }
      const filePath = (entry.content as any).path;
      return entry.metadata?.tags?.includes('current_file') ||
             query.currentFile === filePath;
    },
    adjustment: (entry) => Math.min(5, entry.priority + 1) as ContextPriority,
  },

  // 规则 3: 长时间未访问 -> 优先级-1
  {
    name: 'staleness',
    condition: (entry) => {
      const STALE_THRESHOLD = 30 * 60 * 1000; // 30 分钟
      return Date.now() - entry.lastAccessedAt > STALE_THRESHOLD;
    },
    adjustment: (entry) => Math.max(0, entry.priority - 1) as ContextPriority,
  },

  // 规则 4: 错误诊断 -> 优先级+1
  {
    name: 'error_diagnostics',
    condition: (entry) => {
      if (entry.type !== 'diagnostics') {
        return false;
      }
      const diagnostics = (entry.content as any).items;
      return diagnostics?.some((d: { severity?: string }) => d.severity === 'error') ?? false;
    },
    adjustment: (entry) => Math.min(5, entry.priority + 1) as ContextPriority,
  },

  // 规则 5: 高访问频率 -> 优先级+1
  {
    name: 'frequent_access',
    condition: (entry) => {
      return entry.accessCount >= 5;
    },
    adjustment: (entry) => Math.min(5, entry.priority + 1) as ContextPriority,
  },
];

/**
 * 优先级管理器
 */
export class PriorityManager {
  private config: PriorityConfig;

  constructor(config?: Partial<PriorityConfig>) {
    this.config = {
      defaults: { ...DEFAULT_PRIORITIES },
      rules: [...BUILTIN_RULES],
    };
    if (config?.defaults) {
      this.config.defaults = { ...this.config.defaults, ...config.defaults };
    }
    if (config?.rules) {
      this.config.rules = [...this.config.rules, ...config.rules];
    }
  }

  /**
   * 获取默认优先级
   */
  getDefaultPriority(source: ContextSource): ContextPriority {
    return this.config.defaults[source] ?? 2;
  }

  /**
   * 应用优先级规则，调整条目优先级
   */
  adjustPriorities(
    entries: ContextEntry[],
    query: ContextQueryRequest
  ): ContextEntry[] {
    return entries.map(entry => {
      let adjustedPriority = entry.priority;

      for (const rule of this.config.rules) {
        if (rule.condition(entry, query)) {
          adjustedPriority = rule.adjustment(entry);
        }
      }

      // 确保优先级在有效范围内
      adjustedPriority = Math.max(0, Math.min(5, adjustedPriority)) as ContextPriority;

      // 返回调整后的副本（不修改原始条目）
      return {
        ...entry,
        priority: adjustedPriority,
      };
    });
  }

  /**
   * 按优先级排序（高到低）
   */
  sortByPriority(entries: ContextEntry[]): ContextEntry[] {
    return [...entries].sort((a, b) => {
      // 首先按优先级排序
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }
      // 优先级相同时，按最后访问时间排序（最近访问的在前）
      return b.lastAccessedAt - a.lastAccessedAt;
    });
  }

  /**
   * 添加自定义规则
   */
  addRule(rule: PriorityAdjustmentRule): void {
    this.config.rules.push(rule);
  }

  /**
   * 获取配置
   */
  getConfig(): PriorityConfig {
    return {
      defaults: { ...this.config.defaults },
      rules: [...this.config.rules],
    };
  }
}
