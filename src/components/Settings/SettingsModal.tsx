import { useState, useEffect } from 'react';
import { useConfigStore } from '../../stores';
import { Button, ClaudePathSelector } from '../Common';
import type { Config, EngineId, FloatingWindowMode } from '../../types';

interface SettingsModalProps {
  onClose: () => void;
}

/** 引擎选项 */
const ENGINE_OPTIONS: { id: EngineId; name: string; description: string }[] = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    description: 'Anthropic 官方 CLI 工具',
  },
  {
    id: 'iflow',
    name: 'IFlow',
    description: '智能编程助手 CLI 工具',
  },
];

/** 悬浮窗模式选项 */
const FLOATING_MODE_OPTIONS: { id: FloatingWindowMode; name: string; description: string }[] = [
  {
    id: 'auto',
    name: '自动',
    description: '鼠标移出主窗口时自动显示悬浮窗',
  },
  {
    id: 'manual',
    name: '手动',
    description: '需要手动触发悬浮窗显示',
  },
];

export function SettingsModal({ onClose }: SettingsModalProps) {
  const { config, loading, error, updateConfig } = useConfigStore();
  const [localConfig, setLocalConfig] = useState<Config | null>(config);

  // 当 config 更新时同步到 localConfig
  useEffect(() => {
    if (config) {
      setLocalConfig(config);
    }
  }, [config]);

  const handleSave = async () => {
    if (!localConfig) return;

    try {
      await updateConfig(localConfig);
      onClose();
    } catch (error) {
      console.error('保存配置失败:', error);
    }
  };

  const handleEngineChange = (engineId: EngineId) => {
    if (!localConfig) return;
    setLocalConfig({ ...localConfig, defaultEngine: engineId });
  };

  const handleClaudeCmdChange = (cmd: string) => {
    if (!localConfig) return;
    setLocalConfig({
      ...localConfig,
      claudeCode: { ...localConfig.claudeCode, cliPath: cmd }
    });
  };

  const handleIFlowCmdChange = (cmd: string) => {
    if (!localConfig) return;
    setLocalConfig({
      ...localConfig,
      iflow: { ...localConfig.iflow, cliPath: cmd }
    });
  };

  const handleFloatingWindowEnabledChange = (enabled: boolean) => {
    if (!localConfig) return;
    setLocalConfig({
      ...localConfig,
      floatingWindow: { ...localConfig.floatingWindow, enabled }
    });
  };

  const handleFloatingWindowModeChange = (mode: FloatingWindowMode) => {
    if (!localConfig) return;
    setLocalConfig({
      ...localConfig,
      floatingWindow: { ...localConfig.floatingWindow, mode }
    });
  };

  const handleFloatingWindowExpandOnHoverChange = (expandOnHover: boolean) => {
    if (!localConfig) return;
    setLocalConfig({
      ...localConfig,
      floatingWindow: { ...localConfig.floatingWindow, expandOnHover }
    });
  };

  const handleFloatingWindowCollapseDelayChange = (collapseDelay: number) => {
    if (!localConfig) return;
    setLocalConfig({
      ...localConfig,
      floatingWindow: { ...localConfig.floatingWindow, collapseDelay }
    });
  };

  if (!localConfig) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-background-elevated rounded-xl p-6 max-w-md w-full mx-4 shadow-soft">
          <div className="text-center">加载配置中...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background-elevated rounded-xl p-6 max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto shadow-soft">
        {/* 标题 */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-text-primary">设置</h2>
          <button
            onClick={onClose}
            className="text-text-tertiary hover:text-text-primary transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="mb-4 p-3 bg-danger-faint border border-danger/30 rounded-lg text-danger text-sm">
            {error}
          </div>
        )}

        {/* AI 引擎选择 */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-text-secondary mb-3">
            AI 引擎
          </label>
          <div className="space-y-2">
            {ENGINE_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => handleEngineChange(option.id)}
                className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                  localConfig.defaultEngine === option.id
                    ? 'border-primary bg-primary/5'
                    : 'border-border bg-surface hover:border-primary/30'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-text-primary">{option.name}</div>
                    <div className="text-sm text-text-secondary mt-1">{option.description}</div>
                  </div>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                    localConfig.defaultEngine === option.id
                      ? 'border-primary bg-primary'
                      : 'border-border'
                  }`}>
                    {localConfig.defaultEngine === option.id && (
                      <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Claude Code 配置 */}
        {localConfig.defaultEngine === 'claude-code' && (
          <div className="mb-6 p-4 bg-surface rounded-lg border border-border">
            <h3 className="text-sm font-medium text-text-primary mb-3">Claude Code 配置</h3>
            <div>
              <label className="block text-xs text-text-secondary mb-2">
                Claude CLI 命令路径
              </label>
              <ClaudePathSelector
                value={localConfig.claudeCode.cliPath}
                onChange={handleClaudeCmdChange}
                engineType="claude-code"
                disabled={loading}
              />
            </div>
          </div>
        )}

        {/* IFlow 配置 */}
        {localConfig.defaultEngine === 'iflow' && (
          <div className="mb-6 p-4 bg-surface rounded-lg border border-border">
            <h3 className="text-sm font-medium text-text-primary mb-3">IFlow 配置</h3>

            {/* CLI 路径 */}
            <div>
              <label className="block text-xs text-text-secondary mb-2">
                IFlow CLI 命令路径（可选）
              </label>
              <ClaudePathSelector
                value={localConfig.iflow.cliPath || 'iflow'}
                onChange={handleIFlowCmdChange}
                engineType="iflow"
                disabled={loading}
                placeholder="iflow"
              />
            </div>
          </div>
        )}

        {/* 悬浮窗配置 */}
        <div className="mb-6 p-4 bg-surface rounded-lg border border-border">
          <h3 className="text-sm font-medium text-text-primary mb-3">悬浮窗设置</h3>

          {/* 启用悬浮窗 */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-sm text-text-primary">启用悬浮窗</div>
              <div className="text-xs text-text-secondary">鼠标移出时显示精简悬浮窗</div>
            </div>
            <button
              type="button"
              onClick={() => handleFloatingWindowEnabledChange(!localConfig.floatingWindow.enabled)}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                localConfig.floatingWindow.enabled ? 'bg-primary' : 'bg-border'
              }`}
            >
              <span
                className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${
                  localConfig.floatingWindow.enabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* 悬浮窗模式 */}
          {localConfig.floatingWindow.enabled && (
            <>
              <div className="mb-4">
                <div className="text-xs text-text-secondary mb-2">悬浮窗模式</div>
                <div className="space-y-2">
                  {FLOATING_MODE_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => handleFloatingWindowModeChange(option.id)}
                      className={`w-full text-left p-3 rounded-lg border transition-all ${
                        localConfig.floatingWindow.mode === option.id
                          ? 'border-primary bg-primary/5'
                          : 'border-border-subtle hover:border-primary/30'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="text-sm text-text-primary">{option.name}</div>
                          <div className="text-xs text-text-secondary mt-0.5">{option.description}</div>
                        </div>
                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ml-2 ${
                          localConfig.floatingWindow.mode === option.id
                            ? 'border-primary'
                            : 'border-border'
                        }`}>
                          {localConfig.floatingWindow.mode === option.id && (
                            <div className="w-2 h-2 rounded-full bg-primary" />
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* 移动到悬浮窗时展开 */}
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-sm text-text-primary">移动到悬浮窗时展开</div>
                  <div className="text-xs text-text-secondary">鼠标移到悬浮窗时自动展开主窗口</div>
                </div>
                <button
                  type="button"
                  onClick={() => handleFloatingWindowExpandOnHoverChange(!localConfig.floatingWindow.expandOnHover)}
                  className={`relative w-11 h-6 rounded-full transition-colors ${
                    localConfig.floatingWindow.expandOnHover ? 'bg-primary' : 'bg-border'
                  }`}
                >
                  <span
                    className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${
                      localConfig.floatingWindow.expandOnHover ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* 自动切换延迟 */}
              {localConfig.floatingWindow.mode === 'auto' && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <div className="text-sm text-text-primary">切换延迟</div>
                      <div className="text-xs text-text-secondary">鼠标移出主窗口后切换到悬浮窗的延迟时长</div>
                    </div>
                    <div className="text-sm font-medium text-primary">
                      {localConfig.floatingWindow.collapseDelay} ms
                    </div>
                  </div>
                  <input
                    type="range"
                    min="100"
                    max="3000"
                    step="100"
                    value={localConfig.floatingWindow.collapseDelay}
                    onChange={(e) => handleFloatingWindowCollapseDelayChange(Number(e.target.value))}
                    className="w-full h-2 bg-border-subtle rounded-lg appearance-none cursor-pointer accent-primary"
                  />
                  <div className="flex justify-between text-xs text-text-tertiary mt-1">
                    <span>100ms</span>
                    <span>3000ms</span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* 按钮 */}
        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={loading}
          >
            取消
          </Button>
          <Button
            onClick={handleSave}
            disabled={loading}
            className="min-w-[80px]"
          >
            {loading ? '保存中...' : '保存'}
          </Button>
        </div>
      </div>
    </div>
  );
}
