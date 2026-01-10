/**
 * 工作区引用服务 - 处理 @workspace/path 语法
 */

import type { Workspace, WorkspaceReference, ParsedWorkspaceMessage } from '../types';

/**
 * 匹配 @workspace-name/path 或 @workspace-name:path 格式
 * 支持中文、数字、字母、下划线、连字符
 */
const WORKSPACE_REF_PATTERN = /@([\w\u4e00-\u9fa5-]+)[:/]([^\s]+)/g;

/**
 * 解析消息中的工作区引用
 *
 * @example
 * parseWorkspaceReferences("参考 @utils/src/Button.tsx", workspaces, [], currentWorkspaceId)
 * // 返回: { processedMessage: "参考 @/abs/path/utils/src/Button.tsx", references: [...], contextHeader: "" }
 */
export function parseWorkspaceReferences(
  message: string,
  workspaces: Workspace[],
  contextWorkspaces: Workspace[],
  currentWorkspaceId: string | null
): ParsedWorkspaceMessage {
  const references: WorkspaceReference[] = [];
  let processed = message;

  // 预构建名称索引，O(1) 查找
  const workspaceByName = new Map<string, Workspace>();
  for (const w of workspaces) {
    workspaceByName.set(w.name.toLowerCase(), w);
  }

  // 存储匹配结果和位置，避免正则 lastIndex 问题
  const matches: Array<{
    fullMatch: string;
    workspaceName: string;
    relativePath: string;
    startIndex: number;
    endIndex: number;
  }> = [];

  // 收集所有匹配
  let match: RegExpExecArray | null;
  while ((match = WORKSPACE_REF_PATTERN.exec(message)) !== null) {
    matches.push({
      fullMatch: match[0],
      workspaceName: match[1],
      relativePath: match[2],
      startIndex: match.index,
      endIndex: match.index + match[0].length,
    });
  }

  // 从后往前替换，避免索引变化
  for (let i = matches.length - 1; i >= 0; i--) {
    const { fullMatch, workspaceName, relativePath, startIndex, endIndex } = matches[i];

    // 使用预构建的 Map 查找工作区（忽略大小写）
    const workspace = workspaceByName.get(workspaceName.toLowerCase());

    if (workspace) {
      // 使用平台特定的路径分隔符
      const pathSeparator = workspace.path.includes('\\') ? '\\' : '/';
      const absolutePath = workspace.path + pathSeparator + relativePath;

      references.unshift({
        workspaceName,
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
 * 生成上下文说明头
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

  // 使用传入的 currentWorkspaceId 精确获取当前工作区
  const currentWorkspace = allWorkspaces.find(w => w.id === currentWorkspaceId);

  let header = '\n';
  header += '═══════════════════════════════════════════════════════════\n';
  header += '                        工作区上下文\n';
  header += '═══════════════════════════════════════════════════════════\n';
  header += `当前活动工作区: ${currentWorkspace?.name || '未设置'}\n`;
  if (currentWorkspace) {
    header += `路径: ${currentWorkspace.path}\n`;
  }

  if (contextWorkspaces.length > 0) {
    header += '\n上下文工作区（AI 可读取）:\n';
    contextWorkspaces.forEach(w => {
      header += `  • ${w.name} → ${w.path}\n`;
    });
  }

  if (references.length > 0) {
    // 获取被引用的唯一工作区
    const referencedWorkspaces = new Set(references.map(r => r.workspaceName));
    header += '\n本次引用的工作区:\n';
    referencedWorkspaces.forEach(name => {
      header += `  • ${name}\n`;
    });
  }

  header += '\n⚠️  写入操作仅在当前活动工作区执行\n';
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
  return /^@\w+[:/]/.test(text);
}
