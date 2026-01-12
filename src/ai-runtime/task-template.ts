/**
 * AI Task Template - 任务模板系统
 *
 * 提供预定义的任务模板，简化 AITask 的创建。
 * 模板只生成 AITask，不直接调用 Engine。
 */

import type { AITask, AITaskKind, AITaskInput } from './task'

/**
 * 模板变量类型
 */
export type TemplateVariable = {
  /** 变量名 */
  name: string
  /** 变量描述 */
  description: string
  /** 默认值 */
  default?: string
  /** 是否必填 */
  required?: boolean
}

/**
 * 任务模板定义
 */
export interface AITaskTemplate {
  /** 模板唯一标识 */
  id: string
  /** 模板名称 */
  name: string
  /** 模板描述 */
  description: string
  /** 任务类型 */
  kind: AITaskKind
  /** 提示词模板（支持 {{variable}} 语法） */
  promptTemplate: string
  /** 模板变量定义 */
  variables?: TemplateVariable[]
  /** 是否需要文件输入 */
  requireFiles?: boolean
  /** 示例输入 */
  examples?: TemplateExample[]
}

/**
 * 模板示例
 */
export interface TemplateExample {
  /** 示例描述 */
  description: string
  /** 变量值 */
  variables: Record<string, string>
  /** 文件列表 */
  files?: string[]
}

/**
 * 模板渲染上下文
 */
export interface TemplateContext {
  /** 变量值 */
  variables: Record<string, string>
  /** 文件列表 */
  files?: string[]
  /** 额外参数 */
  extra?: Record<string, unknown>
}

/**
 * 模板渲染错误
 */
export class TemplateRenderError extends Error {
  constructor(message: string, public readonly missingVariables?: string[]) {
    super(message)
    this.name = 'TemplateRenderError'
  }
}

/**
 * 模板注册表
 */
class TemplateRegistry {
  private templates = new Map<string, AITaskTemplate>()

  /**
   * 注册模板
   */
  register(template: AITaskTemplate): void {
    this.templates.set(template.id, template)
  }

  /**
   * 获取模板
   */
  get(id: string): AITaskTemplate | undefined {
    return this.templates.get(id)
  }

  /**
   * 获取所有模板
   */
  list(): AITaskTemplate[] {
    return Array.from(this.templates.values())
  }

  /**
   * 按类型筛选模板
   */
  listByKind(kind: AITaskKind): AITaskTemplate[] {
    return this.list().filter((t) => t.kind === kind)
  }

  /**
   * 检查模板是否存在
   */
  has(id: string): boolean {
    return this.templates.has(id)
  }

  /**
   * 注销模板
   */
  unregister(id: string): boolean {
    return this.templates.delete(id)
  }

  /**
   * 清空所有模板
   */
  clear(): void {
    this.templates.clear()
  }
}

/**
 * 全局模板注册表
 */
const globalRegistry = new TemplateRegistry()

/**
 * 渲染模板变量
 */
function renderTemplate(template: string, variables: Record<string, string>): string {
  let result = template

  // 替换 {{variable}} 语法
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g')
    result = result.replace(regex, value)
  }

  return result
}

/**
 * 验证模板变量
 */
function validateVariables(
  template: AITaskTemplate,
  context: TemplateContext
): { valid: boolean; missing?: string[] } {
  if (!template.variables || template.variables.length === 0) {
    return { valid: true }
  }

  const missing: string[] = []

  for (const variable of template.variables) {
    if (variable.required && !context.variables[variable.name]) {
      missing.push(variable.name)
    }
  }

  return {
    valid: missing.length === 0,
    missing: missing.length > 0 ? missing : undefined,
  }
}

/**
 * 任务模板类
 */
export class TaskTemplate {
  private template: AITaskTemplate

  constructor(template: AITaskTemplate) {
    this.template = template
  }

  /**
   * 获取模板定义
   */
  getTemplate(): AITaskTemplate {
    return this.template
  }

  /**
   * 渲染并创建 AITask
   */
  render(context: TemplateContext, taskId?: string): AITask {
    // 验证必填变量
    const validation = validateVariables(this.template, context)
    if (!validation.valid) {
      throw new TemplateRenderError(
        `Missing required variables: ${validation.missing?.join(', ')}`,
        validation.missing
      )
    }

    // 验证文件要求
    if (this.template.requireFiles && (!context.files || context.files.length === 0)) {
      throw new TemplateRenderError('This template requires at least one file')
    }

    // 渲染提示词
    const prompt = renderTemplate(this.template.promptTemplate, context.variables)

    // 创建 AITaskInput
    const input: AITaskInput = {
      prompt,
      files: context.files,
      extra: context.extra,
    }

    // 创建并返回 AITask
    return {
      id: taskId || crypto.randomUUID(),
      kind: this.template.kind,
      input,
    }
  }

