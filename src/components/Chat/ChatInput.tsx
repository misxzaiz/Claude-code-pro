/**
 * 聊天输入组件 - 支持斜杠命令、工作区引用和文件引用
 *
 * 支持的语法：
 * - /command          斜杠命令
 * - @workspace/path  引用指定工作区的文件
 * - @/path           引用当前工作区的文件
 * - @path            引用当前工作区的文件
 */

import { useState, useRef, KeyboardEvent, useEffect, useCallback, useMemo } from 'react';
import { Button } from '../Common';
import { IconSend, IconStop } from '../Common/Icons';
import { useCommandStore, useWorkspaceStore } from '../../stores';
import { parseCommandInput, generateCommandsListMessage, generateHelpMessage } from '../../services/commandService';
import { FileSuggestion, CommandSuggestion, WorkspaceSuggestion } from './FileSuggestion';
import type { FileMatch } from '../../services/fileSearch';
import type { Workspace } from '../../types';
import { AutoResizingTextarea } from './AutoResizingTextarea';
import { useFileSearch } from '../../hooks/useFileSearch';

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  isStreaming?: boolean;
  onInterrupt?: () => void;
}

type SuggestionMode = 'command' | 'workspace' | 'file' | null;

export function ChatInput({
  onSend,
  disabled = false,
  isStreaming = false,
  onInterrupt
}: ChatInputProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 命令建议状态
  const [showCommandSuggestions, setShowCommandSuggestions] = useState(false);
  const [commandQuery, setCommandQuery] = useState('');
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);
  const [commandPosition, setCommandPosition] = useState({ top: 0, left: 0 });

  // 工作区建议状态
  const [showWorkspaceSuggestions, setShowWorkspaceSuggestions] = useState(false);
  const [selectedWorkspaceIndex, setSelectedWorkspaceIndex] = useState(0);
  const [workspaceQuery, setWorkspaceQuery] = useState('');
  const [workspacePosition, setWorkspacePosition] = useState({ top: 0, left: 0 });

  // 文件建议状态
  const [showFileSuggestions, setShowFileSuggestions] = useState(false);
  const [selectedFileIndex, setSelectedFileIndex] = useState(0);
  const [filePosition, setFilePosition] = useState({ top: 0, left: 0 });
  const [fileWorkspace, setFileWorkspace] = useState<Workspace | null>(null);  // 当前搜索的工作区

  const { getCommands, searchCommands } = useCommandStore();
  const { currentWorkspaceId, workspaces } = useWorkspaceStore();
  const { fileMatches, searchFiles, clearResults } = useFileSearch();

  // 缓存命令搜索结果
  const suggestedCommands = useMemo(
    () => searchCommands(commandQuery),
    [commandQuery, searchCommands]
  );

  // 过滤工作区列表
  const filteredWorkspaces = useMemo(
    () => workspaces.filter(w =>
      w.name.toLowerCase().includes(workspaceQuery.toLowerCase())
    ),
    [workspaces, workspaceQuery]
  );

  // 当前建议模式
  const suggestionMode: SuggestionMode = useMemo(() => {
    if (showCommandSuggestions) return 'command';
    if (showWorkspaceSuggestions) return 'workspace';
    if (showFileSuggestions) return 'file';
    return null;
  }, [showCommandSuggestions, showWorkspaceSuggestions, showFileSuggestions]);

  // 检测触发符
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setValue(newValue);

    const textarea = textareaRef.current;
    if (!textarea || !containerRef.current) return;

    const cursorPosition = textarea.selectionStart;
    const textBeforeCursor = newValue.slice(0, cursorPosition);

    // 优先检测 @ 符号相关触发（工作区引用和文件引用）
    // 统一使用 : 作为工作区分隔符，/ 只用于命令触发

    // 1. 检测跨工作区引用 (@workspace:path)
    // 使用冒号作为工作区名和路径的分隔符
    // 正则说明：
    //   - @([\w\u4e00-\u9fa5-]+) 捕获工作区名
    //   - (:) 捕获分隔符（冒号，确认用户输入了完整的工作区引用语法）
    //   - ([^\s]*) 捕获路径部分
    const workspaceMatch = textBeforeCursor.match(/@([\w\u4e00-\u9fa5-]+):([^\s]*)$/);
    if (workspaceMatch) {
      const workspaceName = workspaceMatch[1];
      const pathPart = workspaceMatch[2] || '';

      // 查找工作区
      const matchedWorkspace = workspaces.find(w =>
        w.name.toLowerCase() === workspaceName.toLowerCase()
      );

      // 如果找到了工作区，切换到文件搜索模式
      if (matchedWorkspace) {
        setShowWorkspaceSuggestions(false);
        setShowFileSuggestions(true);
        setShowCommandSuggestions(false);
        setFileWorkspace(matchedWorkspace);
        setSelectedFileIndex(0);
        // 搜索该工作区的文件
        searchFiles(pathPart, matchedWorkspace);

        const rect = textarea.getBoundingClientRect();
        // fixed 定位直接使用相对于视口的位置
        // 列表底部在输入框顶部上方，留 8px 间隙
        // max-h-60 = 240px，加上一些缓冲空间
        setFilePosition({
          top: rect.top - 260 - 8,
          left: rect.left,
        });
        return;
      }

      // 未找到工作区，显示工作区列表供用户选择
      setShowWorkspaceSuggestions(true);
      setShowFileSuggestions(false);
      setShowCommandSuggestions(false);
      setWorkspaceQuery(workspaceName);
      setSelectedWorkspaceIndex(0);

      const rect = textarea.getBoundingClientRect();
      // fixed 定位直接使用相对于视口的位置
      // 列表底部在输入框顶部上方，留 8px 间隙
      setWorkspacePosition({
        top: rect.top - 260 - 8,
        left: rect.left,
      });
      return;
    }

    // 检测用户正在输入工作区名（@workspace 还没有冒号）
    const partialWorkspaceMatch = textBeforeCursor.match(/@([\w\u4e00-\u9fa5-]*)$/);
    if (partialWorkspaceMatch) {
      const workspaceName = partialWorkspaceMatch[1];

      // 如果有输入内容，显示工作区列表
      if (workspaceName.length > 0) {
        setShowWorkspaceSuggestions(true);
        setShowFileSuggestions(false);
        setShowCommandSuggestions(false);
        setWorkspaceQuery(workspaceName);
        setSelectedWorkspaceIndex(0);

        const rect = textarea.getBoundingClientRect();
        // fixed 定位直接使用相对于视口的位置
        // 列表底部在输入框顶部上方，留 8px 间隙
        setWorkspacePosition({
          top: rect.top - 260 - 8,
          left: rect.left,
        });
        return;
      }
    }

    // 2. 检测当前工作区文件引用 (@/path)
    const fileMatch = textBeforeCursor.match(/@\/(.*)$/);
    if (fileMatch) {
      setShowWorkspaceSuggestions(false);
      setShowFileSuggestions(true);
      setShowCommandSuggestions(false);
      setFileWorkspace(null);  // null 表示当前工作区
      setSelectedFileIndex(0);
      searchFiles(fileMatch[1]);

      const rect = textarea.getBoundingClientRect();
      // fixed 定位直接使用相对于视口的位置
      // 列表底部在输入框顶部上方，留 8px 间隙
      setFilePosition({
        top: rect.top - 260 - 8,
        left: rect.left,
      });
      return;
    }

    // 3. 检测命令触发 (/)
    // 只有在非 @ 上下文中才触发命令建议
    const commandMatch = textBeforeCursor.match(/\/([^\s]*)$/);
    if (commandMatch) {
      setCommandQuery(commandMatch[1]);
      setSelectedCommandIndex(0);
      setShowCommandSuggestions(true);
      setShowWorkspaceSuggestions(false);
      setShowFileSuggestions(false);

      const rect = textarea.getBoundingClientRect();
      // fixed 定位直接使用相对于视口的位置
      // 列表底部在输入框顶部上方，留 8px 间隙
      setCommandPosition({
        top: rect.top - 260 - 8,
        left: rect.left,
      });
      return;
    }

    // 隐藏所有建议
    setShowCommandSuggestions(false);
    setShowWorkspaceSuggestions(false);
    setShowFileSuggestions(false);
    clearResults();
  }, [workspaces, searchFiles, clearResults]);

  // 选择命令
  const selectCommand = useCallback((name: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const cursorPosition = textarea.selectionStart;
    const textBeforeCursor = value.slice(0, cursorPosition);
    const textAfterCursor = value.slice(cursorPosition);

    const newText = textBeforeCursor.replace(/\/[^\s]*$/, `/${name} `) + textAfterCursor;
    setValue(newText);
    setShowCommandSuggestions(false);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(newText.length - textAfterCursor.length, newText.length - textAfterCursor.length);
    }, 0);
  }, [value]);

  // 选择工作区
  const selectWorkspace = useCallback((workspace: Workspace) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const cursorPosition = textarea.selectionStart;
    const textBeforeCursor = value.slice(0, cursorPosition);
    const textAfterCursor = value.slice(cursorPosition);

    // 替换 @workspace 为 @workspace:
    const newText = textBeforeCursor.replace(/@[\w\u4e00-\u9fa5-]*$/, `@${workspace.name}:`) + textAfterCursor;
    setValue(newText);
    setShowWorkspaceSuggestions(false);

    // 自动触发文件搜索
    setTimeout(() => {
      textarea.focus();
      const newCursorPos = newText.length - textAfterCursor.length;
      textarea.setSelectionRange(newCursorPos, newCursorPos);

      // 触发文件搜索
      const inputEvent = new Event('input', { bubbles: true });
      textarea.dispatchEvent(inputEvent);
    }, 0);
  }, [value]);

  // 选择文件
  const selectFile = useCallback((file: FileMatch) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const cursorPosition = textarea.selectionStart;
    const textBeforeCursor = value.slice(0, cursorPosition);
    const textAfterCursor = value.slice(cursorPosition);

    // 根据是否有工作区前缀决定替换模式
    let replacement: string;
    if (fileWorkspace) {
      // @workspace:path 模式（跨工作区引用）
      replacement = textBeforeCursor.replace(/@[\w\u4e00-\u9fa5-]+:[^\s]*$/, `@${fileWorkspace.name}:${file.relativePath} `);
    } else {
      // @/path 模式（当前工作区）
      replacement = textBeforeCursor.replace(/@\/[^\s]*$/, `@/${file.relativePath} `);
    }

    const newText = replacement + textAfterCursor;
    setValue(newText);
    setShowFileSuggestions(false);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(newText.length - textAfterCursor.length, newText.length - textAfterCursor.length);
    }, 0);
  }, [value, fileWorkspace]);

  // 键盘事件处理
  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      // 如果建议框打开，选择建议
      if (showCommandSuggestions) {
        e.preventDefault();
        if (suggestedCommands.length > 0) {
          selectCommand(suggestedCommands[selectedCommandIndex].name);
        }
        return;
      }

      if (showWorkspaceSuggestions) {
        e.preventDefault();
        if (filteredWorkspaces.length > 0) {
          selectWorkspace(filteredWorkspaces[selectedWorkspaceIndex]);
        }
        return;
      }

      if (showFileSuggestions) {
        e.preventDefault();
        if (fileMatches.length > 0) {
          selectFile(fileMatches[selectedFileIndex]);
        }
        return;
      }

      // 正常发送
      e.preventDefault();
      handleSend();
      return;
    }

    // 上下箭头选择建议
    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') &&
        (showCommandSuggestions || showWorkspaceSuggestions || showFileSuggestions)) {
      e.preventDefault();

      let items: any[] = [];
      let setState: (fn: (prev: number) => number) => void;

      if (showCommandSuggestions) {
        items = suggestedCommands;
        setState = setSelectedCommandIndex;
      } else if (showWorkspaceSuggestions) {
        items = filteredWorkspaces;
        setState = setSelectedWorkspaceIndex;
      } else {
        items = fileMatches;
        setState = setSelectedFileIndex;
      }

      if (items.length === 0) return;

      const maxIndex = items.length - 1;
      const direction = e.key === 'ArrowUp' ? -1 : 1;

      setState(prev => {
        const newIndex = prev + direction;
        if (newIndex < 0) return maxIndex;
        if (newIndex > maxIndex) return 0;
        return newIndex;
      });
      return;
    }

    // ESC 关闭建议
    if (e.key === 'Escape') {
      setShowCommandSuggestions(false);
      setShowWorkspaceSuggestions(false);
      setShowFileSuggestions(false);
      clearResults();
      return;
    }

    // Tab 选择建议
    if (e.key === 'Tab' && !e.shiftKey) {
      if (showCommandSuggestions) {
        e.preventDefault();
        if (suggestedCommands.length > 0) {
          selectCommand(suggestedCommands[selectedCommandIndex].name);
        }
        return;
      }

      if (showWorkspaceSuggestions) {
        e.preventDefault();
        if (filteredWorkspaces.length > 0) {
          selectWorkspace(filteredWorkspaces[selectedWorkspaceIndex]);
        }
        return;
      }

      if (showFileSuggestions) {
        e.preventDefault();
        if (fileMatches.length > 0) {
          selectFile(fileMatches[selectedFileIndex]);
        }
        return;
      }
    }
  }, [
    showCommandSuggestions,
    showWorkspaceSuggestions,
    showFileSuggestions,
    suggestedCommands,
    filteredWorkspaces,
    fileMatches,
    selectedCommandIndex,
    selectedWorkspaceIndex,
    selectedFileIndex,
    selectCommand,
    selectWorkspace,
    selectFile,
    clearResults
  ]);

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled || isStreaming) return;

    // 检查是否是命令
    const commands = getCommands();
    const result = parseCommandInput(trimmed, commands);

    if (result.type === 'command') {
      const { command } = result;
      if (!command) return;

      // 处理内置命令
      if (command.name === 'commands') {
        onSend(generateCommandsListMessage(commands));
        resetInput();
        return;
      }

      if (command.name === 'help') {
        onSend(generateHelpMessage());
        resetInput();
        return;
      }

      // 使用 fullCommand（如果有）或原始命令
      const messageToSend = command.fullCommand || command.raw;
      onSend(messageToSend);
    } else {
      onSend(result.message || '');
    }

    resetInput();
  }, [value, disabled, isStreaming, getCommands, onSend]);

  const resetInput = useCallback(() => {
    setValue('');
    setShowCommandSuggestions(false);
    setShowWorkspaceSuggestions(false);
    setShowFileSuggestions(false);
    clearResults();
  }, [clearResults]);

  // 点击外部关闭建议
  useEffect(() => {
    const handleClickOutside = () => {
      setShowCommandSuggestions(false);
      setShowWorkspaceSuggestions(false);
      setShowFileSuggestions(false);
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  return (
    <div className="border-t border-border p-4 bg-background-elevated" ref={containerRef}>
      <div className="max-w-3xl mx-auto relative">
        <div className="flex items-end gap-3 bg-background-surface border border-border rounded-2xl p-3 focus-within:ring-2 focus-within:ring-border focus-within:border-primary transition-all shadow-soft hover:shadow-medium">
          <AutoResizingTextarea
            ref={textareaRef}
            value={value}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="输入消息... (Enter 发送, Shift+Enter 换行, /命令, @工作区/文件)"
            className="flex-1 px-2 py-1.5 bg-transparent text-text-primary placeholder:text-text-tertiary resize-none outline-none text-sm leading-relaxed"
            disabled={disabled}
            maxHeight={200}
            minHeight={40}
          />

          {isStreaming && onInterrupt ? (
            <Button
              variant="danger"
              size="sm"
              onClick={onInterrupt}
              className="shrink-0 h-9 px-4"
            >
              <IconStop size={14} className="mr-1" />
              中断
            </Button>
          ) : (
            <Button
              onClick={handleSend}
              disabled={disabled || isStreaming || !value.trim()}
              size="sm"
              className="shrink-0 h-9 px-4 shadow-glow"
            >
              <IconSend size={14} className="mr-1" />
              发送
            </Button>
          )}
        </div>

        {/* 状态提示 */}
        <div className="flex items-center justify-between mt-2 px-1">
          <div className="text-xs text-text-tertiary">
            {isStreaming ? (
              <span className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-warning rounded-full animate-pulse" />
                正在生成回复...
              </span>
            ) : suggestionMode === 'workspace' ? (
              <span>选择工作区，然后输入文件路径</span>
            ) : suggestionMode === 'file' ? (
              <span>选择文件</span>
            ) : (
              <span>按 Enter 发送，Shift+Enter 换行，/ 命令，@ 工作区/文件</span>
            )}
          </div>
          <div className="text-xs text-text-tertiary">
            {value.length > 0 && `${value.length} 字符`}
          </div>
        </div>

        {/* 命令建议 */}
        {showCommandSuggestions && suggestedCommands.length > 0 && (
          <CommandSuggestion
            commands={suggestedCommands.map(c => ({ name: c.name, description: c.description }))}
            selectedIndex={selectedCommandIndex}
            onSelect={(cmd) => selectCommand(cmd.name)}
            onHover={setSelectedCommandIndex}
            position={commandPosition}
          />
        )}

        {/* 工作区建议 */}
        {showWorkspaceSuggestions && filteredWorkspaces.length > 0 && (
          <WorkspaceSuggestion
            workspaces={filteredWorkspaces}
            currentWorkspaceId={currentWorkspaceId}
            selectedIndex={selectedWorkspaceIndex}
            onSelect={selectWorkspace}
            onHover={setSelectedWorkspaceIndex}
            position={workspacePosition}
          />
        )}

        {/* 文件建议 */}
        {showFileSuggestions && fileMatches.length > 0 && (
          <FileSuggestion
            files={fileMatches}
            selectedIndex={selectedFileIndex}
            onSelect={selectFile}
            onHover={setSelectedFileIndex}
            position={filePosition}
          />
        )}
      </div>
    </div>
  );
}
