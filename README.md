# Claude Code Pro

> Claude Code CLI 的可视化桌面客户端

## 简介

[Claude Code](https://claude.ai/code) 是 Anthropic 官方推出的 AI 辅助编程命令行工具。**Claude Code Pro** 是其第三方可视化 GUI 封装，提供了更友好的图形界面，让你无需命令行也能享受 Claude AI 带来的编程体验。

### 核心功能

- **AI 对话** - 与 Claude AI 实时对话，支持流式响应
- **工作区管理** - 创建和切换多个代码工作区
- **文件浏览** - 可视化文件树，快速定位文件
- **代码编辑** - 内置 CodeMirror 6 编辑器，支持多语言语法高亮
- **工具调用可视化** - 实时展示 AI 调用的工具和操作
- **文件搜索** - 快速搜索工作区内的文件

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 19 + TypeScript + Vite |
| 样式 | Tailwind CSS |
| 状态管理 | Zustand |
| 代码编辑 | CodeMirror 6 |
| 桌面框架 | Tauri 2.x (Rust) |

## 环境要求

- **Node.js** >= 18
- **Rust** >= 1.70
- **Claude Code CLI** - 需要在设置中配置路径

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 启动开发模式

```bash
npm run tauri dev
```

### 3. 构建

```bash
# 构建前端
npm run build

# 构建 Tauri 应用
npm run tauri build
```

### 4. 其他命令

```bash
npm run dev          # 仅启动前端开发服务器
npm run preview      # 预览生产构建
```

## 项目结构

```
src/
├── components/          # React 组件
│   ├── Chat/           # AI 对话相关
│   ├── Editor/         # 代码编辑器
│   ├── FileExplorer/   # 文件浏览器
│   ├── ToolPanel/      # 工具调用面板
│   ├── Workspace/      # 工作区管理
│   ├── Settings/       # 设置页面
│   └── Common/         # 通用组件
├── hooks/              # 自定义 Hooks
├── stores/             # Zustand 状态管理
├── services/           # Tauri API 封装
├── types/              # TypeScript 类型定义
├── utils/              # 工具函数
├── App.tsx             # 主应用
└── main.tsx            # 入口文件
```

## 推荐 IDE

[VS Code](https://code.visualstudio.com/) + 以下扩展：

- [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode)
- [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## 许可证

MIT

---

> 注意：本项目是非官方的第三方客户端，与 Anthropic 无关。使用前请确保已安装并配置 Claude Code CLI。
