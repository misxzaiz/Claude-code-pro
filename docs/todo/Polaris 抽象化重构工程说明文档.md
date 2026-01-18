# 📄 Polaris 抽象化重构工程说明文档

## 1. 重构目标（非常重要）

当前项目将 **Claude Code CLI** 作为核心实现直接使用，
本次重构的目标是：

> **将 Claude Code 抽象为一个 AI Engine 的实现（Adapter），
> 项目核心升级为一个通用的 AI Code Runtime。**

### 重构完成后必须满足：

* Claude Code 只是 **AI Engine 的一个实现**
* UI / Task / 日志 / Tool 面板 **不直接依赖 Claude**
* 后续可以无痛接入其他 AI（如 OpenAI / 本地 LLM）

---

## 2. 当前问题分析（Claude 请重点理解）

### 当前存在的问题：

1. Claude CLI 输出被 UI 直接消费（强耦合）
2. 不存在统一的 Task / Session 抽象
3. Claude 的 stdout = UI 的"事实来源"
4. 无法扩展到多 AI Engine

### 本次重构 **不解决 UI 美化、不调 Prompt**

仅做 **架构抽象与工程重构**。

---

## 3. 新架构总览（目标形态）

```text
src/
 ├── ai-runtime/          # 新增：AI 抽象运行时（核心）
 │    ├── engine.ts
 │    ├── session.ts
 │    ├── task.ts
 │    ├── event.ts
 │    └── index.ts
 │
 ├── engines/             # 各 AI 实现（Adapter）
 │    └── claude-code/
 │         ├── engine.ts
 │         ├── session.ts
 │         ├── event-parser.ts
 │         └── index.ts
 │
 ├── core/                # 现有核心逻辑（逐步迁移）
 ├── ui/                  # UI 层（最小改动）
```

---

## 4. AI Runtime 抽象定义（必须严格遵守）

### 4.1 AITask（通用任务模型）

```ts
// src/ai-runtime/task.ts
export interface AITask {
  id: string
  kind: 'chat' | 'refactor' | 'analyze' | 'generate'
  input: {
    prompt: string
    files?: string[]
    extra?: Record<string, any>
  }
}
```

⚠️ **禁止在 Task 中出现 Claude / CLI / Tool 名称**

---

### 4.2 AIEvent（二次分析后的事件模型）

```ts
// src/ai-runtime/event.ts
export type AIEvent =
  | { type: 'token'; value: string }
  | { type: 'tool_call'; tool: string; args: any }
  | { type: 'progress'; message?: string }
  | { type: 'result'; output: any }
  | { type: 'error'; error: string }
```

说明：

* UI、日志、工具面板 **只能消费 AIEvent**
* CLI 原始文本 **禁止直通 UI**

---

### 4.3 AISession（核心执行单元）

```ts
// src/ai-runtime/session.ts
import { AITask } from './task'
import { AIEvent } from './event'

export interface AISession {
  id: string
  run(task: AITask): AsyncIterable<AIEvent>
  abort(taskId: string): void
  dispose(): void
}
```

---

### 4.4 AIEngine（顶层能力入口）

```ts
// src/ai-runtime/engine.ts
import { AISession } from './session'

export interface AIEngine {
  id: string
  createSession(): AISession
  capabilities(): string[]
}
```

---

## 5. Claude Code Adapter 实现要求

### Claude Code **只能存在于 engines/claude-code/**

#### ClaudeCodeEngine

```ts
implements AIEngine
```

#### ClaudeCodeSession

```ts
implements AISession
```

其职责 **仅限于**：

1. 启动 Claude Code CLI
2. 将 stdout/stderr 解析为 AIEvent
3. 处理 abort（Ctrl+C）
4. 管理进程生命周期

---

## 6. 二次分析（Event Parser）规范

### Claude CLI 原始输出（示例）：

```text
Calling tool: read_file
Sure, here's the refactored code:
```

### 必须解析为：

```ts
{ type: 'tool_call', tool: 'read_file', args: {} }
{ type: 'token', value: 'Sure, here...' }
```

#### 禁止行为：

* UI 直接展示 CLI 原始日志
* UI 解析字符串判断状态

---

## 7. UI 改造约束（最小侵入）

### UI 层改造规则：

* UI **不 import claude 相关模块**
* UI 只通过：

```ts
AIEngine → AISession → AIEvent
```

### Chat 功能处理方式：

* Chat = kind 为 `chat` 的 AITask
* 原 Chat 输出改为订阅 AIEvent 流

---

## 8. 重构执行顺序（Claude 请严格按此步骤）

### Step 1

创建 `src/ai-runtime` 抽象模块（不动旧代码）

### Step 2

实现 `engines/claude-code`，让 Claude Code 实现 AIEngine

### Step 3

将现有 Claude CLI 调用逻辑迁移到 ClaudeCodeSession

### Step 4

用 AIEvent 替换 UI 中直接使用 stdout 的地方

### Step 5

删除 UI / Core 中对 Claude CLI 的直接依赖

---

## 9. 重构完成验收标准（必须全部满足）

* ✅ 项目中不存在 `Claude` 字样出现在 UI 层
* ✅ UI 不关心 CLI、命令、进程
* ✅ Claude Code 可以被整体替换而不影响 UI
* ✅ 所有 AI 输出都以 `AIEvent` 形式流转

---

## 10. 本次重构不包含（刻意排除）

* ❌ Diff / Patch
* ❌ Prompt 优化
* ❌ 多模型切换 UI
* ❌ 自动化任务

---

## 11. 最终目标一句话

> **Polaris 从 "Claude 的 GUI"
> 升级为 "可插拔 AI Code Runtime 平台"**

---