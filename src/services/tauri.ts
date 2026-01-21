/**
 * Tauri 命令服务包装器
 */

import { invoke } from '@tauri-apps/api/core';
import { openPath } from '@tauri-apps/plugin-opener';
import { save } from '@tauri-apps/plugin-dialog';
import type { Config, HealthStatus } from '../types';

// ============================================================================
// 配置相关命令
// ============================================================================

/** 获取配置 */
export async function getConfig(): Promise<Config> {
  return invoke<Config>('get_config');
}

/** 更新配置 */
export async function updateConfig(config: Config): Promise<void> {
  return invoke('update_config', { config });
}

/** 设置工作目录 */
export async function setWorkDir(path: string | null): Promise<void> {
  return invoke('set_work_dir', { path });
}

/** 设置 Claude 命令路径 */
export async function setClaudeCmd(cmd: string): Promise<void> {
  return invoke('set_claude_cmd', { cmd });
}

/** 路径验证结果 */
export interface PathValidationResult {
  valid: boolean;
  error?: string;
  version?: string;
}

/** 查找所有可用的 Claude CLI 路径 */
export async function findClaudePaths(): Promise<string[]> {
  return invoke<string[]>('find_claude_paths');
}

/** 验证 Claude CLI 路径 */
export async function validateClaudePath(path: string): Promise<PathValidationResult> {
  return invoke<PathValidationResult>('validate_claude_path', { path });
}

/** 查找所有可用的 IFlow CLI 路径 */
export async function findIFlowPaths(): Promise<string[]> {
  return invoke<string[]>('find_iflow_paths');
}

/** 验证 IFlow CLI 路径 */
export async function validateIFlowPath(path: string): Promise<PathValidationResult> {
  return invoke<PathValidationResult>('validate_iflow_path', { path });
}

// ============================================================================
// 健康检查命令
// ============================================================================

/** 健康检查 */
export async function healthCheck(): Promise<HealthStatus> {
  return invoke<HealthStatus>('health_check');
}

// ============================================================================
// 聊天相关命令
// ============================================================================

/** 启动聊天会话 */
export async function startChat(message: string, workDir?: string): Promise<string> {
  return invoke<string>('start_chat', { message, workDir });
}

/** 继续聊天会话 */
export async function continueChat(sessionId: string, message: string, workDir?: string): Promise<void> {
  return invoke('continue_chat', { sessionId, message, workDir });
}

/** 中断聊天 */
export async function interruptChat(sessionId: string): Promise<void> {
  return invoke('interrupt_chat', { sessionId });
}

// ============================================================================
// IFlow 聊天相关命令
// ============================================================================

/** 启动 IFlow 聊天会话 */
export async function startIFlowChat(message: string): Promise<string> {
  return invoke<string>('start_iflow_chat', { message });
}

/** 继续 IFlow 聊天会话 */
export async function continueIFlowChat(sessionId: string, message: string): Promise<void> {
  return invoke('continue_iflow_chat', { sessionId, message });
}

/** 中断 IFlow 聊天 */
export async function interruptIFlowChat(sessionId: string): Promise<void> {
  return invoke('interrupt_iflow_chat', { sessionId });
}

// ============================================================================
// 工作区相关命令
// ============================================================================

/** 验证工作区路径 */
export async function validateWorkspacePath(path: string): Promise<boolean> {
  return invoke('validate_workspace_path', { path });
}

/** 获取目录信息 */
export async function getDirectoryInfo(path: string) {
  return invoke('get_directory_info', { path });
}

// ============================================================================
// 文件浏览器相关命令
// ============================================================================

/** 读取目录内容 */
export async function readDirectory(path: string) {
  return invoke('read_directory', { path });
}

/** 获取文件内容 */
export async function getFileContent(path: string): Promise<string> {
  return invoke('get_file_content', { path });
}

/** 读取文件内容（别名） */
export async function readFile(path: string): Promise<string> {
  return invoke('get_file_content', { path });
}

/** 创建文件 */
export async function createFile(path: string, content?: string) {
  return invoke('create_file', { path, content });
}

/** 创建目录 */
export async function createDirectory(path: string) {
  return invoke('create_directory', { path });
}

/** 删除文件或目录 */
export async function deleteFile(path: string) {
  return invoke('delete_file', { path });
}

/** 重命名文件或目录 */
export async function renameFile(oldPath: string, newName: string) {
  return invoke('rename_file', { oldPath, newName });
}

/** 检查路径是否存在 */
export async function pathExists(path: string) {
  return invoke('path_exists', { path });
}



// ============================================================================
// 系统相关命令
// ============================================================================

/** 在默认应用中打开文件（HTML 文件可在浏览器中打开） */
export async function openInDefaultApp(path: string): Promise<void> {
  await openPath(path);
}

// ============================================================================
// 上下文管理相关命令
// ============================================================================

/** 上下文来源类型 */
export type ContextSource = 'project' | 'workspace' | 'ide' | 'user_selection' | 'semantic_related' | 'history' | 'diagnostics';

/** 上下文类型 */
export type ContextType = 'file' | 'file_structure' | 'symbol' | 'selection' | 'diagnostics' | 'project_meta';

