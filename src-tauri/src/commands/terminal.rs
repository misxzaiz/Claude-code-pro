use crate::error::{AppError, Result};
use std::path::Path;
use std::process::Command;
use tauri::{Emitter, Window};

/// 执行命令并返回输出
#[tauri::command]
pub async fn terminal_execute_command(
    command: String,
    args: Vec<String>,
    working_dir: Option<String>,
) -> Result<String> {
    eprintln!("[Terminal] 执行命令: {} {:?}", command, args);

    let mut cmd = Command::new(&command);
    cmd.args(&args);

    if let Some(ref work_dir) = working_dir {
        if Path::new(work_dir).exists() {
            cmd.current_dir(work_dir);
        }
    }

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    let output = cmd.output()
        .map_err(|e| AppError::ProcessError(format!("执行命令失败: {}", e)))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    // 组合输出
    let result = if !stderr.is_empty() {
        format!("{}\n{}", stdout, stderr)
    } else {
        stdout
    };

    Ok(result)
}

/// 获取系统信息（用于终端欢迎消息）
#[tauri::command]
pub async fn terminal_get_system_info() -> Result<SystemInfo> {
    Ok(SystemInfo {
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        current_dir: std::env::current_dir()
            .ok()
            .and_then(|p| p.to_str().map(|s| s.to_string()))
            .unwrap_or_else(|| "Unknown".to_string()),
    })
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct SystemInfo {
    pub os: String,
    pub arch: String,
    pub current_dir: String,
}
