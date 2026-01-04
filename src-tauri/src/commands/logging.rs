use std::path::PathBuf;
use std::io;
use tauri::State;

use crate::error::{AppError, Result};
use crate::services::logger;
use crate::services::config_store::ConfigStore;
use crate::AppState;

/// 获取日志目录
#[tauri::command]
pub fn get_log_dir() -> PathBuf {
    logger::Logger::log_dir()
}

/// 读取日志内容
#[tauri::command]
pub fn read_logs(max_lines: usize) -> Result<String> {
    logger::Logger::read_logs(max_lines)
        .map_err(|e: io::Error| AppError::Unknown(e.to_string()))
}

/// 清空日志文件
#[tauri::command]
pub fn clear_logs() -> Result<()> {
    logger::Logger::clear_logs()
        .map_err(|e: io::Error| AppError::Unknown(e.to_string()))
}

/// 打开日志目录
#[tauri::command]
pub fn open_log_dir() -> Result<()> {
    let log_dir = logger::Logger::log_dir();

    #[cfg(windows)]
    {
        std::process::Command::new("explorer")
            .arg(&log_dir)
            .spawn()
            .map_err(|e: io::Error| AppError::Unknown(e.to_string()))?;
    }

    #[cfg(not(windows))]
    {
        std::process::Command::new("xdg-open")
            .arg(&log_dir)
            .spawn()
            .map_err(|e: io::Error| AppError::Unknown(e.to_string()))?;
    }

    Ok(())
}

/// 设置日志开关
#[tauri::command]
pub fn set_logging_enabled(enabled: bool, state: State<AppState>) -> Result<()> {
    let store = state.config_store.lock()
        .map_err(|e| AppError::Unknown(e.to_string()))?;
    let mut config = store.get().clone();
    config.enable_logging = enabled;

    drop(store);
    let mut store = state.config_store.lock()
        .map_err(|e| AppError::Unknown(e.to_string()))?;
    store.update(config)
}

/// 获取日志开关状态
#[tauri::command]
pub fn is_logging_enabled(state: State<AppState>) -> bool {
    state.config_store.lock()
        .as_ref()
        .map(|store| store.enable_logging())
        .unwrap_or(false)
}
