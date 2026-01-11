# 代码优化清单

本文档记录了代码审查中发现的可优化项，按优先级分类。

---

## 🔴 高优先级 - 安全相关

### 1. 添加输入长度限制

**问题**: 聊天输入框没有长度限制，可能导致超长输入引发问题

**位置**: `src/components/Chat/ChatInput.tsx:416-418`

**当前代码**:
```typescript
const handleSend = useCallback(() => {
  const trimmed = value.trim();
  if (!trimmed || disabled || isStreaming) return;
  // ...
```

**修改方案**:
```typescript
// 在文件顶部添加常量
const MAX_INPUT_LENGTH = 50000;

const handleSend = useCallback(() => {
  const trimmed = value.trim();
  if (!trimmed || disabled || isStreaming) return;

  // 添加长度检查
  if (trimmed.length > MAX_INPUT_LENGTH) {
    console.warn(`输入长度超过限制 ${MAX_INPUT_LENGTH}`);
    return;
  }
  // ...
```

**风险**: 低 | **影响**: 防御性编程

---

### 2. 路径验证加强

**问题**: 工作区引用解析时缺少路径遍历攻击防护

**位置**: `src/services/workspaceReference.ts:104`

**当前代码**:
```typescript
const absolutePath = workspace.path + pathSeparator + relativePath;
```

**修改方案**:
```typescript
// 添加路径安全检查
import { resolve, normalize } from 'path';

function safeJoin(base: string, relative: string): string | null {
  const resolved = resolve(base, relative);
  const normalized = normalize(resolved);
  const normalizedBase = normalize(base);

  // 检查解析后的路径是否在基础路径内
  if (!normalized.startsWith(normalizedBase)) {
    console.warn('路径遍历检测:', relative);
    return null;
  }
  return normalized;
}
```

**风险**: 中 | **影响**: 安全性

---

## 🟡 中优先级 - 代码质量

### 3. 移除未使用的依赖

**问题**: 安装了但未使用的依赖包

**位置**: `package.json`

**未使用依赖**:
```json
{
  "react-markdown": "^10.1.0",    // 未使用
  "rehype-highlight": "^7.0.2",   // 未使用（react-markdown 插件）
  "remark-gfm": "^4.0.1"          // 未使用（react-markdown 插件）
}
```

**清理命令**:
```bash
npm uninstall react-markdown rehype-highlight remark-gfm
```

**效果**: 减少约 200KB node_modules 体积

**风险**: 无 | **影响**: 减小包体积

---

### 4. 改进 cache.ts 类型定义

**问题**: 使用 `any[]` 类型，降低类型安全

**位置**: `src/utils/cache.ts:231-232`

**当前代码**:
```typescript
export const fileSearchCache = new AsyncCache<any[]>(5000);
export const commandCache = new SyncCache<any[]>(10000);
```

**修改方案**:
```typescript
import type { FileMatch } from '../services/fileSearch';
import type { Command } from '../types/command';

export const fileSearchCache = new AsyncCache<FileMatch[]>(5000);
export const commandCache = new SyncCache<Command[]>(10000);
```

**风险**: 低 | **影响**: 提高类型安全

---

### 5. 改进 useDebounce 类型定义

**问题**: 使用 `any[]` 作为参数类型约束

**位置**: `src/hooks/useDebounce.ts:23, 35`

**当前代码**:
```typescript
export function useDebouncedCallback<T extends (...args: any[]) => any>(
  callback: T,
  delay: number
): T {
  // ...
  return ((...args: any[]) => {
```

**修改方案**:
```typescript
// 使用 Parameters 工具类型推断参数
export function useDebouncedCallback<T extends (...args: any[]) => any>(
  callback: T,
  delay: number
): (...args: Parameters<T>) => void {
  // ...
  return ((...args: Parameters<T>) => {
```

**风险**: 低 | **影响**: 提高类型推断准确性

---

### 6. 定义 Usage 类型

**问题**: AssistantMessage.usage 使用 unknown 类型

**位置**: `src/types/chat.ts:70`

**当前代码**:
```typescript
interface AssistantMessage {
  // ...
  usage?: unknown;
}
```

**修改方案**:
```typescript
interface Usage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

interface AssistantMessage {
  // ...
  usage?: Usage;
}
```

**风险**: 低 | **影响**: 提高类型安全

---

### 7. 抽取 Editor 重复代码

**问题**: 编辑器扩展配置代码重复

**位置**: `src/components/Editor/Editor.tsx:151-177, 207-234`

**修改方案**: 抽取为公共函数
```typescript
function createEditorExtensions(
  language: string,
  readOnly: boolean,
  onSave?: () => void
) {
  return [
    darkTheme,
    highlightSpecialChars(),
    // ... 公共扩展配置
  ];
}
```

**风险**: 中 | **影响**: 提高可维护性

---

### 8. 清理未使用的导出

**问题**: commandCache 导出但从未使用

**位置**: `src/utils/cache.ts:232`

**当前状态**:
```typescript
export const commandCache = new SyncCache<any[]>(10000);
```

**检查结果**: 全项目搜索无引用

**修改方案**: 移除该行或添加 `// eslint-disable-next-line` 注释说明预留

**风险**: 无 | **影响**: 代码清洁

---

## 🟢 低优先级 - 规范性

### 9. 添加 ESLint 配置

**当前状态**: 无 ESLint 配置

**建议**: 添加代码检查工具

**安装**:
```bash
npm install -D eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin eslint-plugin-react-hooks
```

**配置**: `.eslintrc.cjs`
```javascript
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'react-hooks'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  rules: {
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
  },
};
```

---

### 10. 添加 Prettier 配置

**当前状态**: 无 Prettier 配置

**建议**: 添加代码格式化工具

**安装**:
```bash
npm install -D prettier
```

**配置**: `.prettierrc`
```json
{
  "semi": false,
  "singleQuote": true,
  "trailingComma": "es5",
  "printWidth": 100
}
```

---

### 11. 添加单元测试

**当前状态**: 无测试文件

**建议**: 使用 Vitest 添加测试

**安装**:
```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom
```

**测试目标**:
- `src/stores/*` - Zustand store 测试
- `src/hooks/useDebounce.ts` - 钩子测试
- `src/services/commandService.ts` - 服务测试

**配置**: `vitest.config.ts`
```typescript
export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
  },
});
```

---

### 12. 统一错误处理

**问题**: 错误处理分散在各处，风格不统一

**建议**: 创建统一错误处理机制

**实现**:
```typescript
// src/services/errorHandler.ts
export class AppError extends Error {
  constructor(
    public code: string,
    public message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function handleError(error: unknown): void {
  if (error instanceof AppError) {
    // 统一处理
  }
}
```

---

### 13. 添加全局错误边界

**当前状态**: 有 ErrorBoundary 组件但未在 App.tsx 使用

**建议**: 在应用根组件添加错误边界

**位置**: `src/App.tsx`

---

## 📊 优化统计

| 类别 | 项目数 |
|------|--------|
| 高优先级 (安全) | 2 |
| 中优先级 (代码质量) | 6 |
| 低优先级 (规范性) | 5 |
| **合计** | **13** |

---

## 执行建议

1. **第一阶段**: 执行高优先级项目（安全相关）
2. **第二阶段**: 执行中优先级项目（代码质量）
3. **第三阶段**: 执行低优先级项目（规范性）

---

> 最后更新: 2026-01-11
