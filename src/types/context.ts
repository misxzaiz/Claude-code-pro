/**
 * 上下文管理系统类型定义
 *
 * 定义了上下文管理的核心数据结构，包括：
 * - 上下文条目 (ContextEntry)
 * - 上下文查询 (ContextQueryRequest)
 * - 上下文快照 (ContextSnapshot)
 * - 文件/符号引用
 */

// ========================================
// 基础类型定义
// ========================================

/**
 * 上下文来源类型
 * - project: 项目分析自动收集
 * - workspace: 工作区相关
 * - ide: IDE 插件上报（当前文件、光标位置等）
 * - user_selection: 用户显式选择
 * - semantic_related: 语义相关文件
 * - history: 历史交互上下文
 * - diagnostics: 错误/警告信息
 */
export type ContextSource =
  | 'project'
  | 'workspace'
  | 'ide'
  | 'user_selection'
  | 'semantic_related'
  | 'history'
  | 'diagnostics';

/**
 * 上下文优先级 (0-5, 5 最高)
 */
export type ContextPriority = 0 | 1 | 2 | 3 | 4 | 5;

/**
 * 上下文类型
 */
export type ContextType =
  | 'file'              // 文件内容
  | 'file_structure'    // 文件结构（AST/符号列表）
  | 'symbol'            // 符号定义（类/函数/变量）
  | 'symbol_reference'  // 符号引用关系
  | 'selection'         // 用户选中的代码段
  | 'diagnostics'       // 诊断信息（错误/警告）
  | 'dependency'        // 依赖关系
  | 'project_meta'      // 项目元信息
  | 'user_message'      // 用户消息历史
  | 'tool_result';      // 工具执行结果

// ========================================
// 位置和范围
// ========================================

/**
 * 代码位置
 */
export interface Location {
  /** 文件路径 */
  path: string;
  /** 起始行号 (1-based) */
  lineStart: number;
  /** 结束行号 (1-based) */
  lineEnd: number;
  /** 起始列号 (0-based) */
  columnStart?: number;
  /** 结束列号 (0-based) */
  columnEnd?: number;
}

/**
 * 代码范围
 */
export interface Range {
  /** 起始位置 */
  start: { line: number; character: number };
  /** 结束位置 */
  end: { line: number; character: number };
}

// ========================================
// 符号信息
// ========================================

/**
 * 符号类型
 */
export type SymbolKind =
  | 'class'
  | 'interface'
  | 'enum'
  | 'function'
  | 'method'
  | 'variable'
  | 'constant'
  | 'property'
  | 'type'
  | 'namespace'
  | 'module';

/**
 * 符号信息
 */
export interface SymbolInfo {
  /** 符号名称 */
  name: string;
  /** 符号类型 */
  kind: SymbolKind;
  /** 定义位置 */
  location: Location;
  /** 文档注释 */
  documentation?: string;
  /** 子符号（嵌套结构） */
  children?: SymbolInfo[];
  /** 是否为导出符号 */
  isExported?: boolean;
  /** 修饰符 (public, private, static 等) */
  modifiers?: string[];
}

// ========================================
// 诊断信息
// ========================================

/**
 * 诊断严重程度
 */
export type DiagnosticSeverity = 'error' | 'warning' | 'info' | 'hint';

/**
 * 诊断条目
 */
export interface Diagnostic {
  /** 文件路径 */
  path: string;
  /** 严重程度 */
  severity: DiagnosticSeverity;
  /** 消息 */
  message: string;
  /** 位置 */
  range: Range;
  /** 错误代码 */
  code?: string;
  /** 错误来源 */
  source?: string;
}

// ========================================
// 上下文内容类型
// ========================================

/**
 * 文件上下文内容
 */
export interface FileContext {
  type: 'file';
  /** 文件路径 */
  path: string;
  /** 文件内容 */
  content: string;
  /** 编程语言 */
  language: string;
  /** 字符编码 */
  encoding?: string;
}