  /**
   * 检查上下文是否有效
   */
  validate(context: TemplateContext): { valid: boolean; errors?: string[] } {
    const errors: string[] = []

    // 验证变量
    const variableValidation = validateVariables(this.template, context)
    if (!variableValidation.valid) {
      errors.push(`Missing required variables: ${variableValidation.missing?.join(', ')}`)
    }

    // 验证文件
    if (this.template.requireFiles && (!context.files || context.files.length === 0)) {
      errors.push('This template requires at least one file')
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    }
  }

  /**
   * 获取变量的默认值
   */
  getVariableDefaults(): Record<string, string> {
    const defaults: Record<string, string> = {}
    if (this.template.variables) {
      for (const variable of this.template.variables) {
        if (variable.default !== undefined) {
          defaults[variable.name] = variable.default
        }
      }
    }
    return defaults
  }
}

/**
 * 模板管理器
 */
export class TaskTemplateManager {
  private registry: TemplateRegistry

  constructor(registry?: TemplateRegistry) {
    this.registry = registry || globalRegistry
  }

  /**
   * 注册模板
   */
  registerTemplate(template: AITaskTemplate): TaskTemplate {
    this.registry.register(template)
    return new TaskTemplate(template)
  }

  /**
   * 获取模板
   */
  getTemplate(id: string): TaskTemplate | undefined {
    const template = this.registry.get(id)
    return template ? new TaskTemplate(template) : undefined
  }

  /**
   * 获取所有模板
   */
  listTemplates(): AITaskTemplate[] {
    return this.registry.list()
  }

  /**
   * 按类型筛选模板
   */
  listTemplatesByKind(kind: AITaskKind): AITaskTemplate[] {
    return this.registry.listByKind(kind)
  }

  /**
   * 快速渲染模板（通过模板 ID）
   */
  render(templateId: string, context: TemplateContext, taskId?: string): AITask {
    const template = this.getTemplate(templateId)
    if (!template) {
      throw new TemplateRenderError(`Template not found: ${templateId}`)
    }
    return template.render(context, taskId)
  }

  /**
   * 验证模板上下文（通过模板 ID）
   */
  validate(templateId: string, context: TemplateContext): { valid: boolean; errors?: string[] } {
    const template = this.getTemplate(templateId)
    if (!template) {
      return { valid: false, errors: [`Template not found: ${templateId}`] }
    }
    return template.validate(context)
  }
}

/**
 * 内置模板定义
 */

/**
 * 通用聊天模板
 */
export const CHAT_TEMPLATE: AITaskTemplate = {
  id: 'chat',
  name: '对话',
  description: '与 AI 进行自由对话',
  kind: 'chat',
  promptTemplate: '{{prompt}}',
  variables: [
    {
      name: 'prompt',
      description: '你想要问的问题或请求',
      required: true,
    },
  ],
  requireFiles: false,
  examples: [
    {
      description: '简单提问',
      variables: { prompt: '如何使用 TypeScript 定义泛型类型？' },
    },
  ],
}

/**
 * 代码重构模板
 */
export const REFACTOR_TEMPLATE: AITaskTemplate = {
  id: 'refactor',
  name: '代码重构',
  description: '优化和改进代码结构',
  kind: 'refactor',
  promptTemplate: `请帮我重构以下代码，目标是：{{goal}}

{{#if files}}
相关文件：
{{#each files}}
- {{this}}
{{/each}}
{{/if}}

{{prompt}}`,
  variables: [
    {
      name: 'goal',
      description: '重构目标（如：提高可读性、优化性能、减少重复）',
      default: '提高代码可读性和可维护性',
      required: false,
    },
    {
      name: 'prompt',
      description: '具体的重构要求或上下文',
      required: true,
    },
  ],
  requireFiles: true,
  examples: [
    {
      description: '简化函数逻辑',
      variables: {
        goal: '简化复杂逻辑',
        prompt: '这个函数太长了，请拆分成更小的函数',
      },
      files: ['src/utils/formatter.ts'],
    },
  ],
}

/**
 * 代码解释模板
 */
export const EXPLAIN_TEMPLATE: AITaskTemplate = {
  id: 'explain',
  name: '代码解释',
  description: '解释代码的工作原理',
  kind: 'analyze',
  promptTemplate: `请解释以下代码的工作原理：

{{#if files}}
文件：
{{#each files}}
- {{this}}
{{/each}}
{{/if}}

{{prompt}}

请提供：
1. 代码的整体功能
2. 关键逻辑说明
3. 潜在问题或改进建议`,
  variables: [
    {
      name: 'prompt',
      description: '需要解释的具体内容或问题',
      required: true,
    },
  ],
  requireFiles: true,
  examples: [
    {
      description: '解释函数作用',
      variables: {
        prompt: '请详细解释这个递归函数的执行流程',
      },
      files: ['src/algorithms/quick-sort.ts'],
    },
  ],
}

