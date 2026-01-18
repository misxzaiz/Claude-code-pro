mod error;
mod models;
mod services;
mod commands;

use error::Result;
use models::config::{Config, HealthStatus};
use services::config_store::ConfigStore;
use services::logger::Logger;
use commands::chat::{start_chat, continue_chat, interrupt_chat};
use commands::chat::{
    list_iflow_sessions, get_iflow_session_history,
    get_iflow_file_contexts, get_iflow_token_stats,
};
use commands::{validate_workspace_path, get_directory_info};
use commands::window::{
    show_floating_window, show_main_window, toggle_floating_window,
    is_floating_window_visible, set_floating_window_position, get_floating_window_position
};
use commands::file_explorer::{
    read_directory, get_file_content, create_file, create_directory,
    delete_file, rename_file, path_exists, read_commands, search_files
};
use commands::context::{
    context_upsert, context_upsert_many, context_query, context_get_all,
    context_remove, context_clear,
    ide_report_current_file, ide_report_file_structure, ide_report_diagnostics,
    ContextMemoryStore,
};

use std::sync::{Arc, Mutex};
use std::collections::HashMap;

/// 全局配置状态
pub struct AppState {
    pub config_store: Mutex<ConfigStore>,
    /// 保存会话 ID 到进程 PID 的映射
    /// 使用 PID 而不是 Child，因为 Child 会在读取输出时被消费
    pub sessions: Arc<Mutex<HashMap<String, u32>>>,
    /// 上下文存储
    pub context_store: Arc<Mutex<ContextMemoryStore>>,
}

// ============================================================================
// Tauri Commands
// ============================================================================

/// 获取配置
#[tauri::command]
fn get_config(state: tauri::State<AppState>) -> Result<Config> {
    let store = state.config_store.lock()
        .map_err(|e| error::AppError::Unknown(e.to_string()))?;
    Ok(store.get().clone())
}

/// 更新配置
#[tauri::command]
fn update_config(config: Config, state: tauri::State<AppState>) -> Result<()> {
    let mut store = state.config_store.lock()
        .map_err(|e| error::AppError::Unknown(e.to_string()))?;
    store.update(config)
}

/// 设置工作目录
#[tauri::command]
fn set_work_dir(path: Option<String>, state: tauri::State<AppState>) -> Result<()> {
    let mut store = state.config_store.lock()
        .map_err(|e| error::AppError::Unknown(e.to_string()))?;
    let path_buf = path.map(|p| p.into());
    store.set_work_dir(path_buf)
}

/// 设置 Claude 命令路径
#[tauri::command]
fn set_claude_cmd(cmd: String, state: tauri::State<AppState>) -> Result<()> {
    let mut store = state.config_store.lock()
        .map_err(|e| error::AppError::Unknown(e.to_string()))?;
    store.set_claude_cmd(cmd)
}

/// 查找所有可用的 Claude CLI 路径
#[tauri::command]
fn find_claude_paths() -> Vec<String> {
    ConfigStore::find_claude_paths()
}

/// 路径验证结果
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PathValidationResult {
    /// 路径是否有效
    pub valid: bool,
    /// 错误信息
    pub error: Option<String>,
    /// Claude 版本
    pub version: Option<String>,
}

/// 验证 Claude CLI 路径
#[tauri::command]
fn validate_claude_path(path: String) -> PathValidationResult {
    match ConfigStore::validate_claude_path(path) {
        Ok((valid, error, version)) => PathValidationResult {
            valid,
            error,
            version,
        },
        Err(_) => PathValidationResult {
            valid: false,
            error: Some("验证过程中发生错误".to_string()),
            version: None,
        },
    }
}

/// 查找所有可用的 IFlow CLI 路径
#[tauri::command]
fn find_iflow_paths() -> Vec<String> {
    ConfigStore::find_iflow_paths()
}

/// 验证 IFlow CLI 路径
#[tauri::command]
fn validate_iflow_path(path: String) -> PathValidationResult {
    match ConfigStore::validate_iflow_path(path) {
        Ok((valid, error, version)) => PathValidationResult {
            valid,
            error,
            version,
        },
        Err(_) => PathValidationResult {
            valid: false,
            error: Some("验证过程中发生错误".to_string()),
            version: None,
        },
    }
}


/// 健康检查
#[tauri::command]
fn health_check(state: tauri::State<AppState>) -> HealthStatus {
    let store = state.config_store.lock()
        .unwrap_or_else(|e| {
            e.into_inner()
        });
    store.health_status()
}

/// 检测 Claude CLI
#[tauri::command]
fn detect_claude(state: tauri::State<AppState>) -> Option<String> {
    let store = state.config_store.lock()
        .unwrap_or_else(|e| e.into_inner());
    store.detect_claude()
}

// ============================================================================
// Tauri App Builder
// ============================================================================

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 初始化配置存储
    let config_store = ConfigStore::new()
        .expect("无法初始化配置存储");

    // 默认不启用日志系统
    // let _logger_guard = Logger::init(false);

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState {
            config_store: Mutex::new(config_store),
            sessions: Arc::new(Mutex::new(HashMap::new())),
            context_store: Arc::new(Mutex::new(ContextMemoryStore::new())),
        })
        .invoke_handler(tauri::generate_handler![
            // 配置相关
            get_config,
            update_config,
            set_work_dir,
            set_claude_cmd,
            find_claude_paths,
            validate_claude_path,
            find_iflow_paths,
            validate_iflow_path,
            // 健康检查
            health_check,
            detect_claude,
            // 聊天相关（统一接口）
            start_chat,
            continue_chat,
            interrupt_chat,
            // IFlow 会话历史相关
            list_iflow_sessions,
            get_iflow_session_history,
            get_iflow_file_contexts,
            get_iflow_token_stats,
            // 工作区相关
            validate_workspace_path,
            get_directory_info,
            // 文件浏览器相关
            read_directory,
            get_file_content,
            create_file,
            create_directory,
            delete_file,
            rename_file,
            path_exists,
            read_commands,
            search_files,
            // 窗口管理相关
            show_floating_window,
            show_main_window,
            toggle_floating_window,
            is_floating_window_visible,
            set_floating_window_position,
            get_floating_window_position,
            // 上下文管理相关
            context_upsert,
            context_upsert_many,
            context_query,
            context_get_all,
            context_remove,
            context_clear,
            ide_report_current_file,
            ide_report_file_structure,
            ide_report_diagnostics,

        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
