# Polaris AI 底层抽象层设计方案分析

本文档分析如何设计抽象层，以支持未来接入其他 AI 底层工具（如 OpenAI、本地模型、其他 AI 编程助手等）。

---

## 目录

- [现状分析](#现状分析)
- [耦合问题识别](#耦合问题识别)
- [抽象层设计目标](#抽象层设计目标)
- [架构设计方案](#架构设计方案)
- [接口定义](#接口定义)
- [适配器模式实现](#适配器模式实现)
- [事件标准化](#事件标准化)
- [状态管理解耦](#状态管理解耦)
- [迁移路径](#迁移路径)
- [技术挑战](#技术挑战)

---

## 现状分析

### 当前架构图

```
┌─────────────────────────────────────────────────────────────────────┐
│                        当前架构 (紧密耦合)                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────┐                                               │
│  │   Frontend      │                                               │
│  │   (React + TS)  │                                               │
│  │                 │                                               │
│  │  ┌───────────┐  │    ┌──────────────┐                          │
│  │  │chatStore  │──┼───→│  tauri.ts    │                          │
│  │  └───────────┘  │    │              │                          │
│  │                 │    │  invoke()    │                          │
│  │  ┌───────────┐  │    └──────┬───────┘                          │
│  │  │toolPanel  │  │           │                                  │
│  │  │  Store    │  │           │ Tauri IPC                        │
│  │  └───────────┘  │           │                                  │
│  └─────────────────┘           ▼                                  │
│                        ┌─────────────────┐                         │
│                        │  Rust Backend   │                         │
│                        │                 │                         │
│                        │  ┌───────────┐  │                         │
│                        │  │chat.rs    │  │                         │
│                        │  │           │  │                         │
│                        │  │直接调用    │  │                         │
│                        │  │Claude CLI │  │                         │
│                        │  └─────┬─────┘  │                         │
│                        └────────┼────────┘                         │
│                                 │                                  │
│                                 ▼                                  │
│                        ┌─────────────────┐                         │
│                        │  Claude CLI     │                         │
│                        │  (claude.cmd)   │                         │
│                        └─────────────────┘                         │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 关键代码位置分析

| 层级 | 文件 | 耦合点 |
|------|------|--------|
| **前端服务** | `src/services/tauri.ts` | 直接使用 `invoke()` 调用 Rust 命令 |
| **聊天状态** | `src/stores/chatStore.ts` | 调用 `tauri.startChat()` / `continueChat()` |
| **事件处理** | `src/stores/chatStore.ts:182-316` | 处理 Claude CLI 特定的 `StreamEvent` |
| **类型定义** | `src/types/chat.ts:82-93` | `StreamEvent` 类型完全基于 Claude CLI 格式 |
| **Rust 命令** | `src-tauri/src/commands/chat.rs` | 直接执行 Claude CLI 进程 |
| **事件解析** | `src-tauri/src/models/events.rs` | 解析 Claude CLI 的 stream-json 格式 |

---

## 耦合问题识别

### 问题 1: 紧耦合的 CLI 调用

**位置**: `src-tauri/src/commands/chat.rs:165-221`

```rust
// 当前代码直接调用 Claude CLI
pub fn start(config: &Config, message: &str) -> Result<Self> {
    let mut cmd = Command::new(&config.claude_cmd)
        .arg("--print")
        .arg("--verbose")
        .arg("--output-format")
        .arg("stream-json")  // ← Claude CLI 特定参数
        .arg("--permission-mode")
        .arg("bypassPermissions")
        .arg(message);
    // ...
}
```

**问题**:
- 硬编码 Claude CLI 特定参数
- 无法替换为其他 AI 服务
- 启动逻辑与 Claude CLI 强绑定

---

### 问题 2: Claude 特定的事件格式

**位置**: `src-tauri/src/models/events.rs:14-71`

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum StreamEvent {
    #[serde(rename = "system")]
    System { ... },
    #[serde(rename = "assistant")]
    Assistant { ... },
    // ... 其他事件类型都是 Claude CLI 特定的
}
```

**问题**:
- 事件结构完全匹配 Claude CLI 输出
- 其他 AI 服务可能使用完全不同的事件格式
- 前端依赖这些特定事件类型

---

### 问题 3: 前端状态管理依赖特定事件

**位置**: `src/stores/chatStore.ts:182-316`

```typescript
handleStreamEvent: (event: StreamEvent) => {
  switch (event.type) {
    case 'system':      // Claude CLI 特定
    case 'assistant':   // Claude Message API 特定
    case 'text_delta':  // Claude 流式输出特定
    case 'tool_start':  // Claude 工具调用特定
    // ...
  }
}
```

**问题**:
- 事件处理逻辑与 Claude CLI 事件一一对应
- 其他 AI 可能没有 `tool_start`/`tool_end` 等概念
- 缺少统一的事件抽象层

---

### 问题 4: 缺少提供者配置

**当前配置** (`src-tauri/src/models/config.rs`):

```rust
pub struct Config {
    pub claude_cmd: String,  // ← 只有 Claude CLI 路径
    pub work_dir: Option<PathBuf>,
    pub git_bin_path: Option<String>,
}
```

**问题**:
- 无法配置其他 AI 提供者
- 缺少 API Key、端点 URL 等通用配置
- 没有提供者选择机制

---

## 抽象层设计目标

### 核心目标

1. **解耦**: 将前端与特定 AI 实现解耦
2. **可扩展**: 支持添加新的 AI 提供者而无需修改核心代码
3. **统一接口**: 前端使用统一的 API，无需关心底层实现
4. **向后兼容**: 现有 Claude CLI 功能不受影响

### 设计原则

| 原则 | 说明 |
|------|------|
| **接口隔离** | 定义最小化的通用接口 |
| **适配器模式** | 每个提供者实现适配器 |
| **事件标准化** | 统一的事件格式，提供者负责转换 |
| **配置驱动** | 运行时选择提供者，无需重新编译 |

---

## 架构设计方案

### 目标架构图

```
┌─────────────────────────────────────────────────────────────────────┐
│                        目标架构 (解耦设计)                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    Frontend (React + TS)                     │   │
│  │                                                              │   │
│  │  ┌──────────────┐                                           │   │
│  │  │  chatStore   │                                           │   │
│  │  │              │──┐                                        │   │
│  │  └──────────────┘  │                                        │   │
│  │                    │                                        │   │
│  │  ┌──────────────┐  │  ┌─────────────────────────────────┐   │   │
│  │  │ toolPanel    │  ├──│   aiService (统一接口)           │   │   │
│  │  │ Store        │  │  │                                 │   │   │
│  │  └──────────────┘  │  │  startChat(message)             │   │   │
│  │                    │  │  continueChat(session, message) │   │   │
│  │  ┌──────────────┐  │  │  interruptChat(session)        │   │   │
│  │  │  其他 Store  │  │  │  onEvent(callback)              │   │   │
│  │  └──────────────┘  │  │                                 │   │   │
│  │                    │  └─────────────┬───────────────────┘   │   │
│  └────────────────────┼────────────────┼───────────────────────┘   │
│                       │                │                           │
└───────────────────────┼────────────────┼───────────────────────────┘
                        │                │
                        │         Tauri IPC
                        │                │
                        ▼                ▼
        ┌───────────────────────────────────────────┐
        │            Rust Backend                    │
        │                                           │
        │  ┌─────────────────────────────────────┐  │
        │  │       ProviderManager               │  │
        │  │  (根据配置选择 Provider)             │  │
        │  └──────────────┬──────────────────────┘  │
        │                 │                          │
        │                 ▼                          │
        │  ┌─────────────────────────────────────┐  │
        │  │         Provider Trait              │  │
        │  │  (统一接口定义)                      │  │
        │  └──────────────┬──────────────────────┘  │
        │                 │                          │
        │      ┌──────────┼──────────┐              │
        │      │          │          │              │
        │      ▼          ▼          ▼              │
        │  ┌───────┐ ┌────────┐ ┌──────────┐       │
        │  │Claude │ │ OpenAI │ │ Local   │       │
        │  │Provider│ │Provider│ │Provider │       │
        │  └───────┘ └────────┘ └──────────┘       │
        │                                           │
        └───────────────────────────────────────────┘
```

---

## 接口定义

### 1. Provider Trait (Rust)

```rust
// src-tauri/src/providers/mod.rs

use async_trait::async_trait;
use crate::models::events::StandardEvent;

/// AI 提供者配置
#[derive(Clone, Debug)]
pub struct ProviderConfig {
    /// 提供者类型
    pub provider_type: ProviderType,
    /// API 端点 (对于 API 提供者)
    pub api_endpoint: Option<String>,
    /// API 密钥
    pub api_key: Option<String>,
    /// 模型名称
    pub model: Option<String>,
    /// 工作目录 (对于 CLI 提供者)
    pub work_dir: Option<std::path::PathBuf>,
}

/// 提供者类型
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ProviderType {
    ClaudeCli,
    OpenAI,
    AnthropicApi,
    Ollama,
    Custom(String),
}

/// 统一的会话句柄
pub struct SessionHandle {
    pub id: String,
    pub provider_type: ProviderType,
    // 内部状态由具体提供者管理
    pub inner: Box<dyn std::any::Any + Send + Sync>,
}

/// AI 提供者统一接口
#[async_trait]
pub trait AIProvider: Send + Sync {
    /// 提供者类型标识
    fn provider_type(&self) -> ProviderType;

    /// 初始化提供者
    async fn initialize(&mut self, config: &ProviderConfig) -> Result<(), ProviderError>;

    /// 启动新会话
    async fn start_session(
        &self,
        message: &str,
        config: &ProviderConfig,
    ) -> Result<SessionHandle, ProviderError>;

    /// 继续现有会话
    async fn continue_session(
        &self,
        session_id: &str,
        message: &str,
        config: &ProviderConfig,
    ) -> Result<(), ProviderError>;

    /// 中断会话
    async fn interrupt_session(&self, session_id: &str) -> Result<(), ProviderError>;

    /// 订阅会话事件
    fn subscribe_events(
        &self,
        session_id: &str,
        callback: Box<dyn FnMut(StandardEvent) + Send>,
    ) -> Result<(), ProviderError>;
}
```

### 2. 标准化事件类型

```rust
// src-tauri/src/models/standard_events.rs

use serde::{Deserialize, Serialize};

/// 标准化事件类型 (与具体提供者解耦)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "eventType")]
pub enum StandardEvent {
    /// 会话开始
    SessionStart {
        session_id: String,
        provider_type: String,
    },

    /// 会话结束
    SessionEnd {
        session_id: String,
        reason: Option<String>,
    },

    /// 文本增量 (流式输出)
    TextDelta {
        session_id: String,
        text: String,
    },

    /// 助手消息 (完整或块)
    AssistantMessage {
        session_id: String,
        content: String,
        is_complete: bool,
    },

    /// 工具调用开始
    ToolStart {
        session_id: String,
        tool_id: String,
        tool_name: String,
        input: serde_json::Value,
    },

    /// 工具调用结束
    ToolEnd {
        session_id: String,
        tool_id: String,
        tool_name: String,
        output: Option<String>,
        success: bool,
    },

    /// Token 使用统计
    TokenUsage {
        session_id: String,
        prompt_tokens: u32,
        completion_tokens: u32,
        total_tokens: u32,
    },

    /// 错误
    Error {
        session_id: String,
        code: String,
        message: String,
    },

    /// 原始日志 (用于调试)
    RawLog {
        session_id: String,
        level: String,
        message: String,
    },
}
```

### 3. 前端统一接口

```typescript
// src/services/aiProvider.ts

/** 提供者类型 */
export type ProviderType =
  | 'claude-cli'
  | 'openai'
  | 'anthropic-api'
  | 'ollama'
  | 'custom';

/** 提供者配置 */
export interface ProviderConfig {
  type: ProviderType;
  apiEndpoint?: string;
  apiKey?: string;
  model?: string;
  cliPath?: string;  // CLI 类型提供者的路径
}

/** 标准化事件类型 */
export type StandardEvent =
  | { eventType: 'sessionStart'; sessionId: string; providerType: string }
  | { eventType: 'sessionEnd'; sessionId: string; reason?: string }
  | { eventType: 'textDelta'; sessionId: string; text: string }
  | { eventType: 'assistantMessage'; sessionId: string; content: string; isComplete: boolean }
  | { eventType: 'toolStart'; sessionId: string; toolId: string; toolName: string; input: Record<string, unknown> }
  | { eventType: 'toolEnd'; sessionId: string; toolId: string; toolName: string; output?: string; success: boolean }
  | { eventType: 'tokenUsage'; sessionId: string; promptTokens: number; completionTokens: number; totalTokens: number }
  | { eventType: 'error'; sessionId: string; code: string; message: string }
  | { eventType: 'rawLog'; sessionId: string; level: string; message: string };

/** AI 服务统一接口 */
export interface AIProviderService {
  /** 获取当前提供者类型 */
  getProviderType(): Promise<ProviderType>;

  /** 启动新会话 */
  startChat(message: string, workDir?: string): Promise<string>;

  /** 继续会话 */
  continueChat(sessionId: string, message: string, workDir?: string): Promise<void>;

  /** 中断会话 */
  interruptChat(sessionId: string): Promise<void>;

  /** 订阅事件 (通过 Tauri 事件) */
  onEvent(callback: (event: StandardEvent) => void): () => void;
}

/** 实现 */
class TauriAIProvider implements AIProviderService {
  async getProviderType(): Promise<ProviderType> {
    return invoke<ProviderType>('get_provider_type');
  }

  async startChat(message: string, workDir?: string): Promise<string> {
    return invoke<string>('provider_start_chat', { message, workDir });
  }

  // ... 其他方法
}

export const aiProvider = new TauriAIProvider();
```

---

## 适配器模式实现

### Claude CLI 适配器

```rust
// src-tauri/src/providers/claude_cli.rs

use super::{AIProvider, ProviderConfig, ProviderError, SessionHandle, StandardEvent};
use crate::models::events::StreamEvent;
use std::sync::{Arc, Mutex};

pub struct ClaudeCliProvider {
    sessions: Arc<Mutex<HashMap<String, ClaudeSession>>>,
}

struct ClaudeSession {
    id: String,
    child: Child,
    event_converter: EventConverter,
}

/// 将 Claude CLI 特定事件转换为标准事件
struct EventConverter;

impl EventConverter {
    fn convert(claude_event: StreamEvent, session_id: &str) -> Option<StandardEvent> {
        match claude_event {
            StreamEvent::System { subtype, extra } => {
                // 提取 session_id
                extra.get("session_id")
                    .and_then(|v| v.as_str())
                    .map(|id| StandardEvent::SessionStart {
                        session_id: id.to_string(),
                        provider_type: "claude-cli".to_string(),
                    })
            }

            StreamEvent::TextDelta { text } => {
                Some(StandardEvent::TextDelta {
                    session_id: session_id.to_string(),
                    text,
                })
            }

            StreamEvent::ToolStart { tool_name, input } => {
                Some(StandardEvent::ToolStart {
                    session_id: session_id.to_string(),
                    tool_id: uuid::Uuid::new_v4().to_string(),
                    tool_name,
                    input,
                })
            }

            StreamEvent::ToolEnd { tool_name, output } => {
                Some(StandardEvent::ToolEnd {
                    session_id: session_id.to_string(),
                    tool_id: String::new(), // 需要跟踪
                    tool_name,
                    output,
                    success: output.is_some(),
                })
            }

            StreamEvent::SessionEnd => {
                Some(StandardEvent::SessionEnd {
                    session_id: session_id.to_string(),
                    reason: None,
                })
            }

            StreamEvent::Error { error } => {
                Some(StandardEvent::Error {
                    session_id: session_id.to_string(),
                    code: "CLAUDE_ERROR".to_string(),
                    message: error,
                })
            }

            _ => None, // 忽略不关心的事件
        }
    }
}

#[async_trait]
impl AIProvider for ClaudeCliProvider {
    fn provider_type(&self) -> ProviderType {
        ProviderType::ClaudeCli
    }

    async fn initialize(&mut self, config: &ProviderConfig) -> Result<(), ProviderError> {
        // 验证 CLI 路径
        Ok(())
    }

    async fn start_session(
        &self,
        message: &str,
        config: &ProviderConfig,
    ) -> Result<SessionHandle, ProviderError> {
        // 使用现有的 Claude CLI 启动逻辑
        // 但在回调中转换事件为 StandardEvent
        todo!()
    }

    // ... 其他方法
}
```

### OpenAI API 适配器 (示例)

```rust
// src-tauri/src/providers/openai.rs

use super::{AIProvider, ProviderConfig, ProviderError, SessionHandle, StandardEvent};
use reqwest::Client;
use serde_json::Value;

pub struct OpenAIProvider {
    client: Client,
    sessions: Arc<Mutex<HashMap<String, OpenAISession>>>,
}

struct OpenAISession {
    id: String,
    messages: Vec<Value>,
}

#[async_trait]
impl AIProvider for OpenAIProvider {
    fn provider_type(&self) -> ProviderType {
        ProviderType::OpenAI
    }

    async fn initialize(&mut self, config: &ProviderConfig) -> Result<(), ProviderError> {
        // 验证 API Key
        Ok(())
    }

    async fn start_session(
        &self,
        message: &str,
        config: &ProviderConfig,
    ) -> Result<SessionHandle, ProviderError> {
        let session_id = uuid::Uuid::new_v4().to_string();

        // 调用 OpenAI API
        let response = self.client
            .post(config.api_endpoint.as_ref().unwrap())
            .header("Authorization", format!("Bearer {}", config.api_key.as_ref().unwrap()))
            .json(&serde_json::json!({
                "model": config.model.as_ref().unwrap_or(&"gpt-4".to_string()),
                "messages": [{"role": "user", "content": message}],
                "stream": true,
            }))
            .send()
            .await?;

        // 处理流式响应，转换为 StandardEvent
        // ...

        Ok(SessionHandle {
            id: session_id,
            provider_type: ProviderType::OpenAI,
            inner: Box::new(OpenAISession {
                id: session_id.clone(),
                messages: vec![],
            }),
        })
    }

    async fn continue_session(
        &self,
        session_id: &str,
        message: &str,
        config: &ProviderConfig,
    ) -> Result<(), ProviderError> {
        // 添加消息到历史并发送
        todo!()
    }

    async fn interrupt_session(&self, session_id: &str) -> Result<(), ProviderError> {
        // 对于 API，取消请求
        todo!()
    }

    fn subscribe_events(
        &self,
        session_id: &str,
        callback: Box<dyn FnMut(StandardEvent) + Send>,
    ) -> Result<(), ProviderError> {
        // OpenAI 使用 SSE，需要订阅器
        todo!()
    }
}
```

---

## 事件标准化

### 事件映射表

| Claude CLI 事件 | 标准事件 | OpenAI 对应 |
|-----------------|----------|-------------|
| `system` + `session_id` | `SessionStart` | 请求开始 |
| `text_delta` | `TextDelta` | SSE `delta` |
| `assistant` | `AssistantMessage` | 完整响应 |
| `tool_start` | `ToolStart` | *OpenAI 无原生支持* |
| `tool_end` | `ToolEnd` | *OpenAI 无原生支持* |
| `session_end` | `SessionEnd` | 请求完成 |
| `error` | `Error` | API 错误 |

### 事件转换器位置

```
┌────────────────────────────────────────────────────────────────┐
│                        事件转换层                               │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  Claude CLI Events    ──→  EventConverter  ──→  StandardEvent │
│  (StreamEvent)             (Rust)             (统一格式)        │
│                                                                │
│  OpenAI SSE Events   ──→  EventConverter  ──→  StandardEvent │
│  (OpenAI格式)              (Rust)             (统一格式)        │
│                                                                │
│  Ollama Events      ──→  EventConverter  ──→  StandardEvent │
│  (Ollama格式)              (Rust)             (统一格式)        │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

## 状态管理解耦

### 前端 Store 改造

**当前代码** (`chatStore.ts`):

```typescript
// 直接处理 Claude 特定事件
handleStreamEvent: (event: StreamEvent) => {
  switch (event.type) {
    case 'text_delta':
      set((state) => ({
        currentContent: state.currentContent + event.text
      }));
      break;
    // ...
  }
}
```

**改造后**:

```typescript
// 处理标准事件
handleStandardEvent: (event: StandardEvent) => {
  switch (event.eventType) {
    case 'textDelta':
      set((state) => ({
        currentContent: state.currentContent + event.text
      }));
      break;

    case 'tokenUsage':
      // 新增: 处理 Token 使用统计
      set((state) => ({
        tokenUsage: {
          promptTokens: event.promptTokens,
          completionTokens: event.completionTokens,
          totalTokens: event.totalTokens,
        }
      }));
      break;

    case 'sessionStart':
      set({
        conversationId: event.sessionId,
        isStreaming: true,
        providerType: event.providerType,  // 新增
      });
      break;

    // ...
  }
}
```

---

## 迁移路径

### Phase 1: 定义接口 (不破坏现有功能)

```
1. 定义 StandardEvent 类型
   └── 新增文件: src-tauri/src/models/standard_events.rs
   └── 新增文件: src/types/standardEvents.ts

2. 定义 Provider Trait
   └── 新增文件: src-tauri/src/providers/mod.rs

3. 前端定义统一接口
   └── 新增文件: src/services/aiProvider.ts
```

### Phase 2: 实现 Claude 适配器

```
1. 重构现有 chat.rs
   └── 提取 ClaudeCliProvider
   └── 实现 Provider Trait

2. 添加事件转换
   └── Claude StreamEvent → StandardEvent

3. 保持向后兼容
   └── 现有 Tauri commands 继续工作
```

### Phase 3: 提供者管理器

```
1. 实现 ProviderManager
   └── 根据配置选择 Provider
   └── 管理活动会话

2. 更新配置结构
   └── 添加 provider_type 字段
   └── 添加各提供者特定配置
```

### Phase 4: 前端适配

```
1. 更新 chatStore
   └── 使用 StandardEvent
   └── 添加 providerType 状态

2. 更新 UI
   └── 显示当前提供者
   └── 提供者切换界面
```

### Phase 5: 添加新提供者

```
1. OpenAI Provider
2. Ollama Provider
3. 自定义 Provider
```

---

## 技术挑战

### 挑战 1: 工具调用语义差异

| 问题 | Claude CLI | OpenAI | 解决方案 |
|------|------------|--------|----------|
| 工具调用格式 | MCP 协议 | Function Calling | 适配器转换 |
| 工具结果反馈 | 自动 | 需要手动调用 | 适配器处理 |
| 工具权限管理 | 内置 | 需要自行实现 | 前端拦截 |

### 挑战 2: 流式响应格式差异

| 提供者 | 流式格式 | 处理方式 |
|--------|----------|----------|
| Claude CLI | NDJSON (`\n` 分隔) | 按行解析 |
| OpenAI | SSE (`data: ` 前缀) | SSE 解析器 |
| Ollama | 纯文本流 | 逐字符处理 |

**解决方案**: 每个适配器实现自己的流解析器

### 挑战 3: 会话管理差异

| 提供者 | 会话机制 | 解决方案 |
|--------|----------|----------|
| Claude CLI | 通过 `--resume` + session_id | 维护 session_id 映射 |
| OpenAI | 客户端维护消息历史 | 适配器存储历史 |
| Ollama | 无会话概念 | 适配器模拟会话 |

### 挑战 4: 错误处理统一

**问题**: 不同提供者的错误格式完全不同

**解决方案**:
```rust
pub enum ProviderError {
    ConfigError(String),
    AuthenticationError(String),
    RateLimitError(String),
    ApiError { code: String, message: String },
    NetworkError(String),
    TimeoutError(String),
    Unknown(String),
}

impl From<reqwest::Error> for ProviderError {
    fn from(err: reqwest::Error) -> Self {
        ProviderError::NetworkError(err.to_string())
    }
}
```

---

## 总结

### 架构优势

| 方面 | 当前架构 | 抽象后架构 |
|------|----------|------------|
| **可扩展性** | 需要修改核心代码 | 添加适配器即可 |
| **可测试性** | 依赖实际 CLI | 可 Mock 接口 |
| **维护性** | Claude 特定逻辑分散 | 隔离在适配器中 |
| **灵活性** | 单一提供者 | 运行时切换 |

### 实现工作量估算

| 阶段 | 工作量 | 说明 |
|------|--------|------|
| Phase 1: 接口定义 | 2-3 天 | 核心 Trait 和类型定义 |
| Phase 2: Claude 适配器 | 3-4 天 | 重构现有代码 |
| Phase 3: 提供者管理器 | 2-3 天 | 配置和选择逻辑 |
| Phase 4: 前端适配 | 2-3 天 | Store 和 UI 更新 |
| Phase 5: 新提供者 | 各 2-3 天 | OpenAI, Ollama 等 |
| **总计** | **11-16 天** | 取决于提供者数量 |

### 风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 破坏现有功能 | 高 | 保持向后兼容，渐进式迁移 |
| 适配器复杂度高 | 中 | 优先实现核心功能 |
| 性能开销 | 低 | 零成本抽象 (Rust) |

---

> 文档版本: v1.0
> 最后更新: 2026-01-11
> 作者: Polaris Team
