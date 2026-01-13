/**
 * Engine Bootstrap - AI 引擎启动注册
 *
 * 在应用启动时注册所有可用的 AI Engine。
 * UI/Core 通过 Registry 获取 Engine，而非直接 new。
 */

import { getEngineRegistry, registerEngine } from '../ai-runtime'
import { ClaudeCodeEngine } from '../engines/claude-code'
import { IFlowEngine } from '../engines/iflow'

/**
 * 已注册的 Engine ID 列表
 */
export const REGISTERED_ENGINE_IDS = ['claude-code', 'iflow'] as const

/**
 * Engine 类型
 */
export type EngineId = typeof REGISTERED_ENGINE_IDS[number]

/**
 * 初始化所有 AI Engine
 *
 * 在应用启动时调用，注册所有可用的 Engine。
 */
export async function bootstrapEngines(): Promise<void> {
  const registry = getEngineRegistry()

  // 注册 Claude Code Engine（默认）
  const claudeEngine = new ClaudeCodeEngine()
  registerEngine(claudeEngine, { asDefault: true })

  // 注册 IFlow Engine
  const iflowEngine = new IFlowEngine()
  registerEngine(iflowEngine)

  // 初始化所有 Engine
  await registry.initializeAll()

  console.log('[EngineBootstrap] Registered engines:', await registry.listAvailable())
}

/**
 * 获取默认 Engine
 */
export function getDefaultEngine() {
  return getEngineRegistry().getDefault()
}

/**
 * 获取指定 Engine
 */
export function getEngine(engineId: EngineId) {
  return getEngineRegistry().get(engineId)
}

/**
 * 列出所有可用 Engine
 */
export function listEngines() {
  return getEngineRegistry().list()
}

/**
 * 检查 Engine 是否可用
 */
export async function isEngineAvailable(engineId: EngineId): Promise<boolean> {
  return await getEngineRegistry().isAvailable(engineId)
}
