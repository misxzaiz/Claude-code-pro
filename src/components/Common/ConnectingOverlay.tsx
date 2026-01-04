/**
 * 连接中蒙板组件
 */

import { useState } from 'react';
import { useConfigStore } from '../../stores';
import { Button, ClaudePathSelector } from './index';

export function ConnectingOverlay() {
  const { config, healthStatus, connectionState, error, retryConnection } = useConfigStore();
  const [showPathInput, setShowPathInput] = useState(false);
  const [tempPath, setTempPath] = useState(config?.claudeCmd || '');

  const handleRetry = async () => {
    await retryConnection();
  };

  const handlePathSubmit = async () => {
    if (!tempPath.trim()) return;
    await retryConnection(tempPath.trim());
    setShowPathInput(false);
  };

  const isConnecting = connectionState === 'connecting';
  const isFailed = connectionState === 'failed';

  return (
    <div className="fixed inset-0 bg-background-base flex items-center justify-center z-50">
      <div className="text-center space-y-6">
        {/* 加载动画或错误图标 */}
        <div className="flex items-center justify-center">
          {isConnecting ? (
            <div className="relative">
              {/* 外圈 */}
              <div className="w-16 h-16 border-4 border-border-subtle rounded-full" />
              {/* 内圈 - 旋转动画 */}
              <div className="absolute inset-0 w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : isFailed ? (
            <div className="w-16 h-16 rounded-full bg-danger-faint flex items-center justify-center">
              <svg className="w-8 h-8 text-danger" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
          ) : null}
        </div>

        {/* 文字提示 */}
        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-text-primary">
            {isConnecting ? '正在连接 Claude Code' : isFailed ? '连接失败' : ''}
          </h2>
          <p className="text-sm text-text-secondary">
            {isConnecting ? '请稍候，正在初始化...' : isFailed ? '无法连接到 Claude CLI' : ''}
          </p>
        </div>

        {/* 连接状态详情 */}
        {healthStatus?.claudeVersion ? (
          <p className="text-xs text-text-tertiary">
            已检测到版本: {healthStatus.claudeVersion}
          </p>
        ) : isFailed ? (
          <div className="text-xs text-text-tertiary space-y-3 max-w-md">
            <p className="text-danger font-medium">❌ {error || 'Claude CLI 未找到'}</p>
            {config?.claudeCmd && (
              <p>当前路径: <code className="bg-background-surface px-1 py-0.5 rounded">{config.claudeCmd}</code></p>
            )}

            {/* 详细诊断信息 */}
            <div className="bg-background-surface p-3 rounded-lg space-y-2">
              <p className="font-medium text-text-secondary">🔍 问题诊断:</p>
              <ul className="space-y-1 list-disc list-inside">
                <li>Claude CLI 可能未正确安装</li>
                <li>命令路径配置错误或文件不存在</li>
                <li>系统环境变量 PATH 未包含 Claude 路径</li>
                <li>权限不足导致无法执行命令</li>
              </ul>
            </div>

            {/* 引导式帮助 */}
            <div className="bg-background-surface p-3 rounded-lg space-y-2">
              <p className="font-medium text-text-secondary">💡 解决方案:</p>
              <ol className="space-y-1 list-decimal list-inside">
                <li>确认已安装 Claude CLI: <code className="px-1 py-0.5 rounded">claude --version</code></li>
                <li>Windows 用户查找路径: <code className="px-1 py-0.5 rounded">where claude</code></li>
                <li>Mac/Linux 用户查找路径: <code className="px-1 py-0.5 rounded">which claude</code></li>
                <li>如果通过 npm 安装，尝试重新安装: <code className="px-1 py-0.5 rounded">npm install -g @anthropic-ai/claude-3-dev</code></li>
              </ol>
            </div>
          </div>
        ) : (
          <p className="text-xs text-text-tertiary">
            正在检测 Claude CLI...
          </p>
        )}

        {/* 连接失败时的操作按钮 */}
        {isFailed && (
          <div className="space-y-3">
            {!showPathInput ? (
              <div className="space-y-2">
                <Button
                  onClick={handleRetry}
                  variant="primary"
                  className="w-full"
                >
                  重新检测
                </Button>
                <Button
                  onClick={() => setShowPathInput(true)}
                  variant="ghost"
                  className="w-full"
                >
                  设置 Claude 路径
                </Button>
              </div>
            ) : (
              <div className="space-y-4 w-full max-w-md">
                <div className="bg-background-surface p-4 rounded-lg">
                  <p className="text-sm text-text-secondary mb-3">
                    选择或输入 Claude CLI 的路径
                  </p>
                  <ClaudePathSelector
                    value={tempPath}
                    onChange={setTempPath}
                    compact
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={handlePathSubmit}
                    variant="primary"
                    className="flex-1"
                    disabled={!tempPath.trim()}
                  >
                    保存并重试
                  </Button>
                  <Button
                    onClick={() => {
                      setShowPathInput(false);
                      setTempPath(config?.claudeCmd || '');
                    }}
                    variant="ghost"
                    className="flex-1"
                  >
                    取消
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