/**
 * 文件结构上下文内容
 */
export interface FileStructureContext {
  type: 'file_structure';
  /** 文件路径 */
  path: string;
  /** 符号列表 */
  symbols: SymbolInfo[];
  /** 文件摘要 */
  summary?: string;
}

/**
 * 符号上下文内容
 */
export interface SymbolContext {
  type: 'symbol';
  /** 符号名称 */
  name: string;
  /** 定义位置 */
  definition: Location;
  /** 符号类型 */
  kind: SymbolKind;
  /** 文档注释 */
  documentation?: string;
  /** 签名（函数签名等） */
  signature?: string;
}

/**
 * 代码选区上下文内容
 */
export interface SelectionContext {
  type: 'selection';
  /** 文件路径 */
  path: string;
  /** 选区范围 */
  range: Range;
  /** 选中的内容 */
  content: string;
  /** 周围上下文行数 */
  contextLines?: number;
}

/**
 * 诊断上下文内容
 */
export interface DiagnosticsContext {
  type: 'diagnostics';
  /** 文件路径 */
  path?: string;
  /** 诊断条目列表 */
  items: Diagnostic[];
  /** 统计信息 */
  summary?: {
    errors: number;
    warnings: number;
    infos: number;
    hints: number;
  };
}

/**
 * 项目元信息上下文内容
 */
export interface ProjectMetaContext {
  type: 'project_meta';
  /** 项目名称 */
  name: string;
  /** 项目根目录 */
  rootDir: string;
  /** 项目类型 */
  projectType: string;
  /** 编程语言列表 */
  languages: string[];
  /** 主语言 */
  primaryLanguage: string;
  /** 框架列表 */
  frameworks: string[];
  /** 构建工具 */
  buildTools: string[];
  /** 包管理器 */
  packageManager: string;
  /** 入口文件 */
  entryFiles: string[];
  /** 源码目录 */
  sourceDirs: string[];
}

/**
 * 用户消息上下文内容
 */
export interface UserMessageContext {
  type: 'user_message';
  /** 消息内容 */
  content: string;
  /** 关联的文件 */
  files?: string[];
  /** 时间戳 */
  timestamp: number;
}

/**
 * 工具结果上下文内容
 */
export interface ToolResultContext {
  type: 'tool_result';
  /** 工具名称 */
  toolName: string;
  /** 工具输入 */
  input: Record<string, unknown>;
  /** 工具输出 */
  output?: string;
  /** 执行状态 */
  status: 'pending' | 'running' | 'completed' | 'failed';
}

/**
 * 上下文内容联合类型
 */
export type ContextContent =
  | FileContext
  | FileStructureContext
  | SymbolContext
  | SelectionContext
  | DiagnosticsContext
  | ProjectMetaContext
  | UserMessageContext
  | ToolResultContext;

// ========================================
// 上下文条目
// ========================================

/**
 * 上下文元数据
 */
export interface ContextMetadata {
  /** 关联的工作区 ID */
  workspaceId?: string;
  /** 标签（用于过滤和分类） */
  tags?: string[];
  /** 向量嵌入（用于语义检索）- 可选 */
  embeddings?: number[];
  /** 依赖的其他上下文 ID */
  dependencies?: string[];
  /** 相关性置信度 (0-1) */
  confidence?: number;
  /** 语言 ID */
  language?: string;
}

/**
 * 上下文条目
 * 核心数据结构，表示一个独立的上下文单元
 */
export interface ContextEntry {
  /** 唯一标识 */
  id: string;
  /** 来源 */
  source: ContextSource;
  /** 类型 */
  type: ContextType;
  /** 优先级 (0-5) */
  priority: ContextPriority;
  /** 内容 */
  content: ContextContent;
  /** 元数据 */
  metadata?: ContextMetadata;
  /** 创建时间 */
  createdAt: number;
  /** 过期时间（可选） */
  expiresAt?: number;
  /** 最后访问时间（用于 LRU） */
  lastAccessedAt: number;
  /** 访问次数 */
  accessCount: number;
  /** 估算的 Token 数量 */
  estimatedTokens: number;
}

