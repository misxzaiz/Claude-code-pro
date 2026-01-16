/**
 * 工具调用智能摘要生成工具
 *
 * 将技术性的工具调用转换为用户友好的描述
 * 支持 Bash、Grep、Edit 等工具的专用解析
 */

import type { ToolStatus } from '../types';

/**
 * 工具名称映射表 - 中文友好名称
 */
const TOOL_NAME_MAP: Record<string, string> = {
  'str_replace_editor': '编辑文件',
  'Edit': '编辑文件',
  'ReadFile': '读取文件',
  'read_file': '读取文件',
  'BashCommand': '执行命令',
  'run_command': '执行命令',
  'WriteFile': '写入文件',
  'write_file': '写入文件',
  'ListFiles': '列出文件',
  'list_files': '列出文件',
  'SearchFiles': '搜索文件',
  'search_files': '搜索文件',
  'GitCommand': 'Git 操作',
  'git_command': 'Git 操作',
  'DatabaseQuery': '数据库查询',
  'database_query': '数据库查询',
  'APICall': 'API 请求',
  'api_call': 'API 请求',
  'WebSearch': '网络搜索',
  'web_search': '网络搜索',
  'FileBrowser': '浏览文件',
  'file_browser': '浏览文件',
  'CreateFile': '创建文件',
  'create_file': '创建文件',
  'DeleteFile': '删除文件',
  'delete_file': '删除文件',
  'MoveFile': '移动文件',
  'move_file': '移动文件',
  'CopyFile': '复制文件',
  'copy_file': '复制文件',
};

/**
 * 获取工具的友好名称
 */
function getToolFriendlyName(toolName: string): string {
  return TOOL_NAME_MAP[toolName] || toolName;
}

/**
 * 从工具输入中提取文件路径
 */
function extractFilePath(input?: Record<string, unknown>): string | null {
  if (!input) return null;

  const pathKeys = ['path', 'file_path', 'filePath', 'filename', 'file'];
  for (const key of pathKeys) {
    const value = input[key];
    if (typeof value === 'string') {
      // 只显示文件名，不显示完整路径
      const parts = value.split('/');
      const parts2 = value.split('\\');
      const fileName = parts.length > parts2.length
        ? parts[parts.length - 1]
        : parts2[parts2.length - 1];
      return fileName || value;
    }
  }
  return null;
}

/**
 * 从工具输入中提取命令
 */
function extractCommand(input?: Record<string, unknown>): string | null {
  if (!input) return null;

  const cmdKeys = ['command', 'cmd', 'command_string'];
  for (const key of cmdKeys) {
    const value = input[key];
    if (typeof value === 'string') {
      // 截断过长的命令
      return value.length > 50 ? value.slice(0, 47) + '...' : value;
    }
  }
  return null;
}

/**
 * 从工具输入中提取搜索关键词
 */
function extractSearchQuery(input?: Record<string, unknown>): string | null {
  if (!input) return null;

  const queryKeys = ['query', 'q', 'search', 'keyword', 'pattern', 'regex'];
  for (const key of queryKeys) {
    const value = input[key];
    if (typeof value === 'string') {
      return value.length > 30 ? value.slice(0, 27) + '...' : value;
    }
  }
  return null;
}

/**
 * 根据工具名称和输入生成人性化摘要（进行中）
 */
