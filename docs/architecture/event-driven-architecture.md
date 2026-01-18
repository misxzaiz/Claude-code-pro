# Polaris - 事件驱动架构文档

## 一、文件级架构图

```
src/
├── ai-runtime/                    # 核心：AI 抽象运行时
│   ├── index.ts                  # 统一导出
│   ├── engine.ts                 # AIEngine 接口
│   ├── session.ts                # AISession 接口
│   ├── task.ts                   # AITask 通用模型
│   ├── event.ts                  # AIEvent 通用事件
│   ├── event-bus.ts              # 全局事件总线 (新增)
│   ├── cli-parser.ts             # CLI 输出解析器 (新增)
│   └── task-manager.ts           # 任务管理器 (新增)
│
├── engines/                       # AI Engine 实现
│   └── claude-code/              # Claude Code Adapter
│       ├── engine.ts
│       ├── session.ts
│       └── event-parser.ts
│
├── services/                     # 服务层
│   ├── aiRuntimeService.ts       # AI Runtime 服务 (事件驱动版)
│   ├── aiRuntimeAdapter.ts       # 适配层
│   └── tauri.ts                  # Tauri API 封装
│
├── stores/                       # 状态管理
│   ├── chatStore.ts              # 旧版 Chat Store (兼容)
│   ├── aiChatStore.ts            # 新版 Chat Store
│   └── eventChatStore.ts         # 事件驱动 Chat Store (新增)
│
├── hooks/                        # React Hooks
│   ├── useChat.ts                # 旧版 Chat Hook (兼容)
│   └── useAIChat.ts              # 事件驱动 Chat Hook (更新)
│
└── components/                   # UI 组件
    ├── Chat/                     # 聊天组件
    ├── ToolPanel/                # 工具面板
    └── ...
```

---

## 二、事件流示意图

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         用户操作层                                      │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────────┐  │
│  │ 发送消息  │    │  继续对话  │    │  中断对话  │    │  查看工具调用  │  │
│  └─────┬────┘    └─────┬────┘    └─────┬────┘    └──────┬───────┘  │
└────────┼─────────────┼─────────────┼──────────────────┼──────────────┘
         │             │             │                  │
         ▼             ▼             ▼                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         UI 组件层                                        │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │  ChatMessages.tsx │ ToolPanel.tsx │ StatusBar.tsx                │ │
│  └──────────────────────────────────────────────────────────────────┘ │
│                                    │                                   │
└────────────────────────────────────┼───────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     状态管理层 (Zustand Stores)                        │
│  ┌──────────────────────┐    ┌──────────────────────┐                 │
│  │  eventChatStore.ts   │    │  toolPanelStore.ts   │                 │
│  │  - messages          │    │  - tools             │                 │
│  │  - currentContent    │    │  - status            │                 │
│  │  - progressMessage   │    │                      │                 │
│  └──────────┬───────────┘    └──────────┬───────────┘                 │
└─────────────┼──────────────────────────────┼─────────────────────────────┘
              │                              │
              ▼                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    事件总线层 (EventBus)                                  │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  EventBus (全局单例)                                              │  │
│  │                                                                   │  │
│  │  ┌────────────────────────────────────────────────────────────┐  │  │
│  │  │  订阅者                                                     │  │  │
│  │  │  - session_start  ──────────────► eventChatStore           │  │  │
│  │  │  - session_end    ──────────────► eventChatStore           │  │  │
│  │  │  - token         ──────────────► eventChatStore (增量更新)  │  │  │
│  │  │  - assistant_msg ──────────────► eventChatStore           │  │  │
│  │  │  - tool_start    ──────────────► toolPanelStore           │  │  │
│  │  │  - tool_end      ──────────────► toolPanelStore           │  │
│  │  │  - progress      ──────────────► UI 进度显示              │  │  │
│  │  │  - error         ──────────────► UI 错误提示              │  │  │
│  │  └────────────────────────────────────────────────────────────┘  │  │
│  │                                                                   │  │
│  │  emit(event: AIEvent) ──────► 广播到所有订阅者                  │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    服务层 (AIRuntimeService)                            │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  AIRuntimeService                                                 │  │
│  │                                                                   │  │
│  │  1. 监听 Tauri 的 'chat-event' (原生 StreamEvent)                │  │
│  │  2. 转换: StreamEvent ──► AIEvent (streamEventToAIEvent)         │  │
│  │  3. 通过 EventBus 分发 AIEvent                                    │  │
│  │                                                                   │  │
│  │  提供方法:                                                         │  │
│  │  - sendMessage()    │  interrupt()    │  getEventBus()           │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    Tauri 后端层 (Rust)                                   │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  start_chat() / continue_chat() / interrupt_chat()              │  │
│  │                                                                   │  │
│  │  启动 Claude Code CLI 进程                                        │  │
│  │  ┌────────────────────────────────────────────────────────────┐  │  │
│  │  │  Claude CLI (stream-json 格式输出)                          │  │  │
│  │  │  ├─ system          (系统消息)                              │  │  │
│  │  │  ├─ assistant       (AI 回复)                              │  │  │
│  │  │  ├─ user            (用户消息 + 工具结果)                   │  │  │
│  │  │  ├─ text_delta      (增量文本)                            │  │  │
│  │  │  ├─ tool_start      (工具调用开始)                         │  │  │
│  │  │  ├─ tool_end        (工具调用结束)                         │  │  │
│  │  │  └─ error           (错误)                                  │  │  │
│  │  └────────────────────────────────────────────────────────────┘  │  │
│  │                                                                   │  │
│  │  解析 stdout → StreamEvent → emit('chat-event')                 │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 三、AIEvent 类型系统