// ========================================
// 上下文查询
// ========================================

/**
 * 上下文查询请求
 */
export interface ContextQueryRequest {
  // ========== 空间过滤 ==========
  /** 工作区 ID 过滤 */
  workspaceId?: string;
  /** 指定文件列表 */
  files?: string[];
  /** 指定符号列表 */
  symbols?: string[];

  // ========== 类型过滤 ==========
  /** 上下文类型过滤 */
  types?: ContextType[];
  /** 上下文来源过滤 */
  sources?: ContextSource[];

  // ========== Token 预算 ==========
  /** 最大 Token 数 */
  maxTokens?: number;
  /** 预留 Token（给用户消息） */
  reservedTokens?: number;

  // ========== 优先级 ==========
  /** 最小优先级 */
  minPriority?: ContextPriority;

  // ========== 语义检索 ==========
  /** 语义搜索查询 */
  semanticQuery?: string;
  /** 相似度阈值 (0-1) */
  semanticThreshold?: number;

  // ========== 选项 ==========
  /** 是否包含诊断信息 */
  includeDiagnostics?: boolean;
  /** 是否包含结构信息（AST） */
  includeStructure?: boolean;
  /** 用户提到的文件（用于动态提升优先级） */
  mentionedFiles?: string[];
  /** 当前编辑的文件路径 */
  currentFile?: string;
}

/**
 * 上下文查询结果
 */
export interface ContextQueryResult {
  /** 选中的上下文条目 */
  entries: ContextEntry[];
  /** 总 Token 数 */
  totalTokens: number;
  /** 因限制被丢弃的条目 */
  droppedEntries: DroppedEntry[];
  /** 上下文摘要 */
  summary: ContextSummary;
}

/**
 * 被丢弃的条目
 */
export interface DroppedEntry {
  /** 条目 ID */
  id: string;
  /** 丢弃原因 */
  reason: 'low_priority' | 'token_limit' | 'expired' | 'filtered';
  /** 条目优先级 */
  priority: ContextPriority;
  /** 条目 Token 数 */
  tokens: number;
}

/**
 * 上下文摘要
 */
export interface ContextSummary {
  /** 文件数量 */
  fileCount: number;
  /** 符号数量 */
  symbolCount: number;
  /** 涉及的工作区 */
  workspaceIds: string[];
  /** 涉及的语言 */
  languages: string[];
  /** 涉及的框架 */
  frameworks?: string[];
  /** 诊断信息摘要 */
  diagnostics?: {
    errors: number;
    warnings: number;
  };
  /** 项目信息 */
  projectInfo?: ProjectMetaContext;
}

// ========================================
// 上下文快照
// ========================================

/**
 * 文件引用
 */
export interface FileReference {
  /** 工作区 ID */
  workspaceId: string;
  /** 文件路径 */
  path: string;
  /** 引用类型 */
  type: 'full' | 'selection' | 'structure';
  /** 选区范围（仅 type=selection 时） */
  selection?: Range;
  /** 语言 */
  language?: string;
  /** 估算的 Token 数 */
  estimatedTokens?: number;
}

/**
 * 符号引用
 */
export interface SymbolReference {
  /** 文件路径 */
  file: string;
  /** 符号名称 */
  name: string;
  /** 符号类型 */
  kind: SymbolKind;
  /** 定义位置 */
  definition: Location;
}

/**
 * 消息上下文范围
 */
export interface MessageContextRange {
  /** 起始消息 ID */
  fromMessageId: string;
  /** 结束消息 ID */
  toMessageId?: string;
  /** 消息数量 */
  count: number;
}

/**
 * 上下文快照
 * 每次发送消息时捕获的上下文状态
 */
