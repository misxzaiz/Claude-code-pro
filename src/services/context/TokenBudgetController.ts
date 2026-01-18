/**
 * Token 预算控制器
 * 负责管理上下文的 Token 预算，确保不超过模型上下文窗口限制
 */

import type {
  ContextEntry,
  TokenBudgetConfig,
  TokenBudgetState,
} from '../../types/context';

/**
 * Token 预算控制器
 */
export class TokenBudgetController {
  private config: TokenBudgetConfig;
  private state: TokenBudgetState;

  constructor(config?: Partial<TokenBudgetConfig>) {
    this.config = {
      contextSize: config?.contextSize ?? 8000,     // 默认 8K 上下文
      systemReserved: config?.systemReserved ?? 1000,  // 预留 1K 给系统
      userMessageReserved: config?.userMessageReserved ?? 2000, // 预留 2K 给用户消息
      get available() {
        return this.contextSize - this.systemReserved - this.userMessageReserved;
      },
      compressionThreshold: config?.compressionThreshold ?? 500, // 超过 500 tokens 考虑压缩
    };

    this.state = {
      used: 0,
      limit: this.config.available,
      reserved: this.config.systemReserved + this.config.userMessageReserved,
      get available() {
        return this.limit - this.used;
      },
      get usageRatio() {
        return this.limit > 0 ? this.used / this.limit : 0;
      },
    };
  }

  /**
   * 选择在 Token 预算内的上下文条目
   */
  selectWithinBudget(
    entries: ContextEntry[],
    maxTokens?: number
  ): { selected: ContextEntry[]; dropped: ContextEntry[] } {
    const budget = maxTokens ?? this.state.limit;
    const selected: ContextEntry[] = [];
    const dropped: ContextEntry[] = [];

    // 按优先级排序（高到低）
    const sorted = this.sortByPriority([...entries]);

    let usedTokens = 0;

    for (const entry of sorted) {
      const entryTokens = entry.estimatedTokens;

      if (usedTokens + entryTokens <= budget) {
        selected.push(entry);
        usedTokens += entryTokens;
      } else if (this.canCompress(entry)) {
        // 尝试压缩
        const compressed = this.compress(entry, budget - usedTokens);
        if (compressed) {
          selected.push(compressed);
          usedTokens += compressed.estimatedTokens;
        } else {
          dropped.push(entry);
        }
      } else {
        dropped.push(entry);
      }
    }

    return { selected, dropped };
  }

  /**
   * 按优先级和 LRU 排序
   */
  private sortByPriority(entries: ContextEntry[]): ContextEntry[] {
    return entries.sort((a, b) => {
      // 首先按优先级排序
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }
      // 优先级相同时，按最后访问时间排序（最近访问的在前）
      return b.lastAccessedAt - a.lastAccessedAt;
    });
  }

  /**
   * 判断是否可以压缩
   */
  private canCompress(entry: ContextEntry): boolean {
    // 只有文件类型可以压缩为结构
    return entry.type === 'file' && entry.estimatedTokens > this.config.compressionThreshold;
  }

  /**
   * 压缩上下文条目
   */
  private compress(entry: ContextEntry, budget: number): ContextEntry | null {
    if (entry.type === 'file') {
      // 将完整文件压缩为文件结构
      const compressed: ContextEntry = {
        ...entry,
        type: 'file_structure',
        content: {
          type: 'file_structure',
          path: (entry.content as any).path,
          symbols: this.extractSymbols((entry.content as any).content),
          summary: this.generateSummary((entry.content as any).content),
        },
        estimatedTokens: this.estimateStructureTokens((entry.content as any).content),
      };
      return compressed.estimatedTokens <= budget ? compressed : null;
    }
    return null;
  }

  /**
   * 从文件内容提取符号（简化版本，实际需要 AST 解析）
   */
  private extractSymbols(content: string): any[] {
    const symbols: any[] = [];
    const lines = content.split('\n');

    // 简单的正则匹配（实际应该使用语言服务）
    const functionRegex = /^(?:function|const|let|class)\s+(\w+)/g;

    lines.forEach((line, index) => {
      const funcMatch = functionRegex.exec(line);
      if (funcMatch) {
        symbols.push({
          name: funcMatch[1],
          kind: 'function',
          location: { path: '', lineStart: index + 1, lineEnd: index + 1 },
        });
      }
    });

    return symbols;
  }

  /**
   * 生成文件内容摘要
   */
  private generateSummary(content: string): string {
    const lines = content.split('\n');
    const nonEmptyLines = lines.filter(line => line.trim().length > 0);
    return `${nonEmptyLines.length} lines`;
  }

  /**
   * 估算结构化内容的 Token 数
   */
  private estimateStructureTokens(content: string): number {
    // 简单估算：结构约为原始内容的 10%
    return Math.ceil(content.length / 10);
  }

  /**
   * 估算文本的 Token 数
   * 简单估算：英文约 4 字符/token，中文约 2 字符/token
   */
  estimateTokens(text: string): number {
    if (!text) return 0;

    let chineseChars = 0;
    let otherChars = 0;

    for (const char of text) {
      if (/[\u4e00-\u9fa5]/.test(char)) {
        chineseChars++;
      } else if (char.trim()) {
        otherChars++;
      }
    }

    return Math.ceil(chineseChars / 2 + otherChars / 4);
  }

  /**
   * 获取当前状态
   */
  getState(): TokenBudgetState {
    return { ...this.state };
  }

  /**
   * 获取配置
   */
  getConfig(): TokenBudgetConfig {
    return { ...this.config };
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<TokenBudgetConfig>): void {
    if (config.contextSize !== undefined) {
      this.config.contextSize = config.contextSize;
    }
    if (config.systemReserved !== undefined) {
      this.config.systemReserved = config.systemReserved;
    }
    if (config.userMessageReserved !== undefined) {
      this.config.userMessageReserved = config.userMessageReserved;
    }
    if (config.compressionThreshold !== undefined) {
      this.config.compressionThreshold = config.compressionThreshold;
    }
  }

  /**
   * 重置状态
   */
  reset(): void {
    this.state.used = 0;
  }
}
