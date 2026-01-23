/**
 * OpenAI 兼容引擎配置状态管理
 */

import { create } from 'zustand'
import type { OpenAIPreset, OpenAICompatEngineConfig } from '../types'
import { OPENAI_COMPAT_PRESETS } from '../engines/openai-compat'
import { createOpenAICompatEngine } from '../engines/openai-compat'

interface OpenAICompatState {
  /** 当前配置 */
  config: OpenAICompatEngineConfig | null

  /** 是否正在加载 */
  loading: boolean

  /** 是否正在验证 API Key */
  validating: boolean

  /** 验证结果 */
  validation: { valid: boolean; error?: string } | null

  /** 引擎是否可用 */
  engineAvailable: boolean

  /** 错误信息 */
  error: string | null

  /** 加载配置 */
  loadConfig: () => Promise<void>

  /** 更新预设 */
  updatePreset: (preset: OpenAIPreset) => Promise<void>

  /** 更新 API Key */
  updateApiKey: (apiKey: string) => Promise<void>

  /** 更新自定义配置 */
  updateCustomConfig: (customConfig: OpenAICompatEngineConfig['customConfig']) => Promise<void>

  /** 验证 API Key */
  validateApiKey: () => Promise<void>

  /** 保存完整配置 */
  saveConfig: (config: OpenAICompatEngineConfig) => Promise<void>
}

