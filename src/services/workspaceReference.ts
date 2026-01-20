/**
 * 工作区引用服务 - 处理 @workspace:path 语法
 *
 * 语法说明：
 * - @workspace:path  → 引用指定工作区的文件（如 @utils:src/Button.tsx）
 * - @/path            → 引用当前工作区的文件（如 @/src/App.tsx）
 *
 * 参考 Cline 的 workspace:path 语法
 */

import type { Workspace, WorkspaceReference, ParsedWorkspaceMessage } from '../types';

/**
 * 匹配 @workspace:path 格式
 * 支持中文、数字、字母、下划线、连字符
 *
 * 分组1: workspace-name（可选，如果未指定则使用当前工作区）
 * 分组2: 相对路径
 */
const WORKSPACE_REF_PATTERN = /@(?:([\w\u4e00-\u9fa5-]+):)?([^\s]+)/g;

/**
 * 解析消息中的工作区引用
 *
 * @example
 * // 引用其他工作区
 * parseWorkspaceReferences("参考 @utils/src/Button.tsx", ...)
 * // → processedMessage: "参考 @/abs/path/utils/src/Button.tsx"
 *
 * @example
 * // 引用当前工作区
 * parseWorkspaceReferences("查看 @/src/App.tsx", ...)
 * // → processedMessage: "查看 @/current/path/src/App.tsx"
 */
export function parseWorkspaceReferences(
  message: string,
  workspaces: Workspace[],
  contextWorkspaces: Workspace[],
  currentWorkspaceId: string | null
): ParsedWorkspaceMessage {
  const references: WorkspaceReference[] = [];
  let processed = message;

  // 获取当前工作区
  const currentWorkspace = workspaces.find(w => w.id === currentWorkspaceId);

  // 预构建名称索引，O(1) 查找
  const workspaceByName = new Map<string, Workspace>();
  for (const w of workspaces) {
    workspaceByName.set(w.name.toLowerCase(), w);
  }

  // 存储匹配结果和位置，避免正则 lastIndex 问题
  const matches: Array<{
    fullMatch: string;
    workspaceName: string | null;  // null 表示当前工作区
    relativePath: string;
    startIndex: number;
    endIndex: number;
  }> = [];

  // 重置正则索引
  WORKSPACE_REF_PATTERN.lastIndex = 0;

  // 收集所有匹配
  let match: RegExpExecArray | null;
  while ((match = WORKSPACE_REF_PATTERN.exec(message)) !== null) {
    const fullMatch = match[0];
    const workspaceName = match[1] || null;  // 未指定工作区名
    const relativePath = match[2];

    // 过滤掉明显不是路径的匹配（如邮箱地址）
    if (relativePath.includes('.') || relativePath.includes('/') || relativePath.includes('\\')) {
      matches.push({
        fullMatch,
        workspaceName,
        relativePath,
        startIndex: match.index,
        endIndex: match.index + fullMatch.length,
      });
    }
  }

  // 从后往前替换，避免索引变化
  for (let i = matches.length - 1; i >= 0; i--) {
    const { fullMatch, workspaceName, relativePath, startIndex, endIndex } = matches[i];

    let workspace: Workspace | undefined;
    let actualWorkspaceName: string;

    if (workspaceName) {
      // 指定了工作区名
      workspace = workspaceByName.get(workspaceName.toLowerCase());
      actualWorkspaceName = workspaceName;
    } else {
      // 未指定工作区名，使用当前工作区
      workspace = currentWorkspace;
      actualWorkspaceName = currentWorkspace?.name || '当前工作区';
    }

    if (workspace) {
      // 使用平台特定的路径分隔符
      const pathSeparator = workspace.path.includes('\\') ? '\\' : '/';
      const absolutePath = workspace.path + pathSeparator + relativePath;

      references.unshift({
        workspaceName: actualWorkspaceName,
        workspacePath: workspace.path,
        relativePath,
        absolutePath,
        originalText: fullMatch,
      });

      // 替换为绝对路径引用
      processed = processed.substring(0, startIndex) +
                 `@${absolutePath}` +
                 processed.substring(endIndex);
    }
  }

  // 生成上下文头
  const contextHeader = generateContextHeader(references, contextWorkspaces, workspaces, currentWorkspaceId);

  return {
    processedMessage: processed,
    references,
    contextHeader,
  };
}

/**
 * 生成工作区信息头
 */
function generateContextHeader(
  references: WorkspaceReference[],
  contextWorkspaces: Workspace[],
  allWorkspaces: Workspace[],
  currentWorkspaceId: string | null
): string {
  if (references.length === 0 && contextWorkspaces.length === 0) {
    return '';
  }

  const currentWorkspace = allWorkspaces.find(w => w.id === currentWorkspaceId);

  let header = '\n';
  header += '═══════════════════════════════════════════════════════════\n';
  header += '                        工作区信息\n';
  header += '═══════════════════════════════════════════════════════════\n';
  header += `当前工作区: ${currentWorkspace?.name || '未设置'}\n`;
  if (currentWorkspace) {
    header += `  路径: ${currentWorkspace.path}\n`;
    header += `  引用语法: @/path\n`;
  }

  if (contextWorkspaces.length > 0) {
    header += '\n关联工作区:\n';
    contextWorkspaces.forEach(w => {
      header += `  • ${w.name}\n`;
      header += `    路径: ${w.path}\n`;
      header += `    引用语法: @${w.name}:path\n`;
    });
  }

  if (references.length > 0) {
    const referencedWorkspaces = new Set(references.map(r => r.workspaceName));
    header += '\n本次引用的工作区:\n';
    referencedWorkspaces.forEach(name => {
      header += `  • ${name}\n`;
    });
  }

  header += '═══════════════════════════════════════════════════════════\n';

  return header;
}

/**
 * 从工作区名获取工作区
 */
export function getWorkspaceByName(name: string, workspaces: Workspace[]): Workspace | undefined {
  return workspaces.find(w => w.name.toLowerCase() === name.toLowerCase());
}

/**
 * 验证工作区引用格式
 */
export function isValidWorkspaceReference(text: string): boolean {
  return /^@[\w\u4e00-\u9fa5-]+:/.test(text);
}

/**
 * 构建工作区上下文（结构化格式，用于 AITask.extra）
 *
 * @param workspaces 所有工作区列表
 * @param contextWorkspaces 关联工作区列表
 * @param currentWorkspaceId 当前工作区 ID
 * @returns 工作区上下文对象
 */
export function buildWorkspaceContextExtra(
  workspaces: Workspace[],
  contextWorkspaces: Workspace[],
  currentWorkspaceId: string | null
): { currentWorkspace: { name: string; path: string }; contextWorkspaces: Array<{ name: string; path: string }> } | null {
  const currentWorkspace = workspaces.find(w => w.id === currentWorkspaceId);

  if (!currentWorkspace) {
    return null;
  }

  return {
    currentWorkspace: {
      name: currentWorkspace.name,
      path: currentWorkspace.path,
    },
    contextWorkspaces: contextWorkspaces.map(w => ({
      name: w.name,
      path: w.path,
    })),
  };
}
