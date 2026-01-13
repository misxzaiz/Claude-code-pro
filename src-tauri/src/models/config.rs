use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// Claude Code 引擎配置
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeCodeConfig {
    /// Claude CLI 命令路径
    pub cli_path: String,
}

impl Default for ClaudeCodeConfig {
    fn default() -> Self {
        Self {
            cli_path: "claude".to_string(),
        }
    }
}

/// IFlow 引擎配置
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IFlowConfig {
    /// IFlow CLI 命令路径（可选，默认为 "iflow"）
    pub cli_path: Option<String>,
}

impl Default for IFlowConfig {
    fn default() -> Self {
        Self {
            cli_path: None,
        }
    }
}

/// 引擎 ID 类型
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum EngineId {
    /// Claude Code 引擎
    ClaudeCode,
    /// IFlow 引擎
    IFlow,
}

impl Default for EngineId {
    fn default() -> Self {
        Self::ClaudeCode
    }
}

impl EngineId {
    /// 转换为字符串
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::ClaudeCode => "claude-code",
            Self::IFlow => "iflow",
        }
    }

    /// 从字符串解析
    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "claude-code" => Some(Self::ClaudeCode),
            "iflow" => Some(Self::IFlow),
            _ => None,
        }
    }
}

/// 应用配置（新版本）
///
/// 使用嵌套结构，支持多个 AI 引擎
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    /// 默认引擎
    #[serde(default = "default_default_engine")]
    pub default_engine: String,

    /// Claude Code 引擎配置
    #[serde(default)]
    pub claude_code: ClaudeCodeConfig,

    /// IFlow 引擎配置
    #[serde(default)]
    pub iflow: IFlowConfig,

    /// 工作目录
    pub work_dir: Option<PathBuf>,

    /// 会话保存路径
    pub session_dir: Option<PathBuf>,

    /// Git 二进制路径 (Windows)
    pub git_bin_path: Option<String>,

    // === 旧字段，保持向后兼容 ===
    /// @deprecated 请使用 claude_code.cli_path
    #[serde(default)]
    pub claude_cmd: Option<String>,
}

fn default_default_engine() -> String {
    "claude-code".to_string()
}

impl Default for Config {
    fn default() -> Self {
        Self {
            default_engine: default_default_engine(),
            claude_code: ClaudeCodeConfig::default(),
            iflow: IFlowConfig::default(),
            work_dir: None,
            session_dir: None,
            git_bin_path: None,
            claude_cmd: None,
        }
    }
}

impl Config {
    /// 获取 Claude CLI 命令路径（优先使用新字段）
    pub fn get_claude_cmd(&self) -> String {
        // 首先检查旧字段（用于迁移）
        if let Some(ref cmd) = self.claude_cmd {
            if !cmd.is_empty() {
                return cmd.clone();
            }
        }
        // 使用新字段
        self.claude_code.cli_path.clone()
    }

    /// 迁移旧配置到新格式
    pub fn migrate(&mut self) {
        // 如果 claude_cmd 有值且 claude_code.cli_path 是默认值
        if let Some(ref cmd) = self.claude_cmd {
            if self.claude_code.cli_path == "claude" && !cmd.is_empty() {
                self.claude_code.cli_path = cmd.clone();
            }
        }

        // 确保 default_engine 有效
        if EngineId::from_str(&self.default_engine).is_none() {
            self.default_engine = "claude-code".to_string();
        }
    }

    /// 获取当前引擎 ID
    pub fn get_engine_id(&self) -> EngineId {
        EngineId::from_str(&self.default_engine)
            .unwrap_or(EngineId::ClaudeCode)
    }

    /// 设置默认引擎
    pub fn set_engine_id(&mut self, engine_id: EngineId) {
        self.default_engine = engine_id.as_str().to_string();
    }
}

/// 健康状态
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthStatus {
    /// Claude CLI 是否可用
    pub claude_available: bool,

    /// Claude 版本
    pub claude_version: Option<String>,

    /// IFlow CLI 是否可用
    pub iflow_available: Option<bool>,

    /// IFlow 版本
    pub iflow_version: Option<String>,

    /// 工作目录
    pub work_dir: Option<String>,

    /// 配置是否有效
    pub config_valid: bool,
}
