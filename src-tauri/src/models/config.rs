use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// 应用配置
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    /// Claude CLI 命令路径
    pub claude_cmd: String,

    /// 工作目录
    pub work_dir: Option<PathBuf>,

    /// 会话保存路径
    pub session_dir: Option<PathBuf>,

    /// Git 二进制路径 (Windows)
    pub git_bin_path: Option<String>,
}

impl Default for Config {
    fn default() -> Self {
        // 使用 "claude" 作为默认值，让 ConfigStore 在初始化时自动检测完整路径
        let default_cmd = "claude".to_string();

        Self {
            claude_cmd: default_cmd,
            work_dir: None,
            session_dir: None,
            git_bin_path: None,
        }
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

    /// 工作目录
    pub work_dir: Option<String>,

    /// 配置是否有效
    pub config_valid: bool,
}
