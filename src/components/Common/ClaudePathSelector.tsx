/**
 * Claude CLI 路径选择器组件
 * 支持自动检测和手动输入两种模式
 */

import { useState, useEffect } from 'react';
import * as tauri from '../../services/tauri';

interface ClaudePathSelectorProps {
  /** 当前路径值 */
  value: string;
  /** 路径变更回调 */
  onChange: (path: string) => void;
  /** 是否禁用 */
  disabled?: boolean;
  /** 是否显示紧凑模式（用于连接蒙版） */
  compact?: boolean;
  /** 错误提示 */
  error?: string;
  /** 占位符文本 */
  placeholder?: string;
}

type InputMode = 'auto' | 'manual';

export function ClaudePathSelector({
  value,
  onChange,
  disabled = false,
  compact = false,
  error,
  placeholder,
}: ClaudePathSelectorProps) {
  const [mode, setMode] = useState<InputMode>('auto');
  const [detectedPaths, setDetectedPaths] = useState<string[]>([]);
  const [detecting, setDetecting] = useState(false);
  const [validating, setValidating] = useState(false);
  const [isValid, setIsValid] = useState<boolean | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  // 检测所有可用的 Claude 路径
  const detectPaths = async () => {
    setDetecting(true);
    try {
      const paths = await tauri.findClaudePaths();
      setDetectedPaths(paths);

      // 如果有检测结果且当前值为空，自动选择第一个
      if (paths.length > 0 && !value) {
        onChange(paths[0]);
      }
    } catch (e) {
      console.error('检测 Claude 路径失败:', e);
      setDetectedPaths([]);
    } finally {
      setDetecting(false);
    }
  };

  // 验证路径是否有效
  const validatePath = async (path: string) => {
    if (!path.trim()) {
      setIsValid(null);
      setValidationError(null);
      return;
    }

    setValidating(true);
    try {
      const result = await tauri.validateClaudePath(path);
      setIsValid(result.valid);
      setValidationError(result.error || null);
    } catch (e) {
      setIsValid(false);
      setValidationError(e instanceof Error ? e.message : '验证失败');
    } finally {
      setValidating(false);
    }
  };

  // 组件加载时自动检测
  useEffect(() => {
    detectPaths();
  }, []);

  // 切换模式时重新检测
  useEffect(() => {
    if (mode === 'auto') {
      detectPaths();
    }
  }, [mode]);

  return (
    <div className="space-y-3">
      {/* 模式切换 */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setMode('auto')}
          disabled={disabled}
          className={`flex-1 px-3 py-2 text-sm rounded-lg border transition-colors ${
            mode === 'auto'
              ? 'bg-primary/10 border-primary text-primary'
              : 'bg-background-surface border-border text-text-secondary hover:border-border-hover'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          自动检测
        </button>
        <button
          type="button"
          onClick={() => setMode('manual')}
          disabled={disabled}
          className={`flex-1 px-3 py-2 text-sm rounded-lg border transition-colors ${
            mode === 'manual'
              ? 'bg-primary/10 border-primary text-primary'
              : 'bg-background-surface border-border text-text-secondary hover:border-border-hover'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          手动输入
        </button>
      </div>

      {/* 自动检测模式 */}
      {mode === 'auto' && (
        <div className="space-y-2">
          <div className="flex items-stretch gap-2">
            <div className="flex-1 min-w-0 relative">
              <select
                value={value}
                onChange={(e) => onChange(e.target.value)}
                disabled={disabled || detecting || detectedPaths.length === 0}
                className={`w-full px-3 py-2 pr-8 bg-background-surface border rounded-l-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-primary focus:z-10 ${
                  error ? 'border-danger' : 'border-border'
                } ${disabled || detecting ? 'opacity-50' : ''}`}
              >
                <option value="">请选择 Claude CLI 路径</option>
                {detectedPaths.map((path) => (
                  <option key={path} value={path}>
                    {path}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={detectPaths}
              disabled={disabled || detecting}
              className="px-3 bg-background-surface border border-l-0 border-border rounded-r-lg hover:border-border-hover transition-colors disabled:opacity-50 flex items-center justify-center"
              title="重新检测"
            >
              <svg
                className={`w-4 h-4 ${detecting ? 'animate-spin' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            </button>
          </div>

          {/* 检测结果提示 */}
          {detectedPaths.length === 0 && !detecting && (
            <p className="text-xs text-text-tertiary">
              未检测到 Claude CLI，请确认已安装或尝试手动输入路径
            </p>
          )}
          {detectedPaths.length > 0 && (
            <p className="text-xs text-text-tertiary">
              检测到 {detectedPaths.length} 个可用路径
            </p>
          )}
        </div>
      )}

      {/* 手动输入模式 */}
      {mode === 'manual' && (
        <div className="space-y-2">
          <div className="relative">
            <input
              type="text"
              value={value}
              onChange={(e) => {
                onChange(e.target.value);
                validatePath(e.target.value);
              }}
              disabled={disabled || validating}
              className={`w-full px-3 py-2 pr-10 bg-background-surface border rounded-lg text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary ${
                error ? 'border-danger' : 'border-border'
              } ${disabled || validating ? 'opacity-50' : ''}`}
              placeholder={placeholder || "请输入 Claude CLI 的完整路径"}
            />
            {/* 验证状态图标 */}
            {value && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {validating ? (
                  <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                ) : isValid === true ? (
                  <svg className="w-5 h-5 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : isValid === false ? (
                  <svg className="w-5 h-5 text-danger" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : null}
              </div>
            )}
          </div>

          {/* 验证结果提示 */}
          {validationError && (
            <p className="text-xs text-danger">{validationError}</p>
          )}
          {isValid === true && !compact && (
            <p className="text-xs text-success">路径有效，可以正常使用</p>
          )}
          <p className="text-xs text-text-tertiary">
            例如: C:\Users\[用户名]\AppData\Roaming\npm\claude.cmd
          </p>
        </div>
      )}

      {/* 错误提示 */}
      {error && (
        <p className="text-xs text-danger">{error}</p>
      )}
    </div>
  );
}