/** 上下文条目 */
export interface ContextEntry {
  id: string;
  source: ContextSource;
  type: ContextType;
  priority: number;
  content: ContextContent;
  workspace_id?: string;
  created_at: number;
  expires_at?: number;
  estimated_tokens: number;
}

/** 上下文内容 */
export type ContextContent =
  | { type: 'file'; path: string; content: string; language: string }
  | { type: 'file_structure'; path: string; symbols: ContextSymbol[]; summary?: string }
  | { type: 'symbol'; name: string; definition: ContextLocation; kind: SymbolKind; documentation?: string; signature?: string }
  | { type: 'selection'; path: string; range: ContextRange; content: string; context_lines?: number }
  | { type: 'diagnostics'; path?: string; items: ContextDiagnostic[]; summary?: ContextDiagnosticSummary }
  | { type: 'project_meta'; name: string; root_dir: string; project_type: string; languages: string[]; frameworks: string[] };

/** 符号类型 */
export type SymbolKind = 'class' | 'interface' | 'enum' | 'function' | 'method' | 'variable' | 'constant' | 'property';

/** 上下文符号 */
export interface ContextSymbol {
  name: string;
  kind: SymbolKind;
  location: ContextLocation;
  documentation?: string;
  children?: ContextSymbol[];
}

/** 上下文位置 */
export interface ContextLocation {
  path: string;
  line_start: number;
  line_end: number;
  column_start?: number;
  column_end?: number;
}

/** 上下文范围 */
export interface ContextRange {
  start: { line: number; character: number };
  end: { line: number; character: number };
}

/** 上下文诊断 */
export interface ContextDiagnostic {
  path: string;
  severity: string;
  message: string;
  range: ContextRange;
  code?: string;
  source?: string;
}

/** 诊断摘要 */
export interface ContextDiagnosticSummary {
  errors: number;
  warnings: number;
  infos: number;
  hints: number;
}

/** 上下文查询请求 */
export interface ContextQueryRequest {
  workspace_id?: string;
  types?: ContextType[];
  sources?: ContextSource[];
  max_tokens?: number;
  min_priority?: number;
  current_file?: string;
  mentioned_files?: string[];
}

/** 上下文查询结果 */
export interface ContextQueryResult {
  entries: ContextEntry[];
  total_tokens: number;
  summary: ContextSummary;
}

/** 上下文摘要 */
export interface ContextSummary {
  file_count: number;
  symbol_count: number;
  workspace_ids: string[];
  languages: string[];
}

/** 查询上下文 */
export async function queryContext(request: ContextQueryRequest): Promise<ContextQueryResult> {
  return invoke('context_query', { request });
}

/** 添加或更新上下文 */
export async function upsertContext(entry: ContextEntry): Promise<void> {
  return invoke('context_upsert', { entry });
}

/** 批量添加或更新上下文 */
export async function upsertContextMany(entries: ContextEntry[]): Promise<void> {
  return invoke('context_upsert_many', { entries });
}

/** 获取所有上下文 */
export async function getAllContext(): Promise<ContextEntry[]> {
  return invoke('context_get_all');
}

/** 移除上下文 */
export async function removeContext(id: string): Promise<void> {
  return invoke('context_remove', { id });
}

/** 清空上下文 */
export async function clearContext(): Promise<void> {
  return invoke('context_clear');
}

/** IDE 上报当前文件 */
export async function ideReportCurrentFile(context: {
  workspace_id: string;
  file_path: string;
  content: string;
  language: string;
  cursor_offset: number;
}): Promise<void> {
  return invoke('ide_report_current_file', { context });
}

/** IDE 上报文件结构 */
export async function ideReportFileStructure(structure: {
  workspace_id: string;
  file_path: string;
  symbols: ContextSymbol[];
}): Promise<void> {
  return invoke('ide_report_file_structure', { structure });
}

/** IDE 上报诊断信息 */
export async function ideReportDiagnostics(diagnostics: {
  workspace_id: string;
  file_path: string;
  diagnostics: ContextDiagnostic[];
}): Promise<void> {
  return invoke('ide_report_diagnostics', { diagnostics });
}

// ============================================================================
// 导出相关命令
// ============================================================================

/** 保存对话到文件 */
export async function saveChatToFile(content: string, defaultFileName: string): Promise<string | null> {
  try {
    const filePath = await save({
      defaultPath: defaultFileName,
      filters: [
        {
          name: 'Markdown',
          extensions: ['md']
        },
        {
          name: 'JSON',
          extensions: ['json']
        },
        {
          name: '文本',
          extensions: ['txt']
        }
      ]
    });

    if (filePath) {
      // 写入文件内容，使用已有的 create_file 命令
      await invoke('create_file', { path: filePath, content });
      return filePath;
    }
    return null;
  } catch (e) {
    console.error('保存文件失败:', e);
    throw e;
  }
}

// ============================================================================
// 终端相关命令
// ============================================================================

/** 系统信息 */
export interface SystemInfo {
  os: string;
  arch: string;
  current_dir: string;
}

/** 执行命令并返回结果 */
export async function terminalExecuteCommand(
  command: string,
  args: string[],
  workingDir?: string
): Promise<string> {
  return invoke<string>('terminal_execute_command', { command, args, workingDir });
}

/** 获取系统信息 */
export async function terminalGetSystemInfo(): Promise<SystemInfo> {
  return invoke<SystemInfo>('terminal_get_system_info');
}
