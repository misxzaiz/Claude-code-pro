/**
 * 配置相关类型定义
 */

/** AI 引擎 ID */
export type EngineId = 'claude-code' | 'iflow'

/** AI 引擎配置 */
export interface EngineConfig {
  /** 引擎 ID */
  id: EngineId;
  /** 引擎名称 */
  name: string;
  /** CLI 命令路径 */
  cliPath?: string;
  /** 是否可用 */
  available?: boolean;
}

/** 应用配置 */
export interface Config {
  /** 当前选择的引擎 */
  defaultEngine: EngineId;
  /** Claude Code 引擎配置 */
  claudeCode: {
    /** Claude CLI 命令路径 */
    cliPath: string;
  };
  /** IFlow 引擎配置 */
  iflow: {
    /** IFlow CLI 命令路径 */
    cliPath?: string;
  };
  /** 工作目录 */
  workDir?: string;
  /** 会话保存路径 */
  sessionDir?: string;
  /** Git 二进制路径 (Windows) */
  gitBinPath?: string;
}

/** 健康状态 */
export interface HealthStatus {
  /** Claude CLI 是否可用 */
  claudeAvailable: boolean;
  /** Claude 版本 */
  claudeVersion?: string;
  /** IFlow CLI 是否可用 */
  iflowAvailable?: boolean;
  /** IFlow 版本 */
  iflowVersion?: string;
  /** 工作目录 */
  workDir?: string;
  /** 配置是否有效 */
  configValid: boolean;
}
