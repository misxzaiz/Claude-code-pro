/**
 * Tauri 命令服务包装器
 */

import { invoke } from '@tauri-apps/api/core';
import { openPath } from '@tauri-apps/plugin-opener';
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
export async function getFileContent(path: string) {
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
