# IFlow CLI 集成方案

## 概述

本文档描述如何将 IFlow CLI 作为另一个 AI Engine 集成到 Claude Code Pro 中。

## 架构设计

```
┌─────────────────────────────────────────────────────────────┐
│                         UI Layer                            │
│  - 引擎选择器 (Claude Code / IFlow)                          │
│  - 只消费 AIEvent，不关心具体引擎                             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    TaskQueue (唯一调度入口)                   │
│  - 根据 task.engineId 选择引擎                                │
│  - 统一的任务调度和并发控制                                    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   EngineRegistry                             │
│  - 管理所有已注册的 AI Engine                                 │
│  - 根据 engineId 获取对应引擎                                 │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
┌─────────────────────────────┐   ┌─────────────────────────────┐
│   ClaudeCodeEngine          │   │   IFlowEngine (新增)        │
│   id: 'claude-code'         │   │   id: 'iflow'               │
├─────────────────────────────┤   ├─────────────────────────────┤
│ - ClaudeEventParser         │   │ - IFlowEventParser (新增)   │
│ - ClaudeCodeSession         │   │ - IFlowSession (新增)       │
└─────────────────────────────┘   └─────────────────────────────┘
```

## 核心组件

### 1. IFlowEngine

```typescript
// src/engines/iflow/engine.ts
import type { AIEngine, AISession, AISessionConfig } from '../../ai-runtime'

export class IFlowEngine implements AIEngine {
  readonly id = 'iflow'
  readonly name = 'IFlow'

  readonly capabilities = {
    supportedTaskKinds: ['chat', 'refactor', 'explain', 'generate'],
    supportsStreaming: true,
    supportsConcurrentSessions: true,
    supportsTaskAbort: true,
    maxConcurrentSessions: 3,
    description: 'IFlow AI CLI - 支持多种 AI 模型的编程助手',
    version: '1.0.0',
  }

  async isAvailable(): Promise<boolean> {
    // 检查 iflow CLI 是否已安装
    return this.checkIFlowInstalled()
  }

  createSession(config?: AISessionConfig): AISession {
    return new IFlowSession(config)
  }

  private async checkIFlowInstalled(): Promise<boolean> {
    // 检查 iflow 命令是否可用
    // Windows: iflow.exe
    // Unix: iflow
    return true
  }
}
```

### 2. IFlowEventParser

将 IFlow 的输出事件转换为统一的 AIEvent：

```typescript
// src/engines/iflow/event-parser.ts
import type { AIEvent, ToolCallInfo } from '../../ai-runtime'
import {
  createTokenEvent,
  createToolCallStartEvent,
  createToolCallEndEvent,
  createProgressEvent,
  createErrorEvent,
  createSessionStartEvent,
  createSessionEndEvent,
  createAssistantMessageEvent,
  createUserMessageEvent,
} from '../../ai-runtime'

/**
 * IFlow StreamEvent 类型
 * IFlow CLI 输出的原始事件格式
 */
export interface IFlowStreamEvent {
  type: string
  [key: string]: unknown
}

/**
 * IFlow 事件解析器
 *
 * 将 IFlow 特定的事件格式转换为通用的 AIEvent
 */
export class IFlowEventParser {
  private sessionId: string

  constructor(sessionId: string) {
    this.sessionId = sessionId
  }

  /**
   * 解析 IFlow StreamEvent 为 AIEvent
   */
  parse(event: IFlowStreamEvent): AIEvent[] {
    const results: AIEvent[] = []

    switch (event.type) {
      case 'start':
        results.push(createSessionStartEvent(this.sessionId))
        break

      case 'end':
      case 'complete':
        results.push(createSessionEndEvent(this.sessionId, 'completed'))
        break

      case 'error':
        results.push(createErrorEvent(event.error as string || '未知错误'))
        break

      case 'message':
        // IFlow 的消息格式
        results.push(...this.parseMessageEvent(event))
        break

      case 'token':
      case 'delta':
        // 流式输出
        results.push(this.parseTokenEvent(event))
        break

      case 'tool_call':
      case 'tool':
        results.push(...this.parseToolEvent(event))
        break

      case 'progress':
        results.push(createProgressEvent(event.message as string))
        break

      default:
        console.warn('[IFlowEventParser] Unknown event type:', event.type)
    }

    return results
  }

  private parseMessageEvent(event: IFlowStreamEvent): AIEvent[] {
    // 根据 IFlow 的消息格式解析
    const content = event.content as string || ''
    return [createAssistantMessageEvent(content, false)]
  }

  private parseTokenEvent(event: IFlowStreamEvent): AIEvent {
    const text = event.text as string || event.delta as string || ''
    return createAssistantMessageEvent(text, true)
  }

  private parseToolEvent(event: IFlowStreamEvent): AIEvent[] {
    const toolName = event.tool as string || event.name as string || 'unknown'
    const args = event.args as Record<string, unknown> || event.input as Record<string, unknown> || {}

    if (event.status === 'start' || !event.status) {
      return [createToolCallStartEvent(toolName, args)]
    } else {
      return [
        createToolCallEndEvent(
          toolName,
          event.result,
          event.status !== 'error'
        ),
      ]
    }
  }

  reset(): void {
    // 重置解析器状态
  }
}
```

### 3. IFlowSession