/**
 * 代码生成模板
 */
export const GENERATE_TEMPLATE: AITaskTemplate = {
  id: 'generate',
  name: '代码生成',
  description: '根据需求生成代码',
  kind: 'generate',
  promptTemplate: `请根据以下需求生成代码：

需求描述：{{prompt}}

{{#if language}}
编程语言：{{language}}
{{/if}}

{{#if files}}
参考文件：
{{#each files}}
- {{this}}
{{/each}}
{{/if}}

请提供完整的代码实现和必要的注释。`,
  variables: [
    {
      name: 'prompt',
      description: '功能需求描述',
      required: true,
    },
    {
      name: 'language',
      description: '编程语言（如：TypeScript、Python）',
      default: 'TypeScript',
      required: false,
    },
  ],
  requireFiles: false,
  examples: [
    {
      description: '生成工具函数',
      variables: {
        prompt: '生成一个防抖函数，支持立即执行选项',
        language: 'TypeScript',
      },
    },
  ],
}

/**
 * Bug 修复模板
 */
export const FIX_BUG_TEMPLATE: AITaskTemplate = {
  id: 'fix-bug',
  name: 'Bug 修复',
  description: '诊断和修复代码问题',
  kind: 'refactor',
  promptTemplate: `请帮我修复以下问题：

问题描述：{{problem}}

{{#if files}}
相关文件：
{{#each files}}
- {{this}}
{{/each}}
{{/if}}

{{#if errorMessage}}
错误信息：
\`\`\`
{{errorMessage}}
\`\`\`
{{/if}}

请提供：
1. 问题原因分析
2. 修复方案
3. 修复后的代码`,
  variables: [
    {
      name: 'problem',
      description: '问题描述',
      required: true,
    },
    {
      name: 'errorMessage',
      description: '错误信息或堆栈',
      required: false,
    },
  ],
  requireFiles: true,
  examples: [
    {
      description: '修复空指针异常',
      variables: {
        problem: '点击按钮时应用崩溃',
        errorMessage: 'TypeError: Cannot read property "map" of undefined',
      },
      files: ['src/components/UserList.tsx'],
    },
  ],
}

/**
 * 添加评论模板
 */
export const ADD_COMMENTS_TEMPLATE: AITaskTemplate = {
  id: 'add-comments',
  name: '添加注释',
  description: '为代码添加详细的注释和文档',
  kind: 'refactor',
  promptTemplate: `请为以下代码添加详细的注释：

{{prompt}}

{{#if style}}
注释风格：{{style}}
{{/if}}

{{#if files}}
文件：
{{#each files}}
- {{this}}
{{/each}}
{{/if}}

请确保注释清晰、准确，有助于理解代码逻辑。`,
  variables: [
    {
      name: 'prompt',
      description: '需要添加注释的代码说明',
      required: true,
    },
    {
      name: 'style',
      description: '注释风格（如：JSDoc、行内注释）',
      default: 'JSDoc',
      required: false,
    },
  ],
  requireFiles: true,
  examples: [
    {
      description: '添加 JSDoc 注释',
      variables: {
        prompt: '为所有公共函数添加完整的 JSDoc 注释',
        style: 'JSDoc',
      },
      files: ['src/utils/api.ts'],
    },
  ],
}

/**
 * 注册所有内置模板
 */
export function registerBuiltinTemplates(manager: TaskTemplateManager): void {
  manager.registerTemplate(CHAT_TEMPLATE)
  manager.registerTemplate(REFACTOR_TEMPLATE)
  manager.registerTemplate(EXPLAIN_TEMPLATE)
  manager.registerTemplate(GENERATE_TEMPLATE)
  manager.registerTemplate(FIX_BUG_TEMPLATE)
  manager.registerTemplate(ADD_COMMENTS_TEMPLATE)
}

/**
 * 全局模板管理器
 */
let globalManager: TaskTemplateManager | null = null

/**
 * 获取全局模板管理器
 */
export function getTemplateManager(): TaskTemplateManager {
  if (!globalManager) {
    globalManager = new TaskTemplateManager()
    registerBuiltinTemplates(globalManager)
  }
  return globalManager
}

/**
 * 重置全局模板管理器（主要用于测试）
 */
export function resetTemplateManager(): void {
  globalManager = null
  globalRegistry.clear()
}

/**
 * 快速创建任务的便捷函数
 */
export function createTaskFromTemplate(
  templateId: string,
  context: TemplateContext,
  taskId?: string
): AITask {
  return getTemplateManager().render(templateId, context, taskId)
}

/**
 * 列出所有可用模板
 */
export function listTemplates(): AITaskTemplate[] {
  return getTemplateManager().listTemplates()
}

/**
 * 获取指定模板
 */
export function getTemplate(id: string): AITaskTemplate | undefined {
  return getTemplateManager().getTemplate(id)?.getTemplate()
}
