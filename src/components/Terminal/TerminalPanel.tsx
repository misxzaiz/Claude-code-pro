/**
 * Terminal Panel Component
 *
 * 命令执行终端 - 用户输入命令，显示执行结果
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { terminalExecuteCommand, terminalGetSystemInfo } from '../../services/tauri';

interface TerminalPanelProps {
  /** 工作目录 */
  workingDir?: string;
  /** 终端关闭时的回调 */
  onClosed?: () => void;
}

export function TerminalPanel({
  workingDir,
  onClosed,
}: TerminalPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const inputBufferRef = useRef('');

  // 初始化终端
  useEffect(() => {
    if (isInitialized || !containerRef.current) return;

    const terminal = new Terminal({
      theme: {
        background: '#0d1117',
        foreground: '#e6edf3',
        cursor: '#58a6ff',
        cursorAccent: '#0d1117',
        selectionBackground: 'rgba(88, 166, 255, 0.25)',
        black: '#484f58',
        red: '#ff7b72',
        green: '#3fb950',
        yellow: '#d29922',
        blue: '#58a6ff',
        magenta: '#d2a8ff',
        cyan: '#76e3ea',
        white: '#e6edf3',
        brightBlack: '#6e7681',
        brightRed: '#ffa198',
        brightGreen: '#56d364',
        brightYellow: '#e3b341',
        brightBlue: '#79c0ff',
        brightMagenta: '#d2a8ff',
        brightCyan: '#b392f0',
        brightWhite: '#ffffff',
      },
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'SF Mono', 'Consolas', monospace",
      fontSize: 14,
      lineHeight: 1.5,
      cursorBlink: true,
      cursorStyle: 'block',
      scrollback: 1000,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(containerRef.current);

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    setTimeout(() => fitAddon.fit(), 100);

    // 监听用户输入
    terminal.onData((data) => {
      handleTerminalInput(data);
    });

    setIsInitialized(true);

    // 初始化欢迎信息
    initTerminal();

    return () => {
      terminal.dispose();
    };
  }, []);

  // 初始化终端
  const initTerminal = async () => {
    try {
      const sysInfo = await terminalGetSystemInfo();

      if (terminalRef.current) {
        terminalRef.current.writeln('');
        terminalRef.current.writeln('\x1b[1;34m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m');
        terminalRef.current.writeln('\x1b[1;34m Polaris Terminal \x1b[0m');
        terminalRef.current.writeln('\x1b[1;34m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m');
        terminalRef.current.writeln('');
        terminalRef.current.writeln(`  OS: \x1b[33m${sysInfo.os}\x1b[0m (${sysInfo.arch})`);
        terminalRef.current.writeln(`  工作目录: \x1b[32m${sysInfo.current_dir}\x1b[0m`);
        terminalRef.current.writeln('');
        terminalRef.current.writeln('\x1b[90m提示: 输入命令按回车执行，clear 清屏，exit 关闭终端\x1b[0m');
        terminalRef.current.writeln('');
        showPrompt();
      }
    } catch (error) {
      console.error('[Terminal] 初始化失败:', error);
      if (terminalRef.current) {
        terminalRef.current.writeln('\x1b[31m终端初始化失败\x1b[0m');
      }
    }
  };

  // 获取 shell 提示符
  const getShellPrompt = (): string => {
    if (workingDir) {
      const dirName = workingDir.split(/[\\/]/).pop() || workingDir;
      return `\x1b[32m${dirName}\x1b[0m\x1b[90m>\x1b[0m `;
    }
    return '\x1b[90m$\x1b[0m ';
  };

  // 显示提示符
  const showPrompt = () => {
    const prompt = getShellPrompt();
    if (terminalRef.current) {
      terminalRef.current.write(prompt);
    }
  };

  // 处理终端输入
  const handleTerminalInput = useCallback((data: string) => {
    if (!terminalRef.current) return;

    const code = data.charCodeAt(0);

    // 回车键 - 执行命令
    if (code === 13) {
      terminalRef.current.write('\r\n');
      const command = inputBufferRef.current.trim();

      if (command) {
        executeCommand(command);
      } else {
        showPrompt();
      }

      inputBufferRef.current = '';
      return;
    }

    // 退格键
    if (code === 127) {
      if (inputBufferRef.current.length > 0) {
        inputBufferRef.current = inputBufferRef.current.slice(0, -1);
        terminalRef.current.write('\b \b');
      }
      return;
    }

    // Ctrl+C
    if (code === 3) {
      inputBufferRef.current = '';
      terminalRef.current.write('^C\r\n');
      showPrompt();
      return;
    }

    // 可打印字符
    if (code >= 32) {
      inputBufferRef.current += data;
      terminalRef.current.write(data);
    }
  }, []);

  // 执行命令
  const executeCommand = async (commandLine: string) => {
    if (!terminalRef.current) return;

    // 处理内置命令
    if (commandLine.toLowerCase() === 'clear') {
      terminalRef.current.clear();
      showPrompt();
      return;
    }

    if (commandLine.toLowerCase() === 'exit') {
      terminalRef.current.writeln('\x1b[33m终端已关闭\x1b[0m');
      onClosed?.();
      return;
    }

    // 解析命令和参数
    const parts = commandLine.split(/\s+/);
    const cmd = parts[0];
    const args = parts.slice(1);

    // 显示执行中
    terminalRef.current.write('\x1b[90m执行中...\x1b[0m\r\n');

    try {
      const result = await terminalExecuteCommand(cmd, args, workingDir);

      if (result) {
        terminalRef.current.write(result);
      }
      terminalRef.current.write('\r\n');
    } catch (error) {
      const errorMsg = String(error);
      const match = errorMsg.match(/"([^"]+)"/);
      const cleanError = match ? match[1] : errorMsg;
      terminalRef.current.write(`\x1b[31m错误: ${cleanError}\x1b[0m\r\n`);
    }

    showPrompt();
  };

  // 自适应大小
  useEffect(() => {
    if (!isInitialized || !fitAddonRef.current) return;

    const fitTerminal = () => {
      try {
        fitAddonRef.current?.fit();
      } catch (e) {
        // 忽略
      }
    };

    fitTerminal();

    const resizeObserver = new ResizeObserver(() => fitTerminal());
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, [isInitialized]);

  // 清除终端
  const clearTerminal = useCallback(() => {
    if (terminalRef.current) {
      terminalRef.current.clear();
      showPrompt();
    }
  }, []);

  return (
    <div className="flex flex-col h-full bg-[#0d1117]">
      {/* 终端头部工具栏 */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#161b22] border-b border-[#30363d]">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-xs text-gray-400">就绪</span>
          </div>
          {workingDir && (
            <span className="text-xs text-gray-500 font-mono truncate max-w-[200px]">
              {workingDir}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* 清除按钮 */}
          <button
            onClick={clearTerminal}
            className="p-1 rounded hover:bg-[#21262d] text-gray-400 hover:text-gray-200 transition-colors"
            title="清除终端"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        </div>
      </div>

      {/* 终端容器 */}
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden"
        style={{ minHeight: '200px' }}
      />
    </div>
  );
}
