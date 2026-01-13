/**
 * IFlow Engine
 *
 * IFlow CLI 的 AIEngine 实现。
 * IFlow 是一个支持多种 AI 模型的编程助手 CLI 工具。
 */

import type { AIEngine, AISession, AISessionConfig, EngineCapabilities } from '../../ai-runtime'
import { createCapabilities } from '../../ai-runtime'
import { IFlowSession } from './session'

/**
 * IFlow Engine 配置
 */
export interface IFlowEngineConfig {
  /** IFlow CLI 可执行文件路径 */
  executablePath?: string
  /** 默认模型 */
  defaultModel?: string
  /** API 密钥 */
  apiKey?: string
  /** API 基础 URL */
  apiBase?: string
  /** 额外命令行参数 */
  extraArgs?: string[]
}

/**
 * IFlow Engine
 *
 * 实现 AIEngine 接口，将 IFlow CLI 集成到系统中。
 */
export class IFlowEngine implements AIEngine {
  readonly id = 'iflow'
  readonly name = 'IFlow'

  readonly capabilities: EngineCapabilities = createCapabilities({
    supportedTaskKinds: ['chat', 'refactor', 'explain', 'generate', 'fix-bug'],
    supportsStreaming: true,
    supportsConcurrentSessions: true,
    supportsTaskAbort: true,
    maxConcurrentSessions: 3,
    description: 'IFlow AI CLI - 支持多种 AI 模型的智能编程助手',
    version: '1.0.0',
  })

  private config: IFlowEngineConfig
  private isInitialized: boolean = false

  constructor(config?: IFlowEngineConfig) {
    this.config = config || {}
  }

  /**
   * 创建新的会话
   */
  createSession(sessionConfig?: AISessionConfig): AISession {
    return new IFlowSession(sessionConfig, {
      executablePath: this.config.executablePath,
      model: this.config.defaultModel,
      apiKey: this.config.apiKey,
      apiBase: this.config.apiBase,
      extraArgs: this.config.extraArgs,
    })
  }

  /**
   * 检查 Engine 是否可用
   */
  async isAvailable(): Promise<boolean> {
    try {
      // 检查 IFlow CLI 是否已安装
      // 实际实现需要调用 Tauri 后端检查
      return await this.checkIFlowInstalled()
    } catch {
      return false
    }
  }

  /**
   * 初始化 Engine
   */
  async initialize(): Promise<boolean> {
    if (this.isInitialized) {
      return true
    }

    try {
      // 检查 iflow 是否可用
      const available = await this.isAvailable()
      if (!available) {
        console.warn('[IFlowEngine] IFlow CLI 不可用，请先安装')
        return false
      }

      this.isInitialized = true
      return true
    } catch (error) {
      console.error('[IFlowEngine] 初始化失败:', error)
      return false
    }
  }

  /**
   * 清理 Engine 资源
   */
  async cleanup(): Promise<void> {
    this.isInitialized = false
  }

  /**
   * 更新引擎配置
   */
  updateConfig(config: Partial<IFlowEngineConfig>): void {
    this.config = { ...this.config, ...config }
  }

  /**
   * 获取当前配置
   */
  getConfig(): IFlowEngineConfig {
    return { ...this.config }
  }

  /**
   * 检查 IFlow CLI 是否已安装
   *
   * 实际实现需要通过 Tauri 调用后端检查
   */
  private async checkIFlowInstalled(): Promise<boolean> {
    // TODO: 调用 Tauri 后端检查 iflow 是否安装
    // invoke('check_iflow_installed')
    return true
  }

  /**
   * 获取 IFlow CLI 版本
   */
  async getVersion(): Promise<string | null> {
    // TODO: 调用 `iflow --version` 获取版本
    return null
  }
}

/**
 * 创建 IFlow Engine
 */
export function createIFlowEngine(config?: IFlowEngineConfig): IFlowEngine {
  return new IFlowEngine(config)
}

/**
 * 默认的 IFlow Engine 实例
 */
export const defaultIFlowEngine = new IFlowEngine()
