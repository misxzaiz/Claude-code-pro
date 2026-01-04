/**
 * 文件搜索 Hook - 带防抖和缓存
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { searchFiles } from '../services/fileSearch';
import type { FileMatch } from '../services/fileSearch';
import { useWorkspaceStore } from '../stores';
import { fileSearchCache } from '../utils/cache';

export function useFileSearch() {
  const [fileMatches, setFileMatches] = useState<FileMatch[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { getCurrentWorkspace } = useWorkspaceStore();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // 清理
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, []);

  const searchFilesDebounced = useCallback(
    (query: string, delay: number = 150) => {
      // 清除之前的定时器和请求
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (abortControllerRef.current) abortControllerRef.current.abort();

      if (!query.trim()) {
        setFileMatches([]);
        return;
      }

      // 检查缓存（使用通用缓存工具）
      const cached = fileSearchCache.get(query);
      if (cached !== null) {
        setFileMatches(cached);
        return;
      }

      setIsLoading(true);

      timeoutRef.current = setTimeout(async () => {
        const workspace = getCurrentWorkspace();
        if (!workspace) {
          setIsLoading(false);
          return;
        }

        abortControllerRef.current = new AbortController();

        try {
          const results = await searchFiles(query, workspace.path, 10);

          // 更新缓存（使用通用缓存工具）
          fileSearchCache.set(query, results);

          // 定期清理过期缓存
          fileSearchCache.cleanup();

          setFileMatches(results);
        } catch (error) {
          if ((error as Error).name !== 'AbortError') {
            console.error('File search error:', error);
          }
        } finally {
          setIsLoading(false);
        }
      }, delay);
    },
    [getCurrentWorkspace]
  );

  const clearResults = useCallback(() => {
    setFileMatches([]);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  return {
    fileMatches,
    isLoading,
    searchFiles: searchFilesDebounced,
    clearResults,
  };
}
