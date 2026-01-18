/**
 * 文件上下文选择器
 * 允许用户选择文件添加到上下文
 * 使用真实的文件系统数据
 */

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { clsx } from 'clsx';
import { X, Search, File, Folder, ChevronRight, ChevronDown, Check, Loader2, AlertCircle } from 'lucide-react';
import { useWorkspaceStore, useContextStore } from '../../stores';
import { useFileExplorerStore } from '../../stores/fileExplorerStore';
import * as tauri from '../../services/tauri';
import type { FileReference } from '../../types/context';

interface ContextFilePickerProps {
  onClose: () => void;
  onConfirm: (files: FileReference[]) => void;
}

interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileNode[];
  language?: string;
}

/**
 * 语言对应的颜色
 */
const LANGUAGE_COLORS: Record<string, string> = {
  typescript: 'text-blue-400',
  javascript: 'text-yellow-400',
  python: 'text-green-400',
  rust: 'text-orange-400',
  go: 'text-cyan-400',
  java: 'text-red-400',
  cpp: 'text-blue-300',
  c: 'text-blue-300',
  ruby: 'text-red-400',
  php: 'text-purple-400',
  shell: 'text-green-300',
  json: 'text-yellow-300',
  markdown: 'text-blue-300',
  text: 'text-text-muted',
};

/**
 * 获取文件语言
 */
function getLanguageFromPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript',
    js: 'javascript', jsx: 'javascript',
    py: 'python', rs: 'rust',
    go: 'go', java: 'java',
    kt: 'kotlin', cs: 'csharp',
    cpp: 'cpp', c: 'c', h: 'c',
    rb: 'ruby', php: 'php',
    sh: 'shell', bash: 'shell',
    json: 'json', xml: 'xml',
    yaml: 'yaml', yml: 'yaml',
    md: 'markdown', txt: 'text',
  };
  return ext ? map[ext] || 'text' : 'text';
}

/**
 * 从 FileInfo 转换为 FileNode
 */
function fileInfoToFileNode(item: any): FileNode {
  const isDir = item.is_dir;
  return {
    name: item.name,
    path: item.path,
    type: isDir ? 'directory' : 'file',
    language: isDir ? undefined : getLanguageFromPath(item.path),
  };
}

/**
 * 递归构建文件树（带子节点）
 */
function buildTreeWithChildren(
  folderPath: string,
  getCache: (path: string) => any[] | null,
  loadingSet: Set<string>
): FileNode[] {
  const cached = getCache(folderPath);
  if (!cached || cached.length === 0) {
    return [];
  }

  return cached.map((item: any): FileNode => {
    const node = fileInfoToFileNode(item);

    // 如果是目录且已加载缓存，递归构建子节点
    if (node.type === 'directory' && !loadingSet.has(node.path)) {
      const children = buildTreeWithChildren(node.path, getCache, loadingSet);
      if (children.length > 0) {
        node.children = children;
      }
    }

    return node;
  });
}

/**
 * 文件夹选中状态
 */
type FolderSelectionStatus = 'none' | 'partial' | 'all';

/**
 * 递归获取节点内所有文件路径
 */
function getAllFilesInNode(node: FileNode): string[] {
  if (node.type === 'file') {
    return [node.path];
  }
  if (node.children) {
    return node.children.flatMap(getAllFilesInNode);
  }
  return [];
}

/**
 * 计算文件夹的选中状态
 * @param node 文件夹节点
 * @param selected 当前选中的文件 key 集合
 * @param workspaceId 工作区 ID
 * @returns 选中状态：none(未选中) | partial(部分选中) | all(全选)
 */
function getFolderSelectionStatus(
  node: FileNode,
  selected: Set<string>,
  workspaceId: string
): FolderSelectionStatus {
  const allFiles = getAllFilesInNode(node);
  if (allFiles.length === 0) {
    return 'none';
  }

  const selectedFiles = allFiles.filter(f => selected.has(`${workspaceId}:${f}`));

  if (selectedFiles.length === 0) {
    return 'none';
  }
  if (selectedFiles.length === allFiles.length) {
    return 'all';
  }
  return 'partial';
}

/**
 * 计算文件夹内所有文件的 Token 总数
 */