export interface ContextSnapshot {
  /** 工作区 ID */
  workspaceId: string | null;
  /** 用户选中的文件 */
  selectedFiles: FileReference[];
  /** 用户选中的符号 */
  selectedSymbols: SymbolReference[];
  /** 历史消息范围 */
  messageContext: MessageContextRange | null;
  /** 项目信息 */
  projectInfo: ProjectMetaContext | null;
  /** 诊断信息 */
  diagnostics: Diagnostic[];
  /** 估算 Token 数 */
  estimatedTokens: number;
}

// ========================================
// 上下文统计
// ========================================

/**
 * 按来源分组的统计
 */
export interface StatsBySource {
  project: number;
  workspace: number;
  ide: number;
  user_selection: number;
  semantic_related: number;
  history: number;
  diagnostics: number;
}

/**
 * 按类型分组的统计
 */
export interface StatsByType {
  file: number;
  file_structure: number;
  symbol: number;
  symbol_reference: number;
  selection: number;
  diagnostics: number;
  dependency: number;
  project_meta: number;
  user_message: number;
  tool_result: number;
}

/**
 * 按优先级分组的统计
 */
export interface StatsByPriority {
  0: number;
  1: number;
  2: number;
  3: number;
  4: number;
  5: number;
}

/**
 * 上下文统计信息
 */
export interface ContextStats {
  /** 总条目数 */
  totalEntries: number;
  /** 总 Token 数 */
  totalTokens: number;
  /** 按来源分组 */
  bySource: StatsBySource;
  /** 按类型分组 */
  byType: StatsByType;
  /** 按优先级分组 */
  byPriority: StatsByPriority;
  /** 最旧条目时间戳 */
  oldestEntry?: number;
  /** 最新条目时间戳 */
  newestEntry: number;
}

// ========================================
// 上下文构建选项
// ========================================

/**
 * 提示词格式
 */
export type PromptFormat = 'markdown' | 'json' | 'concise' | 'detailed';

/**
 * 构建提示词选项
 */
export interface BuildPromptOptions {
  /** 输出格式 */
  format?: PromptFormat;
  /** 最大 Token 数 */
  maxTokens?: number;
  /** 是否包含诊断信息 */
  includeDiagnostics?: boolean;
  /** 是否包含结构信息 */
  includeStructure?: boolean;
  /** 是否包含文档 */
  includeDocumentation?: boolean;
  /** 自定义模板 */
  template?: string;
  /** 语言偏好（用于文档） */
  language?: string;
}

// ========================================
// 优先级配置
// ========================================

/**
 * 优先级配置
 */
export interface PriorityConfig {
  /** 默认优先级映射 */
  defaults: Record<ContextSource, ContextPriority>;
  /** 优先级调整规则 */
  rules: PriorityAdjustmentRule[];
}

/**
 * 优先级调整规则
 */
export interface PriorityAdjustmentRule {
  /** 规则名称 */
  name: string;
  /** 条件判断 */
  condition: (entry: ContextEntry, query: ContextQueryRequest) => boolean;
  /** 优先级调整 */
  adjustment: (entry: ContextEntry) => ContextPriority;
}

// ========================================
// Token 预算配置
// ========================================

/**
 * Token 预算配置
 */
export interface TokenBudgetConfig {
  /** 模型上下文窗口大小 */
  contextSize: number;
  /** 预留给系统提示词的 Token */
  systemReserved: number;
  /** 预留给用户消息的 Token */
  userMessageReserved: number;
  /** 可用于上下文的 Token */
  get available(): number;
  /** 压缩阈值（Token 超过此值时考虑压缩） */
  compressionThreshold: number;
}

/**
 * Token 预算状态
 */
export interface TokenBudgetState {
  /** 已使用 */
  used: number;
  /** 预算上限 */
  limit: number;
  /** 预留（系统+用户） */
  reserved: number;
  /** 可用 */
  get available(): number;
  /** 使用率 */
  get usageRatio(): number;
}
