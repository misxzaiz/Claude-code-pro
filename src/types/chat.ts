/**
 * 聊天相关类型定义
 */

/** 消息角色 */
export type MessageRole = 'user' | 'assistant' | 'system';

/** 工具调用状态 */
export type ToolStatus = 'pending' | 'running' | 'completed' | 'failed';

/** 工具调用信息 */
export interface ToolCall {
  id: string;
  name: string;
  status: ToolStatus;
  input?: Record<string, unknown>;
  output?: string;
  startedAt: string;
  completedAt?: string;
}

/** 聊天消息 */
export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: string;
  /** 工具调用摘要（替代完整的 toolCalls） */
  toolSummary?: {
    count: number;
    names: string[];
  };
}

/** 权限拒绝详情 */
export interface PermissionDenial {
  toolName: string;
  reason: string;
  details: Record<string, unknown>;
}

/** 权限请求 */
export interface PermissionRequest {
  id: string;
  sessionId: string;
  denials: PermissionDenial[];
  createdAt: string;
}

/** 内容块类型 */
interface ContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  is_error?: boolean;
  content?: string;
}

/** 助手消息结构 */
interface AssistantMessage {
  id: string;
  type: string;
  role: string;
  model: string;
  content: ContentBlock[];
  stop_reason?: string;
  usage?: unknown;
  [key: string]: unknown;
}

/** 用户消息结构（包含工具结果） */
interface UserMessage {
  role: string;
  content: ContentBlock[];
  [key: string]: unknown;
}

/** 流事件类型 */
export type StreamEvent =
  | { type: 'system'; subtype?: string; session_id?: string; [key: string]: unknown }
  | { type: 'assistant'; message: AssistantMessage }
  | { type: 'user'; message: UserMessage }
  | { type: 'session_start'; sessionId: string }
  | { type: 'text_delta'; text: string }
  | { type: 'tool_start'; toolName: string; input: Record<string, unknown> }
  | { type: 'tool_end'; toolName: string; output?: string }
  | { type: 'permission_request'; sessionId: string; denials: PermissionDenial[] }
  | { type: 'result'; subtype: string; [key: string]: unknown }
  | { type: 'error'; error: string }
  | { type: 'session_end' };