function calculateFolderTokens(
  node: FileNode,
  fileTokens: Map<string, number>,
  workspaceId: string
): number {
  const allFiles = getAllFilesInNode(node);
  return allFiles.reduce((sum, filePath) => {
    const key = `${workspaceId}:${filePath}`;
    return sum + (fileTokens.get(key) || 0);
  }, 0);
}

export function ContextFilePicker({ onClose, onConfirm }: ContextFilePickerProps) {
  const { workspaces, currentWorkspaceId, contextWorkspaceIds } = useWorkspaceStore();
  const { selectedFiles, estimateTokens, addFiles } = useContextStore();
  const {
    loading_folders: storeLoadingFolders,
    load_folder_content,
    get_cached_folder_content
  } = useFileExplorerStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(
    new Set(selectedFiles.map(f => `${f.workspaceId}:${f.path}`))
  );
  const [fileTokens, setFileTokens] = useState<Map<string, number>>(new Map());
  const [loadingRoots, setLoadingRoots] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  // 使用 ref 追踪已加载的根目录，避免重复加载
  const loadedRootsRef = useRef<Set<string>>(new Set());

  // 为每个工作区构建文件树 - 只显示当前工作区和关联工作区
  const workspacesTrees = useMemo(() => {
    const accessibleIds = new Set([
      currentWorkspaceId,
      ...contextWorkspaceIds
    ].filter(Boolean));

    return workspaces
      .filter(w => accessibleIds.has(w.id))
      .map(workspace => ({
        workspace,
        rootPath: workspace.path,
        rootName: workspace.name,
      }));
  }, [workspaces, currentWorkspaceId, contextWorkspaceIds]);

  // 切换文件夹展开状态并加载内容
  const toggleFolder = useCallback(async (node: FileNode) => {
    const path = node.path;
    const isExpanded = expandedFolders.has(path);

    // 如果不是目录，立即返回
    if (node.type !== 'directory') {
      return;
    }

    // 清除错误
    setError(null);

    if (isExpanded) {
      // 折叠
      setExpandedFolders(prev => {
        const next = new Set(prev);
        next.delete(path);
        return next;
      });
    } else {
      // 展开 - 先标记为展开
      setExpandedFolders(prev => new Set([...prev, path]));

      // 检查是否需要加载
      const cached = get_cached_folder_content(path);

      if (!cached || cached.length === 0) {
        // 需要加载，但 store 的 loading_folders 会处理
        await load_folder_content(path).catch((err) => {
          setError(`加载文件夹失败: ${err.message || node.name}`);
          // 加载失败时，折叠文件夹
          setExpandedFolders(prev => {
            const next = new Set(prev);
            next.delete(path);
            return next;
          });
        });
      }
    }
  }, [expandedFolders, get_cached_folder_content, load_folder_content]);

  // 递归渲染文件树
  const renderNode = useCallback((
    node: FileNode,
    workspaceId: string,
    level: number = 0
  ): React.ReactNode => {
    const key = `${workspaceId}:${node.path}`;
    const isExpanded = expandedFolders.has(node.path);
    const isSelected = selected.has(key);
    const isLoading = storeLoadingFolders.has(node.path) || loadingRoots.has(node.path);
    const tokens = fileTokens.get(key) || 0;

    if (node.type === 'directory') {
      // 计算文件夹的选中状态
      const folderStatus = getFolderSelectionStatus(node, selected, workspaceId);
      // 计算文件夹的总 Token 数
      const folderTokens = calculateFolderTokens(node, fileTokens, workspaceId);

      return (
        <div key={key} className="select-none">
          <div
            className={clsx(
              'flex items-center gap-1 py-1 px-2 rounded transition-colors',
              level === 0 && 'font-medium'
            )}
            style={{ paddingLeft: `${level * 16 + 8}px` }}
          >
            {/* 展开/收起图标 - 点击展开/收起 */}
            <div
              className="flex-shrink-0 cursor-pointer hover:bg-background-hover rounded"
              onClick={(e) => {
                e.stopPropagation();
                toggleFolder(node);
              }}
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 text-text-muted animate-spin" />
              ) : isExpanded ? (
                <ChevronDown className="w-4 h-4 text-text-muted" />
              ) : (
                <ChevronRight className="w-4 h-4 text-text-muted" />
              )}
            </div>

            {/* 文件夹复选框 - 点击切换选中状态 */}
            <div
              className={clsx(
                'w-5 h-5 rounded flex items-center justify-center border cursor-pointer flex-shrink-0',
                folderStatus === 'all' && 'border-primary bg-primary',
                folderStatus === 'partial' && 'border-primary bg-primary/50',
                folderStatus === 'none' && 'border-border hover:border-primary/50'
              )}
              onClick={(e) => {
                e.stopPropagation();
                // 切换文件夹选中状态
                const allFiles = getAllFilesInNode(node);
                setSelected(prev => {
                  const next = new Set(prev);
                  if (folderStatus === 'all') {
                    // 取消选中所有子文件
                    allFiles.forEach(f => next.delete(`${workspaceId}:${f}`));
                  } else {
                    // 选中所有子文件
                    allFiles.forEach(f => next.add(`${workspaceId}:${f}`));
                  }
                  return next;
                });
              }}
            >
              {folderStatus === 'all' && <Check className="w-3 h-3 text-white" />}
              {folderStatus === 'partial' && <div className="w-2 h-2 bg-white rounded-sm" />}
            </div>

            <Folder className={clsx('w-4 h-4 flex-shrink-0', isExpanded ? 'text-primary' : 'text-text-muted')} />
            <span className="text-sm text-text-primary">{node.name}</span>
            {folderTokens > 0 && (
              <span className="text-xs text-text-tertiary ml-1">{folderTokens}t</span>
            )}
          </div>

          {/* 展开时显示子节点 */}
          {isExpanded && node.children && node.children.length > 0 && (
            <div>
              {node.children.map(child => renderNode(child, workspaceId, level + 1))}
            </div>
          )}
        </div>
      );
    }

    // 文件节点
    const language = node.language || getLanguageFromPath(node.path);

    return (
      <div
        key={key}
        className={clsx(
          'flex items-center gap-2 py-1.5 px-2 rounded cursor-pointer transition-colors',
          isSelected ? 'bg-primary-faint text-primary' : 'hover:bg-background-hover'
        )}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={async (e) => {
          // 阻止事件冒泡到文件夹的 toggleFolder
          e.stopPropagation();

          // 切换选中状态
          setSelected(prev => {
            const next = new Set(prev);
            if (next.has(key)) {
              next.delete(key);
            } else {
              next.add(key);
            }
            return next;
          });

          // 如果是第一次选中，预加载 Token 估算
          if (!fileTokens.has(key)) {
            try {
              const content = await tauri.getFileContent(node.path);
              const estimated = estimateTokens(content);
              setFileTokens(prev => {
                const next = new Map(prev);
                next.set(key, estimated);
                return next;
              });
            } catch (err) {
              // 使用估算值
              setFileTokens(prev => {
                const next = new Map(prev);
                next.set(key, 500);
                return next;
              });
            }
          }
        }}
      >
        <div className={clsx(
          'w-5 h-5 rounded flex items-center justify-center border',
          isSelected ? 'border-primary bg-primary' : 'border-border'
        )}>
          {isSelected && <Check className="w-3 h-3 text-white" />}
        </div>
        <File className={clsx('w-4 h-4', LANGUAGE_COLORS[language] || 'text-text-muted')} />
        <span className="flex-1 text-sm text-text-primary truncate">{node.name}</span>
        {tokens > 0 && (
          <span className="text-xs text-text-tertiary">{tokens}t</span>
        )}
      </div>
    );
  }, [selected, expandedFolders, storeLoadingFolders, loadingRoots, fileTokens, toggleFolder, estimateTokens]);

  // 懒加载工作区根目录 - 使用 ref 避免重复加载
  useEffect(() => {
    const loadRoots = async () => {
      for (const { rootPath, workspace } of workspacesTrees) {
        // 跳过已加载的根目录
        if (loadedRootsRef.current.has(rootPath)) {
          // 如果已经加载但本地 expandedFolders 没有，添加进去
          if (!expandedFolders.has(rootPath)) {
            setExpandedFolders(prev => new Set([...prev, rootPath]));
          }
          continue;
        }

        // 标记为正在加载
        setLoadingRoots(prev => new Set([...prev, rootPath]));

        try {
          await load_folder_content(rootPath);
          loadedRootsRef.current.add(rootPath);
          // 加载完成后展开
          setExpandedFolders(prev => new Set([...prev, rootPath]));
        } catch (err) {
          console.error('加载工作区根目录失败:', rootPath, err);
          setError(`加载工作区 ${workspace.name} 失败`);
        } finally {
          setLoadingRoots(prev => {
            const next = new Set(prev);
            next.delete(rootPath);
            return next;
          });
        }
      }
    };

    loadRoots();
  }, [workspacesTrees]); // 只在 workspacesTrees 变化时执行

  // 获取选中的文件列表
  const selectedCount = selected.size;
  const selectedFilesList = useMemo(() => {
    const files: FileReference[] = [];
    selected.forEach(key => {
      const parts = key.split(':');
      if (parts.length < 2) return;
      const workspaceId = parts[0];
      const pathParts = parts.slice(1);
      const path = pathParts.join(':');
      const language = getLanguageFromPath(path);
      const tokens = fileTokens.get(key) || 0;
      files.push({
        workspaceId,
        path,
        type: 'full',
        language,
        estimatedTokens: tokens,
      } as FileReference);
    });
    return files;
  }, [selected, fileTokens]);

  // 确认选择
  const handleConfirm = useCallback(async () => {
    // 直接调用 addFiles，它会处理实际的添加逻辑
    await addFiles(selectedFilesList);
    onConfirm(selectedFilesList);
  }, [selectedFilesList, onConfirm, addFiles]);

  // 搜索过滤
  const filteredWorkspaces = useMemo(() => {
    if (!searchQuery.trim()) {
      return workspacesTrees;
    }
    const query = searchQuery.toLowerCase();
    return workspacesTrees.filter(w =>
      w.rootName.toLowerCase().includes(query)
    );
  }, [workspacesTrees, searchQuery]);

  const totalEstimatedTokens = Array.from(fileTokens.entries())
    .filter(([key]) => selected.has(key))
    .reduce((sum, [, tokens]) => sum + tokens, 0);

  const isLoadingRoot = loadingRoots.size > 0;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background-elevated rounded-xl shadow-xl w-full max-w-3xl max-h-[80vh] flex flex-col">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-text-primary">添加文件到上下文</h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-background-hover text-text-muted hover:text-text-primary transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 搜索框 */}
        <div className="px-6 py-3 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="搜索工作区..."
              className="w-full pl-10 pr-4 py-2 bg-background-surface border border-border rounded-lg text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="mx-6 mt-3 p-3 bg-error-faint border border-error/30 rounded-lg text-error text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* 文件树 */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {isLoadingRoot ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 text-text-muted animate-spin mr-2" />
              <span className="text-sm text-text-muted">正在加载工作区...</span>
            </div>
          ) : filteredWorkspaces.length === 0 ? (
            <div className="text-center text-text-muted py-8">
              未找到匹配的工作区
            </div>
          ) : (
            filteredWorkspaces.map(({ workspace, rootPath, rootName }) => {
              // 构建带子节点的完整树
              const treeNodes = buildTreeWithChildren(
                rootPath,
                get_cached_folder_content,
                storeLoadingFolders
              );

              if (treeNodes.length === 0) {
                return (
                  <div key={workspace.id} className="mb-4">
                    <div className="flex items-center gap-2 px-2 py-2 mb-1 bg-background-subtle rounded-lg">
                      <span className="text-sm font-medium text-text-primary">{rootName}</span>
                      <span className="text-xs text-text-muted truncate max-w-[200px]">{rootPath}</span>
                    </div>
                    <div className="text-sm text-text-muted px-4 py-2">
                      {storeLoadingFolders.has(rootPath) ? '加载中...' : '空目录'}
                    </div>
                  </div>
                );
              }

              return (
                <div key={workspace.id} className="mb-4">
                  <div className="flex items-center gap-2 px-2 py-2 mb-1 bg-background-subtle rounded-lg">
                    <span className="text-sm font-medium text-text-primary">{rootName}</span>
                    <span className="text-xs text-text-muted truncate max-w-[200px]">{rootPath}</span>
                  </div>

                  {/* 工作区文件树 */}
                  {treeNodes.map(node => renderNode(node, workspace.id, 0))}
                </div>
              );
            })
          )}
        </div>

        {/* 底部栏 */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border">
          <div className="text-sm text-text-secondary">
            已选择 <span className="font-medium text-text-primary">{selectedCount}</span> 个文件，
            预计约 <span className="font-medium text-text-primary">
              {totalEstimatedTokens > 0 ? totalEstimatedTokens.toLocaleString() : '...'}
            </span> Tokens
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm text-text-secondary hover:bg-background-hover transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleConfirm}
              disabled={selectedCount === 0}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              确定
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
