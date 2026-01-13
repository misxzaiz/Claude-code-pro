/**
 * Engines Registry
 *
 * 导出所有可用的 AI Engine 实现。
 */

// 导出 Claude Code Engine
export * from './claude-code'

// 导出 IFlow Engine
export * from './iflow'

// 未来可以在这里添加其他 Engine
// export * from './openai'
// export * from './ollama'

/**
 * 获取所有可用的 Engine IDs
 */
export function getAvailableEngineIds(): string[] {
  return ['claude-code', 'iflow']
}

/**
 * 获取默认 Engine ID
 */
export function getDefaultEngineId(): string {
  return 'claude-code'
}

/**
 * Engine 描述信息
 */
export interface EngineDescriptor {
  id: string
  name: string
  description: string
  available: boolean
}

/**
 * 获取所有 Engine 描述信息
 */
export function getEngineDescriptors(): EngineDescriptor[] {
  return [
    {
      id: 'claude-code',
      name: 'Claude Code',
      description: 'Anthropic 官方 Claude CLI',
      available: true,
    },
    {
      id: 'iflow',
      name: 'IFlow',
      description: '支持多种 AI 模型的智能编程助手',
      available: true,
    },
  ]
}
