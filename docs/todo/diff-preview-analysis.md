# Polaris Diff 预览功能实现方案分析

本文档详细分析 Diff 预览功能的实现方案，不涉及具体代码实现。

---

## 目录

- [功能需求分析](#功能需求分析)
- [现有架构分析](#现有架构分析)
- [数据流向分析](#数据流向分析)
- [技术方案选型](#技术方案选型)
- [组件架构设计](#组件架构设计)
- [状态管理设计](#状态管理设计)
- [集成点分析](#集成点分析)
- [关键技术挑战](#关键技术挑战)
- [性能考虑](#性能考虑)
- [实现步骤规划](#实现步骤规划)

---

## 功能需求分析

### 核心功能

Diff 预览功能需要展示 AI 修改文件前后的差异，主要包括：

| 功能 | 描述 | 优先级 |
|------|------|--------|
| **差异可视化** | 以高亮方式显示新增、删除、修改的内容 | P0 |
| **视图模式切换** | 支持 inline（内联）和 split（分栏）两种视图 | P1 |
| **导航功能** | 支持上一个/下一个差异块跳转 | P1 |
| **文件对比** | 支持选择特定版本的文件进行对比 | P2 |
| **导出 diff** | 支持 unified diff 格式导出 | P2 |

### 使用场景

1. **AI 修改文件后预览**: 当 Claude 使用 Edit 工具修改文件后，用户可以在工具面板中查看具体修改
2. **手动对比**: 用户选择两个文件版本进行对比
3. **变更审查**: 审查一批文件修改，决定是否应用

---

## 现有架构分析

### 相关文件结构

```
src/
├── components/
│   ├── ToolPanel/
│   │   ├── ToolPanel.tsx          # 工具面板主容器
│   │   ├── ToolList.tsx           # 工具列表
│   │   └── ToolDetail.tsx         # 工具详情（当前显示 input/output）
│   └── Editor/
│       ├── Editor.tsx             # CodeMirror 编辑器
│       └── EditorPanel.tsx        # 编辑器面板
├── stores/
│   └── toolPanelStore.ts          # 工具面板状态管理
├── types/
│   └── chat.ts                    # ToolCall 类型定义
└── services/
    └── tauri.ts                   # Tauri API 调用
```

### 当前工具调用流程

```
┌─────────────────────────────────────────────────────────────────────┐
│                      当前工具调用流程                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Claude CLI                                                        │
│      │                                                             │
│      ├── tool_start 事件 ──→ toolPanelStore.addTool()              │
│      │                            │                               │
│      │                            ▼                               │
│      │                       显示在 ToolList                      │
│      │                            │                               │
│      ├── tool_result 事件 ──→ toolPanelStore.updateTool()          │
│      │                            │                               │
│      │                            ▼                               │
│      │                       更新状态为 completed                  │
│      │                            │                               │
│      └── 用户点击工具 ──→ 显示 ToolDetail (input/output)            │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### ToolCall 类型定义

当前 `ToolCall` 类型（`src/types/chat.ts:12-20`）：

```typescript
export interface ToolCall {
  id: string;
  name: string;
  status: ToolStatus;
  input?: Record<string, unknown>;   // 工具输入参数
  output?: string;                    // 工具输出结果
  startedAt: string;
  completedAt?: string;
}
```

**关键观察**: 当前 `output` 是 `string` 类型，对于 Edit 工具，输出内容可能包含：
- 修改后的文件内容
- 错误信息
- 或者只是 "成功/失败" 状态

---

## 数据流向分析

### Edit 工具的输入输出

**典型 Edit 工具调用**：

```typescript
// input
{
  "path": "src/App.tsx",
  "oldContent": "...原始内容...",
  "newContent": "...修改后内容...",
  "diff": " unified diff 格式..."
}

// output
"成功修改文件 src/App.tsx"
// 或包含错误信息
```

**数据获取点**:

| 数据 | 来源 | 获取方式 |
|------|------|----------|
| 文件路径 | `tool.input.path` | 直接获取 |
| 原始内容 | `tool.input.oldContent` 或从文件读取 | 需要处理 |
| 修改后内容 | `tool.input.newContent` 或从文件读取 | 需要处理 |
| Diff 数据 | `tool.input.diff` 或自行计算 | 核心需求 |

### Diff 数据来源分析

**方案 A: CLI 提供 diff**

```
优点: 准确、性能好
缺点: 依赖 CLI 输出格式，可能不可靠
```

**方案 B: 前端自行计算 diff**

```
优点: 可控、不依赖 CLI 格式
缺点: 需要引入 diff 库
```

**方案 C: 后端计算 diff (Rust)**

```
优点: 性能最好、可处理大文件
缺点: 需要修改后端代码
```

---

## 技术方案选型

### Diff 渲染库对比

| 库 | 维护状态 | 包大小 | 功能 | 推荐度 |
|----|----------|--------|------|--------|
| **react-diff-viewer-continued** | ✅ 活跃 | ~80KB | 丰富，支持高亮、分割视图 | ⭐⭐⭐⭐⭐ |
| **react-diff-viewer** | ⚠️ 停滞 | ~70KB | 基础功能 | ⭐⭐⭐ |
| **monaco-editor** (内置 diff) | ✅ 活跃 | ~2MB | 完整编辑器功能 | ⭐⭐⭐⭐ |
| **CodeMirror diff 扩展** | ✅ 活跃 | ~100KB | 与现有编辑器一致 | ⭐⭐⭐⭐ |
| **自研** | - | - | 完全可控 | ⭐⭐ |

### 推荐方案: react-diff-viewer-continued

**理由**:
1. 专门为 diff 渲染设计，开箱即用
2. 支持 inline 和 split 两种视图模式
3. 语法高亮支持（通过插件）
4. 与 CodeMirror 风格可以统一
5. 包大小适中 (~80KB gzipped)

**备选方案**: CodeMirror diff 扩展
- 如果项目追求轻量和一致性，可以使用 CodeMirror 的 diff 扩展
- 与现有编辑器组件技术栈一致

### Diff 计算库

如果需要前端计算 diff，可选库：

| 库 | 包大小 | 特点 |
|----|--------|------|
| **diff** | ~15KB | 简单、轻量 |
| **jsdiff** | ~25KB | 功能丰富，支持多种 diff 类型 |
| **microdiff** | ~1KB | 极简，仅字符级 diff |

---

## 组件架构设计

### 新增组件结构

```
src/components/Diff/
├── DiffViewer.tsx           # Diff 查看器主组件
├── DiffViewerToolbar.tsx    # 工具栏（切换视图、导航等）
├── DiffInline.tsx           # Inline 视图组件
├── DiffSplit.tsx            # Split 视图组件
└── DiffHunk.tsx             # 单个差异块组件
```

### 组件集成方案

**方案 A: 集成到 ToolDetail**

```
ToolDetail.tsx
├── 现有内容（状态信息、输入参数、输出结果）
└── 新增: 当 tool.name === 'write' 或 'edit' 时显示 DiffViewer
```

**方案 B: 独立的 Diff 面板**

```
ToolPanel.tsx
├── ToolList (现有)
├── ToolDetail (现有)
└── DiffPanel (新增) - 显示选中工具的 diff
```

**推荐**: 方案 A，优先集成到 ToolDetail，后续可扩展为独立面板

---

## 状态管理设计

### 扩展 toolPanelStore

需要在 `toolPanelStore.ts` 中添加：

```typescript
interface ToolPanelState {
  // ... 现有字段

  /** Diff 相关状态 */
  diffMode: 'inline' | 'split';           // 当前 diff 视图模式
  selectedDiffToolId: string | null;      // 当前查看 diff 的工具 ID
}

interface ToolPanelActions {
  // ... 现有方法

  /** 设置 diff 模式 */
  setDiffMode: (mode: 'inline' | 'split') => void;
  /** 打开 diff 面板 */
  openDiff: (toolId: string) => void;
  /** 关闭 diff 面板 */
  closeDiff: () => void;
}
```

### 扩展 ToolCall 类型

```typescript
// 在 types/chat.ts 中扩展
export interface ToolCall {
  // ... 现有字段

  /** Diff 数据（可选，用于 Edit 工具） */
  diffData?: {
    oldContent: string;
    newContent: string;
    filePath: string;
    unifiedDiff?: string;
  };
}
```

---

## 集成点分析

### 集成点 1: 工具列表添加图标

```
ToolList.tsx
├── 遍历 tools
├── 对 Edit/Write 工具显示特殊图标
└── 点击时可选择"查看详情"或"查看 Diff"
```

### 集成点 2: ToolDetail 添加 Diff 标签页

```
ToolDetail.tsx
├── 头部（工具名称、状态）
├── 内容区
│   ├── [状态信息] - 现有
│   ├── [输入参数] - 现有
│   ├── [输出结果] - 现有
│   └── [Diff 预览] - 新增，条件渲染
│       ├── DiffViewerToolbar
│       └── DiffViewer (inline/split)
```

### 集成点 3: StreamEvent 处理

```
chatStore.ts - handleStreamEvent()
├── tool_start: 检测是否为 Edit 工具
├──           └── 如果是，记录初始状态
├── tool_result: 解析输出
│              └── 如果包含 diff 信息，存储到 diffData
└── session_end: 清理临时数据
```

---

## 关键技术挑战

### 挑战 1: Diff 数据获取

**问题**: Edit 工具的 output 可能不包含完整的 diff 信息

**解决方案**:
1. 首先尝试从 `tool.input` 获取 `oldContent` 和 `newContent`
2. 如果没有，通过 Tauri API 读取文件当前内容作为 `newContent`
3. 使用 diff 库计算差异

```typescript
// 伪代码
async function getDiffData(tool: ToolCall) {
  const oldContent = tool.input?.oldContent;
  const newContent = tool.input?.newContent;

  if (oldContent && newContent) {
    return computeDiff(oldContent, newContent);
  }

  // 回退方案: 读取文件
  const filePath = tool.input?.path;
  if (filePath) {
    const current = await readFile(filePath);
    const previous = await getFileVersion(filePath, tool.startedAt);
    return computeDiff(previous, current);
  }
}
```

### 挑战 2: 大文件处理

**问题**: 大文件的 diff 渲染可能导致性能问题

**解决方案**:
1. 限制显示的行数（如最多 1000 行）
2. 使用虚拟滚动
3. 分页加载差异块
4. 显示统计信息（"共 500 处差异，显示前 100 处"）

### 挑战 3: 文件编码问题

**问题**: 某些文件可能使用特殊编码

**解决方案**:
1. 尝试 UTF-8 解码
2. 失败时尝试检测编码（使用 `chardet` 库）
3. 二进制文件显示提示而非内容

### 挑战 4: 语法高亮

**问题**: Diff 内容需要语法高亮

**解决方案**:
1. `react-diff-viewer-continued` 内置基础高亮
2. 可集成 `react-syntax-highlighter` 增强效果
3. 根据文件扩展名选择语言

---

## 性能考虑

### 渲染性能

| 操作 | 性能考虑 | 优化方案 |
|------|----------|----------|
| Diff 计算 | O(N) 复杂度 | Web Worker 计算 |
| 大文件渲染 | 大量 DOM 节点 | 虚拟滚动 |
| 频繁切换 | 重复计算 | 缓存 diff 结果 |

### 内存考虑

```
估算内存占用:
- 小文件 (<10KB): ~50KB
- 中等文件 (10-100KB): ~200KB
- 大文件 (100KB-1MB): ~2MB

建议: 对 >500KB 的文件显示警告
```

---

## 实现步骤规划

### Phase 1: 基础功能 (P0)

```
Step 1: 安装依赖
├── npm install react-diff-viewer-continued
└── npm install diff

Step 2: 创建基础组件
├── DiffViewer.tsx - 封装 react-diff-viewer-continued
└── DiffViewerToolbar.tsx - 基础工具栏

Step 3: 扩展类型定义
└── types/chat.ts - 添加 DiffData 类型

Step 4: 集成到 ToolDetail
├── 检测 Edit/Write 工具
├── 条件渲染 DiffViewer
└── 处理无 diff 数据的降级

Step 5: 数据获取
└── services/diffService.ts - diff 数据获取和计算
```

### Phase 2: 增强功能 (P1)

```
Step 6: 视图模式切换
├── inline/split 切换
└── 状态持久化

Step 7: 导航功能
├── 上一个/下一个差异块
└── 差异统计显示

Step 8: 语法高亮
└── 集成语言检测和高亮
```

### Phase 3: 高级功能 (P2)

```
Step 9: 多文件对比
├── 文件选择器
└── 批量 diff 视图

Step 10: 导出功能
├── 导出 unified diff
└── 导出 HTML 报告

Step 11: 性能优化
├── Web Worker 计算
└── 虚拟滚动
```

---

## 总结

### 技术选型总结

| 决策点 | 选择 | 理由 |
|--------|------|------|
| Diff 渲染库 | react-diff-viewer-continued | 功能完整、维护活跃 |
| Diff 计算库 | diff (computeLine) | 轻量、满足需求 |
| 集成方式 | ToolDetail 内嵌入 | 复用现有 UI 结构 |
| 状态管理 | 扩展 toolPanelStore | 与现有架构一致 |

### 开发工作量估算

| 阶段 | 工作量 | 说明 |
|------|--------|------|
| Phase 1 | 2-3 天 | 基础 diff 显示 |
| Phase 2 | 1-2 天 | 视图切换、导航 |
| Phase 3 | 2-3 天 | 性能优化、导出 |
| **总计** | **5-8 天** | 取决于复杂度 |

### 风险与依赖

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| CLI 输出格式变化 | diff 数据获取失败 | 实现多套获取策略 |
| 大文件性能 | UI 卡顿 | 限制文件大小、虚拟滚动 |
| 编码问题 | 显示乱码 | 编码检测、降级处理 |

---

> 文档版本: v1.0
> 最后更新: 2026-01-11
> 作者: Polaris Team