```typescript
// AIEvent 联合类型 - 所有事件的统一格式
type AIEvent =
  | SessionStartEvent     // 会话开始
  | SessionEndEvent       // 会话结束
  | UserMessageEvent      // 用户消息
  | AssistantMessageEvent // AI 消息（完整或增量）
  | TokenEvent            // 文本增量
  | ToolCallStartEvent   // 工具调用开始
  | ToolCallEndEvent     // 工具调用结束
  | ProgressEvent        // 进度更新
  | ErrorEvent           // 错误

// 核心设计原则：
// 1. UI 层只消费 AIEvent，不直接接触 StreamEvent
// 2. 所有 AI 输出都必须转换为 AIEvent 后再流转
// 3. 事件类型使用 discriminated union 模式
```

---

## 四、核心模块说明

### 4.1 EventBus (src/ai-runtime/event-bus.ts)

全局事件总线，负责事件的发布订阅：

```typescript
// 订阅特定事件
eventBus.on('token', (event) => {
  // 处理 token 事件
})

// 订阅所有事件
eventBus.on('*', (event) => {
  // 处理所有事件
})

// 发布事件
eventBus.emit({
  type: 'token',
  value: 'Hello'
})
```

### 4.2 CLIParser (src/ai-runtime/cli-parser.ts)

CLI 输出解析器，将 Claude CLI 的 stdout 转换为 AIEvent：

```typescript
const parser = createParser()

// 解析单行
const events = parser.parseLine('{"type": "text_delta", "text": "Hello"}')

// 流式解析（处理不完整的行）
const events = parser.parseChunk('{"type": "text_delta", "text": "Hel')
```

### 4.3 TaskManager (src/ai-runtime/task-manager.ts)

事件驱动的任务管理器：

```typescript
const taskManager = getTaskManager()

// 提交任务
const taskId = taskManager.submit(createTask('chat', { prompt: '...' }))

// 执行任务
const result = await taskManager.execute(createTask('refactor', { files: [...] }))

// 中断任务
taskManager.abort(taskId)
```

### 4.4 EventChatStore (src/stores/eventChatStore.ts)

完全基于 EventBus 的聊天状态管理：

```typescript
const chatStore = useEventChatStore()

// 初始化事件监听
const cleanup = chatStore.initializeEventListeners()

// 发送消息
await chatStore.sendMessage('Hello')
```

---

## 五、事件驱动架构的优势

| 特性 | 说明 |
|------|------|
| **解耦** | UI 组件不直接依赖 Claude 特定实现 |
| **可测试** | 可以模拟 AIEvent 进行单元测试 |
| **可扩展** | 新增 AI Engine 只需实现 AIEvent 转换 |
| **可观测** | 所有事件通过 EventBus 流转，易于调试 |
| **可组合** | 多个监听器可以独立处理同一事件 |

---

## 六、迁移指南

### 6.1 从旧 Store 迁移到新 Store

```typescript
// 旧版本 (chatStore.ts)
import { useChatStore } from '@/stores'

// 新版本 (eventChatStore.ts)
import { useEventChatStore } from '@/stores'

const chatStore = useEventChatStore()
useEffect(() => {
  const cleanup = chatStore.initializeEventListeners()
  return cleanup
}, [])
```

### 6.2 从旧 Hook 迁移到新 Hook

```typescript
// 旧版本 (useChat.ts)
import { useChatEvent } from '@/hooks'

// 新版本 (useAIChat.ts)
import { useAIChat } from '@/hooks'

const { sendMessage, isStreaming } = useAIChat((event) => {
  console.log('AI Event:', event)
})
```

---

## 七、版本信息

- **AI Runtime 版本**: 2.0.0
- **架构模式**: 事件驱动 (Event-Driven Architecture)
- **通信方式**: EventBus 发布订阅
- **事件格式**: 统一 AIEvent 联合类型
