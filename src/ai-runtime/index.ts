/**
 * AI Runtime - AI 抽象运行时
 *
 * 这是一个通用的 AI Code Runtime 平台的核心抽象层。
 * 提供了统一的接口来集成不同的 AI Engine（Claude Code、IFlow、OpenAI、本地 LLM 等）。
 *
 * @module ai-runtime
 */

// 导出核心类型和接口
export * from './engine'
export * from './session'
export * from './task'
export * from './event'
export * from './event-bus'
export * from './cli-parser'
export * from './engine-registry'
export * from './task-template'
export * from './project-context'
export * from './session-pool'

// 导出便捷工具函数
export {
  createTask,
  type AITask,
  type AITaskKind,
  type AITaskInput,
  type AITaskStatus,
  type AITaskMetadata,
} from './task'

export {
  createTokenEvent,
  createToolCallStartEvent,
  createToolCallEndEvent,
  createProgressEvent,
  createErrorEvent,
  createSessionStartEvent,
  createSessionEndEvent,
  createUserMessageEvent,
  createAssistantMessageEvent,
  createTaskMetadataEvent,
  createTaskProgressEvent,
  createTaskCompletedEvent,
  createTaskCanceledEvent,
  isTokenEvent,
  isToolCallStartEvent,
  isToolCallEndEvent,
  isProgressEvent,
  isErrorEvent,
  isSessionStartEvent,
  isSessionEndEvent,
  isUserMessageEvent,
  isAssistantMessageEvent,
  isTaskMetadataEvent,
  isTaskProgressEvent,
  isTaskCompletedEvent,
  isTaskCanceledEvent,
} from './event'

export type {
  AIEvent,
  AIEventListener,
  AIEventFilter,
  TokenEvent,
  ToolCallStartEvent,
  ToolCallEndEvent,
  ProgressEvent,
  ResultEvent,
  ErrorEvent,
  SessionStartEvent,
  SessionEndEvent,
  UserMessageEvent,
  AssistantMessageEvent,
  ToolCallInfo,
  TaskStatus,
  TaskMetadataEvent,
  TaskProgressEvent,
  TaskCompletedEvent,
  TaskCanceledEvent,
} from './event'

export {
  createSessionConfig,
  EventEmitter,
} from './session'

export type {
  AISession,
  AISyncSession,
  AISessionConfig,
  AISessionStatus,
  AISessionFactory,
} from './session'

export { createCapabilities } from './engine'

export type {
  AIEngine,
  AIEngineFactory,
  EngineCapabilities,
  EngineDescriptor,
} from './engine'

// Engine Registry 导出
export {
  AIEngineRegistry,
  getEngineRegistry,
  resetEngineRegistry,
  registerEngine,
  getEngine,
  listEngines,
  getDefaultEngine,
  type EngineRegistration,
  type EngineRegistrationOptions,
  type EngineRegistryEvent,
  type EngineRegistryEventListener,
} from './engine-registry'

// EventBus 导出
export {
  EventBus,
  EventChannel,
  NamespacedEventBus,
  getEventBus,
  resetEventBus,
  type EventListener,
  type EventFilter,
  type EventTransformer,
  type ListenerOptions,
} from './event-bus'

// CLI Parser 导出
export {
  CLIParser,
  createParser,
  parseOutput,
} from './cli-parser'

// Task Manager 导出
export {
  TaskManager,
  getTaskManager,
  resetTaskManager,
  submitTask,
  executeTask,
  abortTask,
  type TaskManagerConfig,
  type TaskOptions,
  type TaskPriority,
  type TaskResult,
  type TaskManagerEvent,
} from './task-manager'

// Task Queue 导出
export {
  TaskQueue,
  createTaskQueue,
  getTaskQueue,
  resetTaskQueue,
  type QueuedTaskStatus,
  type TaskQueueConfig,
} from './task-queue'

/**
 * AI Runtime 版本
 */
export const VERSION = '2.0.0'

/**
 * 默认 Engine ID
 */
export const DEFAULT_ENGINE_ID = 'claude-code'