```typescript
// src/engines/iflow/session.ts
import type { AISession, AISessionConfig, AITask, AIEvent } from '../../ai-runtime'
import { IFlowEventParser } from './event-parser'

export class IFlowSession implements AISession {
  readonly id: string
  readonly engineId: string = 'iflow'
  private config: AISessionConfig
  private parser: IFlowEventParser
  private isDisposed: boolean = false

  constructor(config?: AISessionConfig) {
    this.id = crypto.randomUUID()
    this.config = config || {}
    this.parser = new IFlowEventParser(this.id)
  }

  async run(task: AITask): AsyncIterable<AIEvent> {
    if (this.isDisposed) {
      throw new Error('Session 已被释放')
    }

    const queue: AIEvent[] = []
    let resolver: (() => void) | null = null

    // 启动 IFlow CLI 进程
    const process = this.startIFlowProcess(task)

    // 处理输出
    process.stdout?.on('data', (data: Buffer) => {
      const lines = data.toString().split('\n')
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const event = JSON.parse(line) as IFlowStreamEvent
          const aiEvents = this.parser.parse(event)
          queue.push(...aiEvents)
          resolver?.()
        } catch (e) {
          console.error('[IFlowSession] Failed to parse:', line)
        }
      }
    })

    // 返回异步迭代器
    return {
      async *[Symbol.asyncIterator]() {
        while (!this.isDisposed) {
          if (queue.length > 0) {
            yield queue.shift()!
          } else {
            await new Promise<void>((resolve) => {
              resolver = resolve
            })
          }
        }
      },
    }
  }

  abort(taskId: string): void {
    this.isDisposed = true
    // 中断 IFlow 进程
  }

  dispose(): void {
    this.isDisposed = true
  }

  private startIFlowProcess(task: AITask) {
    // 构建 iflow 命令
    const args = this.buildIFlowArgs(task)
    // 启动子进程
    return { stdout: { on: () => {} } }
  }

  private buildIFlowArgs(task: AITask): string[] {
    // 根据 IFlow CLI 的参数格式构建
    return ['--json', '--stream', task.input.prompt as string]
  }
}
```

## UI 集成

### 引擎选择器

```typescript
// src/components/Settings/SettingsModal.tsx
const [selectedEngine, setSelectedEngine] = useState<EngineId>('claude-code')

const engines = [
  { id: 'claude-code', name: 'Claude Code', description: 'Anthropic 官方 Claude CLI' },
  { id: 'iflow', name: 'IFlow', description: '支持多种 AI 模型的编程助手' },
]
```

### 配置存储

```typescript
// src/stores/configStore.ts
interface EngineConfig {
  defaultEngine: 'claude-code' | 'iflow'
  engines: {
    claudeCode: { path: string }
    iflow: { path: string; model?: string }
  }
}
```

## 实现步骤

1. [x] 创建 `src/engines/iflow/` 目录
2. [x] 实现 `IFlowEngine`
3. [x] 实现 `IFlowEventParser`
4. [x] 实现 `IFlowSession`
5. [x] 在 `EngineRegistry` 中注册 IFlowEngine
6. [x] UI 添加引擎选择器
7. [x] 添加 IFlow 配置项
8. [ ] 测试两种引擎切换

## 已完成文件列表

- `src/engines/iflow/event-parser.ts` - IFlow 事件解析器
- `src/engines/iflow/session.ts` - IFlow 会话管理
- `src/engines/iflow/engine.ts` - IFlow 引擎实现
- `src/engines/iflow/index.ts` - 模块导出
- `src/engines/index.ts` - 添加 IFlow 导出
- `src/core/engine-bootstrap.ts` - 注册 IFlowEngine
- `src/types/config.ts` - 添加引擎配置类型
- `src/components/Settings/SettingsModal.tsx` - 添加引擎选择器 UI

## 差异处理

### 事件格式差异

| Claude Code | IFlow | AIEvent |
|-------------|-------|---------|
| `assistant` | `message` | `assistant_message` |
| `text_delta` | `token` / `delta` | `token` |
| `tool_start` | `tool_call` (status=start) | `tool_call_start` |
| `tool_end` | `tool_call` (status=end) | `tool_call_end` |
| `session_end` | `end` / `complete` | `session_end` |

### 命令行参数差异

| Claude Code | IFlow |
|-------------|-------|
| `--print` | `-p` / `--print` |
| `--verbose` | `-v` / `--verbose` |
| `--output-format stream-json` | `--json` / `--format json` |
| `--resume <id>` | `--continue` / `--resume` |
| `--permission-mode` | (可能不同) |

## 注意事项

1. **事件格式**: IFlow 的事件格式可能与 Claude Code 有差异，需要仔细适配
2. **模型选择**: IFlow 支持多种模型，需要添加模型配置选项
3. **API 密钥**: 如果 IFlow 使用 API 调用，需要处理密钥配置
4. **工具系统**: IFlow 的工具调用格式可能不同，需要映射到统一的 ToolCallInfo
5. **错误处理**: 两种引擎的错误格式可能不同，需要统一处理

## 结论

由于当前项目已经实现了完整的抽象层和事件驱动架构，集成 IFlow CLI 是**完全可行**的。主要工作是实现 IFlow 特定的事件解析器和会话管理，而 UI 层和调度层无需修改。
