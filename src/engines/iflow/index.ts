/**
 * IFlow Engine 导出
 *
 * IFlow CLI 的 AIEngine 实现。
 */

export { IFlowEngine, createIFlowEngine, defaultIFlowEngine } from './engine'
export type { IFlowEngineConfig } from './engine'

export { IFlowSession, createIFlowSession } from './session'
export type { IFlowConfig } from './session'

export {
  IFlowEventParser,
  parseStreamEventLine as parseIFlowStreamEventLine,
  convertIFlowEventsToAIEvents,
} from './event-parser'
export type {
  IFlowStreamEvent,
  IFlowMessageEvent,
  IFlowTokenEvent,
  IFlowToolEvent,
  IFlowProgressEvent,
  IFlowErrorEvent,
  IFlowSessionEvent,
} from './event-parser'
