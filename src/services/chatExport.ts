/**
 * 聊天导出服务 - 将对话导出为 Markdown 或 JSON 格式
 */

import type { Message } from '../types';

export interface ExportMetadata {
  date: string;
  workspace?: string;
  messageCount: number;
}

/**
 * 将对话转换为 Markdown 格式
 */
export function exportToMarkdown(
  messages: Message[],
  workspaceName?: string
): string {
  const date = new Date().toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  let md = '# Claude Code Pro 对话记录\n\n';
  md += `**时间**: ${date}\n`;

  if (workspaceName) {
    md += `**工作区**: ${workspaceName}\n`;
  }

  md += `**消息数**: ${messages.length}\n`;
  md += '\n---\n\n';

  for (const message of messages) {
    const role = message.role === 'user' ? '用户' : '助手';
    const time = new Date(message.timestamp).toLocaleString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    });

    md += `## ${role}\n\n`;
    md += `<small>${time}</small>\n\n`;

    // 处理内容，保留代码块格式
    md += formatContent(message.content);

    // 添加工具调用摘要（如果有）
    if (message.toolSummary && message.toolSummary.count > 0) {
      md += `\n\n*调用了 ${message.toolSummary.count} 个工具: ${message.toolSummary.names.join(', ')}*`;
    }

    md += '\n\n---\n\n';
  }

  return md;
}

/**
 * 将对话转换为 JSON 格式
 */
export function exportToJson(
  messages: Message[],
  workspaceName?: string
): string {
  const data = {
    metadata: {
      date: new Date().toISOString(),
      workspace: workspaceName || null,
      messageCount: messages.length,
      exportedBy: 'Claude Code Pro',
    },
    messages: messages.map(m => ({
      role: m.role,
      content: m.content,
      timestamp: m.timestamp,
      toolSummary: m.toolSummary,
    })),
  };

  return JSON.stringify(data, null, 2);
}

/**
 * 格式化消息内容，处理代码块
 */
function formatContent(content: string): string {
  // 移除现有的代码块标记（如果有），重新处理
  const lines = content.split('\n');
  let result = '';
  let inCodeBlock = false;
  let codeBlockLang = '';
  let codeBlockContent: string[] = [];

  for (const line of lines) {
    // 检测是否是代码块开始
    const codeStartMatch = line.match(/^```(\w+)?/);
    if (codeStartMatch) {
      if (!inCodeBlock) {
        // 代码块开始
        inCodeBlock = true;
        codeBlockLang = codeStartMatch[1] || '';
        codeBlockContent = [];
      } else {
        // 代码块结束
        result += '```' + (codeBlockLang ? codeBlockLang : '') + '\n';
        result += codeBlockContent.join('\n');
        result += '\n```\n\n';
        inCodeBlock = false;
        codeBlockContent = [];
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockContent.push(line);
    } else {
      result += line + '\n';
    }
  }

  // 处理未闭合的代码块
  if (inCodeBlock) {
    result += '```' + (codeBlockLang ? codeBlockLang : '') + '\n';
    result += codeBlockContent.join('\n');
    result += '\n```\n\n';
  }

  return result;
}

/**
 * 生成默认文件名
 */
export function generateFileName(format: 'md' | 'json' = 'md'): string {
  const now = new Date();
  const date = now.getFullYear() +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0');
  const time = String(now.getHours()).padStart(2, '0') +
    String(now.getMinutes()).padStart(2, '0');

  return `对话记录-${date}-${time}.${format}`;
}