export function generateToolSummary(
  toolName: string,
  input?: Record<string, unknown>,
  status: ToolStatus = 'running'
): string {
  const friendlyName = getToolFriendlyName(toolName);
  const filePath = extractFilePath(input);
  const command = extractCommand(input);
  const query = extractSearchQuery(input);

  const isRunning = status === 'running';
  const prefix = isRunning ? '正在' : '';

  // 根据工具类型生成摘要
  switch (toolName) {
    case 'str_replace_editor':
    case 'Edit':
      if (filePath) {
        return isRunning ? `正在编辑 ${filePath}` : `${filePath} 已编辑`;
      }
      return `${prefix}${friendlyName}`;

    case 'ReadFile':
    case 'read_file':
      if (filePath) {
        return isRunning ? `正在读取 ${filePath}` : `${filePath} 已读取`;
      }
      return `${prefix}${friendlyName}`;

    case 'WriteFile':
    case 'write_file':
    case 'CreateFile':
    case 'create_file':
      if (filePath) {
        return isRunning ? `正在创建 ${filePath}` : `${filePath} 已创建`;
      }
      return `${prefix}${friendlyName}`;

    case 'DeleteFile':
    case 'delete_file':
      if (filePath) {
        return isRunning ? `正在删除 ${filePath}` : `${filePath} 已删除`;
      }
      return `${prefix}${friendlyName}`;

    case 'BashCommand':
    case 'run_command':
      if (command) {
        return isRunning ? `正在执行: ${command}` : `已执行: ${command}`;
      }
      return `${prefix}${friendlyName}`;

    case 'SearchFiles':
    case 'search_files':
    case 'WebSearch':
    case 'web_search':
      if (query) {
        return isRunning ? `正在搜索: ${query}` : `已搜索: ${query}`;
      }
      return `${prefix}${friendlyName}`;

    case 'ListFiles':
    case 'list_files':
      if (filePath) {
        return isRunning ? `正在列出 ${filePath}` : `已列出 ${filePath}`;
      }
      return `${prefix}${friendlyName}`;

    case 'GitCommand':
    case 'git_command':
      if (command) {
        return isRunning ? `正在执行 Git: ${command}` : `Git: ${command}`;
      }
      return `${prefix}${friendlyName}`;

    default:
      // 通用处理
      if (filePath) {
        return `${prefix}${friendlyName}: ${filePath}`;
      }
      if (command) {
        return `${prefix}${command}`;
      }
      return `${prefix}${friendlyName}`;
  }
}

/**
 * 生成工具组摘要
 */
export function generateToolGroupSummary(
  toolCount: number,
  status: ToolStatus,
  completedCount = 0
): string {
  if (status === 'running') {
    if (toolCount === 1) {
      return '正在执行 1 个操作...';
    }
    return `正在执行 ${toolCount} 个操作...`;
  }

  if (status === 'completed') {
    return `${toolCount} 个操作已完成`;
  }

  if (status === 'failed') {
    return `${toolCount} 个操作中有失败`;
  }

  if (status === 'partial') {
    return `${completedCount}/${toolCount} 个操作已完成`;
  }

  return `${toolCount} 个操作`;
}

/**
 * 计算工具组状态
 */
export function calculateToolGroupStatus(
  tools: Array<{ status: ToolStatus }>
): ToolStatus {
  if (tools.length === 0) return 'running';

  const allCompleted = tools.every(t => t.status === 'completed');
  const anyFailed = tools.some(t => t.status === 'failed');
  const allRunning = tools.every(t => t.status === 'running' || t.status === 'pending');
  const someCompleted = tools.some(t => t.status === 'completed');

  if (allCompleted) return 'completed';
  if (anyFailed && !someCompleted) return 'failed';
  if (anyFailed) return 'partial';
  if (allRunning) return 'running';
  return 'partial'; // 部分完成，部分运行中
}

/**
 * 格式化工具执行时长
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}m${seconds}s`;
}

/**
 * 计算工具执行时长
 */
export function calculateDuration(startedAt: string, completedAt?: string): number | undefined {
  if (!completedAt) return undefined;
  const start = new Date(startedAt).getTime();
  const end = new Date(completedAt).getTime();
  return end - start;
}

// ========================================
// 输出摘要优化
// ========================================

/**
 * 清理 ANSI 转义码
 * 用于清理 npm/yarn 等工具输出的颜色代码
 */
