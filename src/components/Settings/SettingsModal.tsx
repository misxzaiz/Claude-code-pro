import { useState } from 'react';
import { useConfigStore } from '../../stores';
import { Button, ClaudePathSelector } from '../Common';
import type { Config, EngineId } from '../../types';

interface SettingsModalProps {
  onClose: () => void;
}

/** 引擎选项 */
const ENGINE_OPTIONS: { id: EngineId; name: string; description: string }[] = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    description: 'Anthropic 官方 Claude CLI，提供最佳的 Claude 3.7 Sonnet 体验',
  },
  {
    id: 'iflow',
    name: 'IFlow',
    description: '支持多种 AI 模型的智能编程助手，包括 OpenAI GPT-4、Claude 等',
  },
];

export function SettingsModal({ onClose }: SettingsModalProps) {
  const { config, loading, error, updateConfig } = useConfigStore();
  const [localConfig, setLocalConfig] = useState<Config | null>(config);

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

  const handleIFlowModelChange = (model: string) => {
    if (!localConfig) return;
    setLocalConfig({
      ...localConfig,
      iflow: { ...localConfig.iflow, model }
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
            <div className="mb-3">
              <label className="block text-xs text-text-secondary mb-2">
                IFlow CLI 命令路径（可选）
              </label>
              <ClaudePathSelector
                value={localConfig.iflow.cliPath || 'iflow'}
                onChange={handleIFlowCmdChange}
                disabled={loading}
                placeholder="iflow"
              />
            </div>

            {/* 模型选择 */}
            <div>
              <label className="block text-xs text-text-secondary mb-2">
                默认模型（可选）
              </label>
              <select
                value={localConfig.iflow.model || ''}
                onChange={(e) => handleIFlowModelChange(e.target.value)}
                className="w-full px-3 py-2 bg-background-elevated border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-primary"
              >
                <option value="">使用 IFlow 默认模型</option>
                <option value="gpt-4">GPT-4</option>
                <option value="gpt-4-turbo">GPT-4 Turbo</option>
                <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                <option value="claude-3-opus">Claude 3 Opus</option>
                <option value="claude-3-sonnet">Claude 3 Sonnet</option>
                <option value="claude-3-haiku">Claude 3 Haiku</option>
              </select>
            </div>
          </div>
        )}

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