export const useOpenAICompatStore = create<OpenAICompatState>((set, get) => ({
  config: null,
  loading: false,
  validating: false,
  validation: null,
  engineAvailable: false,
  error: null,

  loadConfig: async () => {
    set({ loading: true, error: null })
    try {
      // 从 Tauri 后端文件加载配置
      const { loadOpenAIConfigFile } = await import('../services/tauri')
      const backendConfig = await loadOpenAIConfigFile()

      // 如果后端配置存在，转换为前端格式
      let config: OpenAICompatEngineConfig | null = null

      if (backendConfig) {
        // 从后端配置文件恢复，内联预设推断逻辑
        let preset: OpenAIPreset = 'custom'
        if (backendConfig.baseURL.includes('api.deepseek.com')) {
          preset = 'deepseek-coder'
        } else if (backendConfig.baseURL.includes('api.openai.com')) {
          preset = 'openai-gpt4o'
        } else if (backendConfig.baseURL.includes('openrouter.ai')) {
          preset = 'openrouter'
        }

        config = {
          preset,
          apiKey: backendConfig.apiKey,
        }
      }

      // 如果没有配置，使用默认值
      const defaultConfig: OpenAICompatEngineConfig = {
        preset: 'deepseek-coder',
        apiKey: '',
      }

      set({ config: config || defaultConfig, loading: false })

      // 如果有 API Key，自动验证
      if (config?.apiKey) {
        get().validateApiKey()
      }
    } catch (e) {
      // 如果后端没有实现，使用默认配置
      console.warn('[OpenAICompat] 无法加载配置，使用默认值:', e)
      set({
        config: {
          preset: 'deepseek-coder',
          apiKey: '',
        },
        loading: false
      })
    }
  },

  updatePreset: async (preset) => {
    const { config } = get()
    if (!config) return

    set({ loading: true, error: null })
    try {
      const newConfig: OpenAICompatEngineConfig = {
        ...config,
        preset,
      }

      await get().saveConfig(newConfig)

      // 验证新预设的 API Key
      if (newConfig.apiKey) {
        await get().validateApiKey()
      }

      // 立即刷新全局健康状态
      const { useConfigStore } = await import('./configStore')
      await useConfigStore.getState().refreshHealth()
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : '更新预设失败',
        loading: false
      })
    }
  },

  updateApiKey: async (apiKey) => {
    const { config } = get()
    if (!config) return

    set({ loading: true, error: null })
    try {
      const newConfig: OpenAICompatEngineConfig = {
        ...config,
        apiKey,
      }

      await get().saveConfig(newConfig)

      // 验证 API Key
      if (apiKey) {
        await get().validateApiKey()
      }

      // 立即刷新全局健康状态
      const { useConfigStore } = await import('./configStore')
      await useConfigStore.getState().refreshHealth()
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : '更新 API Key 失败',
        loading: false
      })
    }
  },

  updateCustomConfig: async (customConfig) => {
    const { config } = get()
    if (!config) return

    set({ loading: true, error: null })
    try {
      const newConfig: OpenAICompatEngineConfig = {
        ...config,
        customConfig,
      }

      await get().saveConfig(newConfig)
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : '更新自定义配置失败',
        loading: false
      })
    }
  },

  validateApiKey: async () => {
    const { config } = get()
    if (!config || !config.apiKey) {
      set({
        validation: { valid: false, error: 'API Key 为空' },
        engineAvailable: false
      })
      return
    }

    set({ validating: true, error: null })
    try {
      // 创建引擎实例进行验证
      const engineConfig = get().getEngineConfig()
      const engine = createOpenAICompatEngine(engineConfig)
      const available = await engine.isAvailable()

      set({
        validation: available
          ? { valid: true }
          : { valid: false, error: 'API Key 无效或服务不可用' },
        engineAvailable: available,
        validating: false
      })
    } catch (e) {
      set({
        validation: {
          valid: false,
          error: e instanceof Error ? e.message : '验证 API Key 失败'
        },
        engineAvailable: false,
        validating: false
      })
    }
  },

  saveConfig: async (config) => {
    try {
      // 先更新 store 中的 config，这样 getEngineConfig() 才能读取到最新的配置
      set({ config, loading: false })

      // 然后获取引擎配置并保存到后端文件
      const engineConfig = get().getEngineConfig()
      if (engineConfig) {
        const { saveOpenAIConfigFile } = await import('../services/tauri')
        await saveOpenAIConfigFile(engineConfig)
      }
    } catch (e) {
      // 如果后端没有实现，只在内存中保存
      console.warn('[OpenAICompat] 后端不支持保存配置，仅在内存中保存:', e)
      set({ config, loading: false })
    }
  },

  // 辅助方法：获取引擎配置（从预设转换）
  getEngineConfig() {
    const { config } = get()
    if (!config) return null

    const preset = OPENAI_COMPAT_PRESETS.find(p => p.name === config.preset)

    if (!preset) {
      // 自定义配置 - 确保所有必需字段都存在
      return {
        apiKey: config.apiKey,
        baseURL: config.customConfig?.baseURL || 'https://api.openai.com/v1',
        model: config.customConfig?.model || 'gpt-4o-mini',
        temperature: config.customConfig?.temperature || 0.7,
        maxTokens: config.customConfig?.maxTokens || 4096,
        enableTools: config.customConfig?.enableTools !== false,
      }
    }

    // 使用预设配置 - 确保所有必需字段都存在
    return {
      apiKey: config.apiKey,
      baseURL: preset.config.baseURL || 'https://api.openai.com/v1',
      model: preset.config.model || 'gpt-4o-mini',
      temperature: preset.config.temperature ?? 0.7,
      maxTokens: preset.config.maxTokens ?? 4096,
      enableTools: preset.config.enableTools !== false,
    }
  },
}))

/**
 * 获取 OpenAI 兼容引擎实例
 */
export async function getOpenAICompatEngine() {
  const store = useOpenAICompatStore.getState()
  const engineConfig = store.getEngineConfig()

  if (!engineConfig || !engineConfig.apiKey) {
    throw new Error('OpenAI 配置不完整或 API Key 未设置')
  }

  return createOpenAICompatEngine(engineConfig)
}

/**
 * 检查 OpenAI 引擎是否可用
 */
export async function isOpenAICompatAvailable(): Promise<boolean> {
  try {
    const engine = await getOpenAICompatEngine()
    return await engine.isAvailable()
  } catch {
    return false
  }
}
