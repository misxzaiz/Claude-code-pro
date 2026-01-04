/**
 * 文件搜索服务 - 用于 @file 引用
 */

import { invoke } from '@tauri-apps/api/core';

export interface FileMatch {
  name: string;
  relativePath: string;  // 相对路径，如 "src/components/App.tsx"
  fullPath: string;      // 完整路径
  is_dir: boolean;
  extension?: string;
}

/**
 * 在工作区中搜索文件
 * @param query 搜索关键词（支持 "path/file" 格式）
 * @param workDir 工作目录
 * @param maxResults 最大结果数
 *
 * 示例:
 * - "app" -> 搜索所有包含 "app" 的文件
 * - "src/app" -> 在 src 目录下搜索包含 "app" 的文件
 */
export async function searchFiles(
  query: string,
  workDir: string | null,
  maxResults: number = 15
): Promise<FileMatch[]> {
  if (!workDir || !query.trim()) {
    return [];
  }

  try {
    const results = await invoke<FileMatch[]>('search_files', {
      workDir: workDir,
      query: query.trim(),
      maxResults,
    });

    return results.map(r => ({
      name: r.name,
      relativePath: r.relativePath,
      fullPath: r.fullPath,
      is_dir: r.is_dir,
      extension: r.extension,
    }));
  } catch (error) {
    console.error('Failed to search files:', error);
    return [];
  }
}

/**
 * 根据扩展名过滤文件
 */
export function filterByExtension(
  files: FileMatch[],
  extensions: string[]
): FileMatch[] {
  const extSet = new Set(extensions.map(e => e.toLowerCase()));
  return files.filter(f =>
    !f.is_dir && (!f.extension || extSet.has(f.extension))
  );
}

/**
 * 只返回文件（不包括目录）
 */
export function filesOnly(matches: FileMatch[]): FileMatch[] {
  return matches.filter(m => !m.is_dir);
}

/**
 * 只返回目录
 */
export function directoriesOnly(matches: FileMatch[]): FileMatch[] {
  return matches.filter(m => m.is_dir);
}
