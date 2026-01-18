import { memo, useEffect, useState, useCallback } from 'react';
import { ChevronRight, ChevronDown, Folder, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';
import { FileIcon } from './FileIcon';
import { ContextMenu, isHtmlFile, type ContextMenuItem } from './ContextMenu';
import { useFileExplorerStore, useFileEditorStore } from '../../stores';
import { openInDefaultApp } from '../../services/tauri';
import type { FileInfo } from '../../types';

interface FileTreeNodeProps {
  file: FileInfo;
  level: number;
  isExpanded: boolean;
  isSelected: boolean;
  expandedFolders: Set<string>;
  loadingFolders: Set<string>;
}

export const FileTreeNode = memo<FileTreeNodeProps>(({
  file,
  level,
  isExpanded,
  isSelected,
  expandedFolders,
  loadingFolders,
}) => {
  const { load_folder_content, get_cached_folder_content, toggle_folder, select_file } = useFileExplorerStore();
  const { openFile } = useFileEditorStore();

  // 右键菜单状态
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
  }>({ visible: false, x: 0, y: 0 });

  // 懒加载逻辑：展开文件夹时加载内容
  useEffect(() => {
    if (file.is_dir && isExpanded) {
      const cached = get_cached_folder_content(file.path);
      
      // 如果没有缓存且没有子项，触发加载
      if (!cached && (!file.children || file.children.length === 0)) {
        load_folder_content(file.path);
      }
    }
  }, [file.is_dir, file.path, isExpanded, file.children, load_folder_content, get_cached_folder_content]);

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();

    if (file.is_dir) {
      // 直接调用 store 的 toggle_folder
      toggle_folder(file.path);

      // 展开时检查是否需要加载内容
      if (!isExpanded) {
        const cached = get_cached_folder_content(file.path);

        // 如果没有缓存且没有子项，触发加载
        if (!cached && (!file.children || file.children.length === 0)) {
          await load_folder_content(file.path);
        }
      }
    } else {
      // 直接调用 store 的 openFile
      await openFile(file.path, file.name);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick(e as any);
    }
  };

  // 检查是否正在加载
  const isLoading = file.is_dir && loadingFolders.has(file.path);

  // 检查是否有子内容
  const hasChildren = file.children && file.children.length > 0;

  // 关闭右键菜单
  const closeContextMenu = useCallback(() => {
    setContextMenu({ visible: false, x: 0, y: 0 });
  }, []);

  // 右键菜单处理
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // 选中当前文件
    select_file(file);

    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
    });
  }, [file, select_file]);

  // 构建菜单项
  const getMenuItems = useCallback((): ContextMenuItem[] => {
    const items: ContextMenuItem[] = [
      {
        id: 'open',
        label: file.is_dir ? '打开文件夹' : '打开文件',
        icon: file.is_dir ? '📂' : '📄',
        action: async () => {
          if (file.is_dir) {
            toggle_folder(file.path);
          } else {
            await openFile(file.path, file.name);
          }
        },
      },
    ];

    // HTML 文件添加"在浏览器中打开"选项
    if (isHtmlFile(file)) {
      items.push({
        id: 'open-in-browser',
        label: '在浏览器中打开',
        icon: '🌐',
        action: async () => {
          await openInDefaultApp(file.path);
        },
      });
    }

    return items;
  }, [file, toggle_folder, openFile]);

  return (
    <div>
      <div
        className={clsx(
          'flex items-center px-2 py-1.5 cursor-pointer rounded transition-colors',
          'hover:bg-background-hover',
          isSelected && 'bg-primary/20 border-l-2 border-primary'
        )}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={0}
        aria-label={file.is_dir ? `文件夹 ${file.name}` : `文件 ${file.name}`}
      >
        {/* 展开/收起图标 - 使用 lucide-react 图标 */}
        {file.is_dir && (
          <span className="mr-1 flex-shrink-0">
            {isLoading ? (
              <Loader2 className="w-3.5 h-3.5 text-text-muted animate-spin" />
            ) : isExpanded ? (
              <ChevronDown className="w-3.5 h-3.5 text-text-muted" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-text-muted" />
            )}
          </span>
        )}

        {/* 占位符（非目录文件） */}
        {!file.is_dir && <span className="mr-1 w-3.5 flex-shrink-0" />}

        {/* 文件/文件夹图标 */}
        {file.is_dir ? (
          <Folder className={clsx(
            'mr-2 w-4 h-4 flex-shrink-0',
            isExpanded ? 'text-primary' : 'text-text-muted'
          )} />
        ) : (
          <FileIcon
            file={file}
            className="mr-2 w-4 h-4 flex-shrink-0"
          />
        )}

        {/* 文件名 */}
        <span
          className="text-sm text-text-primary truncate flex-1 min-w-0"
          title={file.name}
        >
          {file.name}
        </span>
      </div>
      
      {/* 子文件 */}
      {file.is_dir && isExpanded && hasChildren && (
        <div className="animate-in slide-in-from-top-1 duration-200">
          {file.children?.map(child => (
            <FileTreeNode
              key={child.path}
              file={child}
              level={level + 1}
              isExpanded={expandedFolders.has(child.path)}
              isSelected={false}
              expandedFolders={expandedFolders}
              loadingFolders={loadingFolders}
            />
          ))}
        </div>
      )}
      
      {/* 加载中提示 */}
      {file.is_dir && isExpanded && isLoading && (
        <div 
          style={{ paddingLeft: `${(level + 1) * 16 + 8}px` }} 
          className="text-xs text-text-tertiary py-1 animate-pulse"
        >
          加载中...
        </div>
      )}
      
      {/* 空文件夹提示 */}
      {file.is_dir && isExpanded && !isLoading && !hasChildren && (
        <div
          style={{ paddingLeft: `${(level + 1) * 16 + 8}px` }}
          className="text-xs text-text-tertiary py-1 italic"
        >
          空文件夹
        </div>
      )}

      {/* 右键菜单 */}
      <ContextMenu
        visible={contextMenu.visible}
        x={contextMenu.x}
        y={contextMenu.y}
        items={getMenuItems()}
        onClose={closeContextMenu}
      />
    </div>
  );
});

FileTreeNode.displayName = 'FileTreeNode';