/**
 * Engine Bootstrap - AI 引擎启动注册
 *
 * 在应用启动时按需注册 AI Engine。
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
 * 按需初始化 AI Engine
 *
 * 在应用启动时调用，只初始化默认引擎。
 * 其他引擎在需要时通过 registerEngineLazy() 延迟加载。
 *
 * @param defaultEngineId 默认引擎 ID，只初始化该引擎
 */
export async function bootstrapEngines(defaultEngineId: EngineId = 'claude-code'): Promise<void> {
  const registry = getEngineRegistry()

  // 只注册默认引擎
  if (defaultEngineId === 'claude-code') {
    const claudeEngine = new ClaudeCodeEngine()
    registerEngine(claudeEngine, { asDefault: true })
  } else if (defaultEngineId === 'iflow') {
    const iflowEngine = new IFlowEngine()
    registerEngine(iflowEngine, { asDefault: true })
  }

  // 初始化已注册的引擎
  await registry.initializeAll()

  console.log('[EngineBootstrap] Initialized default engine:', defaultEngineId)
}

/**
 * 延迟注册引擎（用于切换引擎时）
 *
 * 当用户切换到未初始化的引擎时，调用此函数加载该引擎。
 *
 * @param engineId 要注册的引擎 ID
 */
export async function registerEngineLazy(engineId: EngineId): Promise<void> {
  const registry = getEngineRegistry()

  // 如果已注册，跳过
  if (registry.has(engineId)) {
    return
  }

  if (engineId === 'claude-code') {
    const claudeEngine = new ClaudeCodeEngine()
    registerEngine(claudeEngine)
    await claudeEngine.initialize()
  } else if (engineId === 'iflow') {
    const iflowEngine = new IFlowEngine()
    registerEngine(iflowEngine)
    await iflowEngine.initialize()
  }

  console.log('[EngineBootstrap] Lazy registered engine:', engineId)
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