export function stripAnsiCodes(text: string): string {
  // ANSI 转义码格式: \x1b[XXm 或 \033[XXm
  const ansiRegex = /\x1b\[[0-9;]*m/g;
  return text.replace(ansiRegex, '');
}

/**
 * 输出摘要类型
 */
export type OutputSummaryType =
  | 'matchCount'      // 匹配数量 (Grep)
  | 'fileCount'       // 文件数量 (Glob)
  | 'lineCount'       // 行数 (Read/Write)
  | 'exitStatus'      // 退出状态 (Bash)
  | 'resultCount'     // 结果数量 (Search)
  | 'todoProgress'    // 任务进度 (TodoWrite)
  | 'urlFetch'        // URL 抓取 (WebFetch)
  | 'diffSummary'     // 差异摘要 (Edit)
  | 'plain';          // 纯文本

/**
 * 输出摘要结果
 */
export interface OutputSummary {
  type: OutputSummaryType;
  summary: string;
  fullOutput?: string;
  expandable?: boolean;
}

/**
 * Grep 匹配项
 */
export interface GrepMatch {
  file: string;
  line: number;
  content: string;
}

/**
 * Grep 详细解析结果
 */
export interface GrepOutputData {
  matches: GrepMatch[];
  query: string;
  total: number;
}

/**
 * 解析 Grep 输出 - 结构化
 */
export function parseGrepMatches(output: string, input?: Record<string, unknown>): GrepOutputData | null {
  const lines = output.trim().split('\n');
  const matches: GrepMatch[] = [];
  const query = extractSearchQuery(input) || '';

  for (const line of lines) {
    if (!line.trim()) continue;

    // 支持多种格式：
    // - "file:line:content"
    // - "file:line:column:content" (带列号)
    const match = line.match(/^([^:]+):(\d+)(?::(\d+))?:?(.*)$/);
    if (match) {
      const [, file, lineNum, , content] = match;
      if (content.trim()) {
        matches.push({
          file,
          line: parseInt(lineNum, 10),
          content: content.trim(),
        });
      }
    } else {
      // 不匹配标准格式，作为普通行处理
      matches.push({
        file: '',
        line: 0,
        content: line.trim(),
      });
    }
  }

  if (matches.length === 0) return null;

  return { matches, query, total: matches.length };
}

/**
 * 解析 Grep 输出 - 摘要版本
 */
function parseGrepOutput(output: string): OutputSummary | null {
  const lines = output.trim().split('\n');
  const matchCount = lines.filter(line => line.trim()).length;

  if (matchCount === 0) {
    return { type: 'matchCount', summary: '未找到匹配项', fullOutput: output };
  }

  return {
    type: 'matchCount',
    summary: `找到 ${matchCount} 个匹配项`,
    fullOutput: output,
    expandable: true,
  };
}

/**
 * 解析 Glob 输出
 */
function parseGlobOutput(output: string): OutputSummary | null {
  if (!output.trim()) {
    return { type: 'fileCount', summary: '未找到文件' };
  }

  const files = output.trim().split('\n').filter(f => f.trim());
  return {
    type: 'fileCount',
    summary: `找到 ${files.length} 个文件`,
    fullOutput: output,
    expandable: files.length > 0,
  };
}

/**
 * 错误关键词列表
 */
const ERROR_KEYWORDS = [
  'error:', 'error ', 'Error:', 'Error ', 'ERROR:',
  'fail', 'Fail', 'FAIL', 'failed', 'Failed', 'FAILED',
  'exception', 'Exception', 'EXCEPTION',
  'cannot', 'Cannot', 'CANNOT',
  'unable', 'Unable', 'UNABLE',
  'denied', 'Denied', 'DENIED',
  'not found', 'Not Found', 'NOT FOUND',
  'no such', 'No such', 'NO SUCH',
  '错误', '失败', '异常', '无法', '不存在',
];

/**
 * 解析 Bash 输出 - 优化版
 * - 清理 ANSI 转义码
 * - 优先显示错误行
 * - 检测退出码
 */
function parseBashOutput(output: string): OutputSummary | null {
  if (!output.trim()) {
    return { type: 'exitStatus', summary: '命令已执行' };
  }

  // 清理 ANSI 转义码
  const cleanOutput = stripAnsiCodes(output);
  const lines = cleanOutput.trim().split('\n').filter(l => l.trim());

  if (lines.length === 0) {
    return { type: 'exitStatus', summary: '命令已执行（无输出）' };
  }

  // 1. 优先查找包含错误关键词的行
  const errorLine = lines.find(line =>
    ERROR_KEYWORDS.some(kw =>
      line.toLowerCase().includes(kw.toLowerCase())
    )
  );

  if (errorLine) {
    const cleanError = errorLine.trim().slice(0, 50);
    return {
      type: 'exitStatus',
      summary: `错误: ${cleanError}${errorLine.length > 50 ? '...' : ''}`,
      fullOutput: cleanOutput,
      expandable: true,
    };
  }

  // 2. 检测退出码（某些工具会输出 "exit code: X"）
  const exitCodeMatch = cleanOutput.match(/exit\s+code:\s*(\d+)/i);
  if (exitCodeMatch) {
    const code = parseInt(exitCodeMatch[1], 10);
    if (code !== 0) {
      return {
        type: 'exitStatus',
        summary: `退出码 ${code}`,
        fullOutput: cleanOutput,
        expandable: true,
      };
    }
  }

  // 3. 检测 npm/yarn 错误
  const npmErrorMatch = cleanOutput.match(/npm\s+err!\s+(.+)/i);
  if (npmErrorMatch) {
    return {
      type: 'exitStatus',
      summary: `npm: ${npmErrorMatch[1].trim().slice(0, 40)}...`,
      fullOutput: cleanOutput,
      expandable: true,
    };
  }

  // 4. 无错误，显示首行
  const firstLine = lines[0].trim();
  return {
    type: 'exitStatus',
    summary: firstLine.slice(0, 50) + (firstLine.length > 50 ? '...' : ''),
    fullOutput: cleanOutput,
    expandable: lines.length > 1,
  };
}

/**
 * 解析 WebSearch 输出
 */
function parseWebSearchOutput(output: string): OutputSummary | null {
  // 尝试提取结果数量
  const countMatch = output.match(/found?\s*(\d+)\s*result/i);
  if (countMatch) {
    return {
      type: 'resultCount',
      summary: `找到 ${countMatch[1]} 个搜索结果`,
      fullOutput: output,
      expandable: true,
    };
  }

  return {
    type: 'resultCount',
    summary: '搜索已完成',
    fullOutput: output,
    expandable: true,
  };
}

/**
 * 解析文件读取输出
 */
function parseReadOutput(output: string): OutputSummary | null {
  if (!output.trim()) {
    return { type: 'lineCount', summary: '空文件' };
  }

  const lines = output.split('\n').length;
  const chars = output.length;
  const sizeKB = (chars / 1024).toFixed(1);

  return {
    type: 'lineCount',
    summary: `${lines} 行 (${sizeKB} KB)`,
    fullOutput: output,
    expandable: true,
  };
}

/**
 * 解析文件写入输出
 */
function parseWriteOutput(output: string): OutputSummary | null {
  if (output.toLowerCase().includes('success') || output.toLowerCase().includes('written')) {
    const linesMatch = output.match(/(\d+)\s*line/);
    if (linesMatch) {
      return { type: 'lineCount', summary: `已写入 ${linesMatch[1]} 行` };
    }
    return { type: 'lineCount', summary: '写入成功' };
  }

  return {
    type: 'lineCount',
    summary: '写入完成',
    fullOutput: output,
  };
}

/**
 * 解析 Edit/str_replace_editor 输出
 */
function parseEditOutput(output: string, input?: Record<string, unknown>): OutputSummary | null {
  const filePath = input?.path as string || '';
  const fileName = filePath.split('/').pop() || '';

  // 成功情况
  if (output.toLowerCase().includes('success') ||
      output.toLowerCase().includes('edited') ||
      output.toLowerCase().includes('updated') ||
      output.toLowerCase().includes('complete')) {
    return {
      type: 'diffSummary',
      summary: fileName ? `${fileName} 已修改` : '修改成功',
      fullOutput: output,
    };
  }

  // 失败情况
  if (output.toLowerCase().includes('fail') ||
      output.toLowerCase().includes('error')) {
    return {
      type: 'diffSummary',
      summary: fileName ? `${fileName} 修改失败` : '修改失败',
      fullOutput: output,
      expandable: true,
    };
  }

  // 默认
  return null;
}

/**
 * 生成输出智能摘要
 */
export function generateOutputSummary(
  toolName: string,
  output: string,
  status: ToolStatus = 'completed',
  input?: Record<string, unknown>
): OutputSummary | null {
  if (!output || status === 'running' || status === 'pending') {
    return null;
  }

  const normalizedToolName = toolName.toLowerCase();

  // 根据工具类型解析输出
  if (normalizedToolName.includes('grep')) {
    return parseGrepOutput(output);
  }

  if (normalizedToolName.includes('glob')) {
    return parseGlobOutput(output);
  }

  if (
    normalizedToolName.includes('bash') ||
    normalizedToolName.includes('command') ||
    normalizedToolName.includes('execute')
  ) {
    return parseBashOutput(output);
  }

  if (
    normalizedToolName.includes('edit') ||
    normalizedToolName.includes('str_replace')
  ) {
    const editResult = parseEditOutput(output, input);
    if (editResult) return editResult;
  }

  if (normalizedToolName.includes('search') || normalizedToolName.includes('web_search')) {
    return parseWebSearchOutput(output);
  }

  if (normalizedToolName.includes('read') || normalizedToolName.includes('read_file')) {
    return parseReadOutput(output);
  }

  if (
    normalizedToolName.includes('write') ||
    normalizedToolName.includes('write_file') ||
    normalizedToolName.includes('create')
  ) {
    return parseWriteOutput(output);
  }

  // 默认：显示截断的输出
  const preview = output.slice(0, 50);
  return {
    type: 'plain',
    summary: preview + (output.length > 50 ? '...' : ''),
    fullOutput: output,
    expandable: output.length > 50,
  };
}

/**
 * 转义正则表达式特殊字符
 */
export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
