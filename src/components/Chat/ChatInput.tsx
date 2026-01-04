/**
 * 聊天输入组件 - 支持斜杠命令和文件引用
 * 优化版本: 拆分了自适应文本框、提取了自定义Hook、添加了useMemo缓存
 */

import { useState, useRef, KeyboardEvent, useEffect, useCallback, useMemo } from 'react';
import { Button } from '../Common';
import { IconSend, IconStop } from '../Common/Icons';
import { useCommandStore } from '../../stores';
import { parseCommandInput, generateCommandsListMessage, generateHelpMessage } from '../../services/commandService';
import { FileSuggestion, CommandSuggestion } from './FileSuggestion';
import type { FileMatch } from '../../services/fileSearch';
import { AutoResizingTextarea } from './AutoResizingTextarea';
import { useFileSearch } from '../../hooks/useFileSearch';

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  isStreaming?: boolean;
  onInterrupt?: () => void;
}

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

  // 文件建议状态
  const [showFileSuggestions, setShowFileSuggestions] = useState(false);
  const [selectedFileIndex, setSelectedFileIndex] = useState(0);
  const [filePosition, setFilePosition] = useState({ top: 0, left: 0 });

  const { getCommands, searchCommands } = useCommandStore();
  const { fileMatches, searchFiles, clearResults } = useFileSearch();

  // 缓存命令搜索结果
  const suggestedCommands = useMemo(
    () => searchCommands(commandQuery),
    [commandQuery, searchCommands]
  );

  // 自动调整高度已移至 AutoResizingTextarea 组件

  // 检测触发符
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setValue(newValue);

    const textarea = textareaRef.current;
    if (!textarea || !containerRef.current) return;

    const cursorPosition = textarea.selectionStart;
    const textBeforeCursor = newValue.slice(0, cursorPosition);

    // 检测命令触发 (/)
    const commandMatch = textBeforeCursor.match(/\/([^\s]*)$/);
    if (commandMatch && !textBeforeCursor.includes('@')) {
      setCommandQuery(commandMatch[1]);
      setSelectedCommandIndex(0);
      setShowCommandSuggestions(true);
      setShowFileSuggestions(false);

      // 计算位置
      const rect = textarea.getBoundingClientRect();
      const containerRect = containerRef.current.getBoundingClientRect();
      setCommandPosition({
        top: rect.bottom - containerRect.top + 4,
        left: rect.left - containerRect.left,
      });
      return;
    }

    // 检测文件引用触发 (@)
    const fileMatch = textBeforeCursor.match(/@([^\s]*)$/);
    if (fileMatch) {
      setSelectedFileIndex(0);
      setShowFileSuggestions(true);
      setShowCommandSuggestions(false);
      searchFiles(fileMatch[1]);

      // 计算位置
      const rect = textarea.getBoundingClientRect();
      const containerRect = containerRef.current.getBoundingClientRect();
      setFilePosition({
        top: rect.bottom - containerRect.top + 4,
        left: rect.left - containerRect.left,
      });
      return;
    }

    // 隐藏所有建议
    setShowCommandSuggestions(false);
    setShowFileSuggestions(false);
    clearResults();
  }, [searchFiles, clearResults]);

  // 选择命令
  const selectCommand = useCallback((name: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const cursorPosition = textarea.selectionStart;
    const textBeforeCursor = value.slice(0, cursorPosition);
    const textAfterCursor = value.slice(cursorPosition);

    // 替换命令部分
    const newText = textBeforeCursor.replace(/\/[^\s]*$/, `/${name} `) + textAfterCursor;
    setValue(newText);
    setShowCommandSuggestions(false);

    // 恢复焦点
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(newText.length - textAfterCursor.length, newText.length - textAfterCursor.length);
    }, 0);
  }, [value]);

  // 选择文件
  const selectFile = useCallback((file: FileMatch) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const cursorPosition = textarea.selectionStart;
    const textBeforeCursor = value.slice(0, cursorPosition);
    const textAfterCursor = value.slice(cursorPosition);

    // 替换文件引用部分 - 使用相对路径
    const newText = textBeforeCursor.replace(/@[^\s]*$/, `@${file.relativePath} `) + textAfterCursor;
    setValue(newText);
    setShowFileSuggestions(false);

    // 恢复焦点
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(newText.length - textAfterCursor.length, newText.length - textAfterCursor.length);
    }, 0);
  }, [value]);

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
    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && (showCommandSuggestions || showFileSuggestions)) {
      e.preventDefault();

      const items = showCommandSuggestions ? suggestedCommands : fileMatches;
      if (items.length === 0) return;

      const maxIndex = items.length - 1;
      const direction = e.key === 'ArrowUp' ? -1 : 1;

      const setState = showCommandSuggestions ? setSelectedCommandIndex : setSelectedFileIndex;
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
    showFileSuggestions,
    suggestedCommands,
    fileMatches,
    selectedCommandIndex,
    selectedFileIndex,
    selectCommand,
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
    setShowFileSuggestions(false);
    clearResults();
  }, [clearResults]);

  // 点击外部关闭建议
  useEffect(() => {
    const handleClickOutside = () => {
      setShowCommandSuggestions(false);
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
            placeholder="输入消息... (Enter 发送, Shift+Enter 换行, /命令, @文件)"
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
            ) : (
              <span>按 Enter 发送，Shift+Enter 换行，/ 命令，@ 文件</span>
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
