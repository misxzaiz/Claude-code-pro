use crate::error::{AppError, Result};
use crate::models::config::{Config, EngineId};
use crate::models::events::StreamEvent;
use crate::services::iflow_service::IFlowService;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio, Child};
use std::sync::Arc;
use tauri::{Emitter, Window, State};
use uuid::Uuid;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

/// Windows 进程创建标志：不创建新窗口
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

/// Claude 聊天会话
pub struct ChatSession {
    pub id: String,
    pub child: Child,
}

impl ChatSession {
    /// 创建ChatSession实例（用于continue_chat）
    pub fn with_id_and_child(id: String, child: Child) -> Self {
        Self { id, child }
    }
}

/// 从 claude.cmd 路径解析出 Node.js 和 cli.js 的路径
///
/// claude.cmd 通常位于: C:\Users\...\AppData\Roaming\npm\claude.cmd
/// node.exe 通常在同一目录或系统 PATH 中
/// cli.js 位于: node_modules\@anthropic-ai\claude-code\cli.js
#[cfg(windows)]
fn resolve_node_and_cli(claude_cmd_path: &str) -> Result<(String, String)> {
    let cmd_path = Path::new(claude_cmd_path);

    // 获取 .cmd 文件所在的目录（通常是 npm 目录）
    let npm_dir = cmd_path.parent()
        .ok_or_else(|| AppError::ProcessError("无法获取 claude.cmd 的父目录".to_string()))?;

    // 查找 node.exe
    let node_exe = find_node_exe(npm_dir)?;

    // 查找 cli.js
    let cli_js = find_cli_js(npm_dir)?;

    eprintln!("[resolve_node_and_cli] node_exe: {}", node_exe);
    eprintln!("[resolve_node_and_cli] cli_js: {}", cli_js);

    Ok((node_exe, cli_js))
}

/// 查找 node.exe 可执行文件
#[cfg(windows)]
fn find_node_exe(npm_dir: &Path) -> Result<String> {
    // 1. 检查 npm 目录下是否有 node.exe
    let local_node = npm_dir.join("node.exe");
    if local_node.exists() {
        return Ok(local_node.to_string_lossy().to_string());
    }

    // 2. 使用 where 命令查找系统中的 node.exe
    let output = Command::new("where")
        .args(["node"])
        .output()
        .map_err(|e| AppError::ProcessError(format!("查找 node.exe 失败: {}", e)))?;

    if output.status.success() {
        let node_path = String::from_utf8_lossy(&output.stdout)
            .lines()
            .next()
            .map(|s| s.trim().to_string());

        if let Some(path) = node_path {
            return Ok(path);
        }
    }

    // 3. 尝试常见路径
    let common_paths = vec![
        r"C:\Program Files\nodejs\node.exe",
        r"C:\Program Files (x86)\nodejs\node.exe",
    ];

    for path in common_paths {
        if Path::new(path).exists() {
            return Ok(path.to_string());
        }
    }

    Err(AppError::ProcessError("无法找到 node.exe".to_string()))
}

/// 查找 cli.js 文件
#[cfg(windows)]
fn find_cli_js(npm_dir: &Path) -> Result<String> {
    // cli.js 通常在: npm_dir/node_modules/@anthropic-ai/claude-code/cli.js
    let cli_js = npm_dir
        .join("node_modules")
        .join("@anthropic-ai")
        .join("claude-code")
        .join("cli.js");

    if cli_js.exists() {
        return Ok(cli_js.to_string_lossy().to_string());
    }

    // 如果不在预期位置，尝试全局 node_modules
    if let Some(roaming_appdata) = std::env::var("APPDATA").ok() {
        let global_cli = PathBuf::from(roaming_appdata)
            .join("npm")
            .join("node_modules")
            .join("@anthropic-ai")
            .join("claude-code")
            .join("cli.js");

        if global_cli.exists() {
            return Ok(global_cli.to_string_lossy().to_string());
        }
    }

    Err(AppError::ProcessError(format!(
        "无法找到 cli.js，预期位置: {}",
        cli_js.display()
    )))
}

/// 构建直接调用 Node.js 的命令
#[cfg(windows)]
fn build_node_command(node_exe: &str, cli_js: &str, message: &str, system_prompt: Option<&str>) -> Command {
    let mut cmd = Command::new(node_exe);
    cmd.arg(cli_js);

    // 添加 system-prompt 参数（如果有）
    if let Some(prompt) = system_prompt {
        if !prompt.is_empty() {
            cmd.arg("--system-prompt").arg(prompt);
        }
    }

    cmd.arg("--print")
        .arg("--verbose")
        .arg("--output-format")
        .arg("stream-json")
        .arg("--permission-mode")
        .arg("bypassPermissions")
        .arg(message);
    cmd
}

/// 构建直接调用 Node.js 的命令（continue_chat）
#[cfg(windows)]
fn build_node_command_resume(node_exe: &str, cli_js: &str, session_id: &str, message: &str, system_prompt: Option<&str>) -> Command {
    let mut cmd = Command::new(node_exe);
    cmd.arg(cli_js)
        .arg("--resume")
        .arg(session_id);

    // 添加 system-prompt 参数（如果有）
    if let Some(prompt) = system_prompt {
        if !prompt.is_empty() {
            cmd.arg("--system-prompt").arg(prompt);
        }
    }

    cmd.arg("--print")
        .arg("--verbose")
        .arg("--output-format")
        .arg("stream-json")
        .arg("--permission-mode")
        .arg("bypassPermissions")
        .arg(message);
    cmd
}

impl ChatSession {
    /// 启动新的聊天会话
    pub fn start(config: &Config, message: &str, system_prompt: Option<&str>) -> Result<Self> {
        eprintln!("[ChatSession::start] 启动 Claude 会话");
        let claude_cmd = config.get_claude_cmd();
        eprintln!("[ChatSession::start] claude_cmd: {}", claude_cmd);
        eprintln!("[ChatSession::start] message 长度: {} 字符", message.len());
        if let Some(prompt) = system_prompt {
            eprintln!("[ChatSession::start] systemPrompt 长度: {} 字符", prompt.len());
        }

        // 根据平台构建不同的命令
        #[cfg(windows)]
        let mut cmd = {
            // Windows: 直接调用 Node.js，绕过 cmd.exe
            let (node_exe, cli_js) = resolve_node_and_cli(&claude_cmd)?;
            build_node_command(&node_exe, &cli_js, message, system_prompt)
        };

        #[cfg(not(windows))]
        let mut cmd = {
            // Unix/Mac: 直接使用 claude 命令
            let mut c = Command::new(&claude_cmd);
            // 添加 system-prompt 参数（如果有）
            if let Some(prompt) = system_prompt {
                if !prompt.is_empty() {
                    c.arg("--system-prompt").arg(prompt);
                }
            }
            c.arg("--print")
                .arg("--verbose")
                .arg("--output-format")
                .arg("stream-json")
                .arg("--permission-mode")
                .arg("bypassPermissions")
                .arg(message)
        };

        cmd.stdout(Stdio::piped())
            .stderr(Stdio::piped());

        // Windows 上隐藏窗口
        #[cfg(windows)]
        cmd.creation_flags(CREATE_NO_WINDOW);

        // 设置工作目录
        if let Some(ref work_dir) = config.work_dir {
            eprintln!("[ChatSession::start] work_dir: {:?}", work_dir);
            cmd.current_dir(work_dir);
        }

        // 设置 Git Bash 环境变量 (Windows 需要)
        if let Some(ref git_bash_path) = config.git_bin_path {
            eprintln!("[ChatSession::start] 设置 CLAUDE_CODE_GIT_BASH_PATH: {}", git_bash_path);
            cmd.env("CLAUDE_CODE_GIT_BASH_PATH", git_bash_path);
        }

        eprintln!("[ChatSession::start] 执行命令: {:?}", cmd);

        let child = cmd.spawn()
            .map_err(|e| AppError::ProcessError(format!("启动 Claude 失败: {}", e)))?;

        eprintln!("[ChatSession::start] 进程 PID: {:?}", child.id());

        Ok(Self {
            id: Uuid::new_v4().to_string(),
            child,
        })
    }

    /// 读取输出并解析事件
    pub fn read_events<F>(self, mut callback: F)
    where
        F: FnMut(StreamEvent) + Send + 'static,
    {
        eprintln!("[ChatSession::read_events] 开始读取输出");

        let stdout = match self.child.stdout {
            Some(stdout) => stdout,
            None => {
                eprintln!("[ChatSession::read_events] 无法获取 stdout");
                // 发送错误事件到前端
                callback(StreamEvent::Error {
                    error: "无法获取进程输出流".to_string(),
                });
                return;
            }
        };

        let stderr = match self.child.stderr {
            Some(stderr) => stderr,
            None => {
                eprintln!("[ChatSession::read_events] 无法获取 stderr");
                callback(StreamEvent::Error {
                    error: "无法获取进程错误流".to_string(),
                });
                return;
            }
        };

        // 启动单独的线程读取 stderr
        std::thread::spawn(move || {
            eprintln!("[stderr_reader] 开始读取 stderr");
            let reader = BufReader::new(stderr);
            for line in reader.lines() {
                match line {
                    Ok(l) => eprintln!("[stderr] {}", l),
                    Err(_) => break,
                }
            }
            eprintln!("[stderr_reader] stderr 结束");
        });

        let reader = BufReader::new(stdout);
        let mut line_count = 0;
        let mut received_session_end = false;

        for line in reader.lines() {
            let line = match line {
                Ok(l) => l,
                Err(e) => {
                    eprintln!("[ChatSession::read_events] 读取行错误: {}", e);
                    break;
                }
            };

            line_count += 1;
            let line_trimmed = line.trim();

            if line_trimmed.is_empty() {
                continue;
            }

            eprintln!("[ChatSession::read_events] 行 {}: {}", line_count, line_trimmed.chars().take(100).collect::<String>());

            // 使用 StreamEvent::parse_line 解析
            if let Some(event) = StreamEvent::parse_line(line_trimmed) {
                eprintln!("[ChatSession::read_events] 解析成功事件: {:?}", std::mem::discriminant(&event));

                // 检查是否收到 session_end 事件
                if matches!(event, StreamEvent::SessionEnd) {
                    received_session_end = true;
                }

                callback(event);
            } else {
                eprintln!("[ChatSession::read_events] 解析失败，原始内容: {}", line_trimmed.chars().take(200).collect::<String>());
            }
        }

        eprintln!("[ChatSession::read_events] 读取结束，共处理 {} 行", line_count);

        // 【关键修复】只有在进程没有正常发送 session_end 事件时才自动发送
        // 这样避免重复发送，同时确保异常退出时前端能收到通知
        if !received_session_end {
            eprintln!("[ChatSession::read_events] 进程异常退出，发送 session_end 事件");
            callback(StreamEvent::SessionEnd);
        }
    }
}

// ============================================================================
// Tauri Commands
// ============================================================================

/// 启动聊天会话（后台异步执行）
///
/// 统一接口，根据 engine_id 参数选择具体的 AI 引擎实现
#[tauri::command]
pub async fn start_chat(
    message: String,
    window: Window,
    state: State<'_, crate::AppState>,
    work_dir: Option<String>,
    engine_id: Option<String>,
    system_prompt: Option<String>,
) -> Result<String> {
    eprintln!("[start_chat] 收到消息，长度: {} 字符", message.len());
    if let Some(ref prompt) = system_prompt {
        eprintln!("[start_chat] 系统提示词长度: {} 字符", prompt.len());
    }

    // 从 AppState 获取实际配置（在独立作用域中，确保 MutexGuard 在 await 前释放）
    let (config, engine) = {
        let config_store = state.config_store.lock()
            .map_err(|e| crate::error::AppError::Unknown(e.to_string()))?;
        let mut cfg = config_store.get().clone();

        // 如果传入了 work_dir 参数，优先使用它而不是配置中的
        if let Some(ref work_dir_str) = work_dir {
            let work_dir_path = PathBuf::from(work_dir_str);
            eprintln!("[start_chat] 使用传入的工作目录: {:?}", work_dir_path);
            cfg.work_dir = Some(work_dir_path);
        }

        // 解析引擎 ID，优先使用参数，其次使用配置中的默认引擎
        let engine_id_str = engine_id.unwrap_or_else(|| cfg.default_engine.clone());
        let engine = EngineId::from_str(&engine_id_str)
            .unwrap_or(EngineId::ClaudeCode);

        eprintln!("[start_chat] 使用引擎: {:?}", engine);

        (cfg, engine)
    }; // MutexGuard 在此处释放

    match engine {
        EngineId::ClaudeCode => {
            start_claude_chat(&config, &message, window, state, system_prompt.as_deref()).await
        }
        EngineId::IFlow => {
            start_iflow_chat_internal(&config, &message, window, state).await
        }
    }
}

/// 启动 Claude Code 聊天会话
async fn start_claude_chat(
    config: &Config,
    message: &str,
    window: Window,
    state: State<'_, crate::AppState>,
    system_prompt: Option<&str>,
) -> Result<String> {
    eprintln!("[start_claude_chat] 启动 Claude 会话");

    // 启动 Claude 会话
    let session = ChatSession::start(config, message, system_prompt)?;

    let session_id = session.id.clone();
    let window_clone = window.clone();
    let process_id = session.child.id();

    eprintln!("[start_claude_chat] 临时会话 ID: {}, 进程 ID: {}", session_id, process_id);

    // 保存 PID 到全局 sessions
    {
        let mut sessions = state.sessions.lock()
            .map_err(|e| crate::error::AppError::Unknown(e.to_string()))?;
        sessions.insert(session_id.clone(), process_id);
    }

    // 克隆 sessions Arc 以便在回调中使用
    let sessions_arc = Arc::clone(&state.sessions);
    let temp_session_id = session_id.clone();

    // 在后台线程中读取输出
    std::thread::spawn(move || {
        eprintln!("[start_claude_chat] 后台线程开始");
        session.read_events(move |event| {
            // 检查是否收到真实的 session_id
            if let StreamEvent::System { extra, .. } = &event {
                if let Some(serde_json::Value::String(real_session_id)) = extra.get("session_id") {
                    eprintln!("[start_claude_chat] 收到真实 session_id: {}, 更新映射", real_session_id);

                    if let Ok(mut sessions) = sessions_arc.lock() {
                        if let Some(&pid) = sessions.get(&temp_session_id) {
                            sessions.remove(&temp_session_id);
                            sessions.insert(real_session_id.clone(), pid);
                            eprintln!("[start_claude_chat] 映射已更新: {} -> PID {}", real_session_id, pid);
                        }
                    }
                }
            }

            let event_json = serde_json::to_string(&event)
                .unwrap_or_else(|_| "{}".to_string());
            eprintln!("[start_claude_chat] 发送事件: {}", event_json);
            let _ = window_clone.emit("chat-event", event_json);
        });
        eprintln!("[start_claude_chat] 后台线程结束");
    });

    Ok(session_id)
}

/// 启动 IFlow 聊天会话
async fn start_iflow_chat_internal(
    config: &Config,
    message: &str,
    window: Window,
    state: State<'_, crate::AppState>,
) -> Result<String> {
    eprintln!("[start_iflow_chat] 启动 IFlow 会话");

    // 启动 IFlow 会话
    let session = IFlowService::start_chat(config, message)?;

    let temp_session_id = session.id.clone();
    let return_session_id = temp_session_id.clone();
    let window_clone = window.clone();
    let process_id = session.child.id();

    eprintln!("[start_iflow_chat] 临时会话 ID: {}, 进程 ID: {:?}", temp_session_id, process_id);

    // 保存 PID 到全局 sessions
    {
        let mut sessions = state.sessions.lock()
            .map_err(|e| AppError::Unknown(e.to_string()))?;
        sessions.insert(temp_session_id.clone(), process_id);
    }

    let sessions_arc = Arc::clone(&state.sessions);
    let config_clone = config.clone();

    // 启动后台线程监控进程
    std::thread::spawn(move || {
        eprintln!("[start_iflow_chat] 后台线程开始");

        let temp_id = temp_session_id.clone();
        let mut session_id_found = false;

        // 读取 stderr 以获取会话信息
        let mut child = session.child;
        if let Some(stderr) = child.stderr.take() {
            let reader = BufReader::new(stderr);

            for line in reader.lines() {
                if let Ok(line_text) = line {
                    eprintln!("[iflow stderr] {}", line_text);

                    if !session_id_found {
                        if let Some(id) = extract_session_id(&line_text) {
                            eprintln!("[start_iflow_chat] 找到 session_id: {}", id);

                            // 更新 sessions 映射
                            if let Ok(mut sessions) = sessions_arc.lock() {
                                sessions.remove(&temp_id);
                                sessions.insert(id.clone(), process_id);
                            }

                            session_id_found = true;

                            // 发送 session_id 到前端
                            // 注意：前端 chatStore 期望 event.session_id 在顶层，而不是 extra.session_id
                            let _ = window_clone.emit("chat-event", serde_json::json!({
                                "type": "system",
                                "session_id": id
                            }).to_string());

                            // 查找 JSONL 文件并启动监控
                            match IFlowService::find_session_jsonl(&config_clone, &id) {
                                Ok(jsonl_path) => {
                                    eprintln!("[start_iflow_chat] 找到 JSONL 文件: {:?}", jsonl_path);

                                let sessions_arc_clone = Arc::clone(&sessions_arc);
                                let id_clone = id.clone();
                                let window_clone2 = window_clone.clone();
                                let config_clone2 = config_clone.clone();

                                // 第一次启动会话，从头开始读取（start_line = 0）
                                IFlowService::monitor_jsonl_file(
                                    jsonl_path,
                                    id_clone.clone(),
                                    move |event| {
                                        let event_json = serde_json::to_string(&event)
                                            .unwrap_or_else(|_| "{}".to_string());
                                        eprintln!("[iflow] 发送事件: {}", event_json);
                                        let _ = window_clone2.emit("chat-event", event_json);

                                        if matches!(event, StreamEvent::SessionEnd) {
                                            if let Ok(mut sessions) = sessions_arc_clone.lock() {
                                                sessions.remove(&id_clone);
                                            }
                                        }
                                    },
                                    0, // start_line: 从头开始
                                );
                                }
                                Err(e) => {
                                    eprintln!("[start_iflow_chat] 查找 JSONL 文件失败: {:?}", e);
                                }
                            }
                        }
                    }
                }
            }
        }

        // 等待进程结束
        let _ = child.wait();

        eprintln!("[start_iflow_chat] 后台线程结束");
    });

    Ok(return_session_id)
}

/// 继续聊天会话
///
/// 统一接口，根据 engine_id 参数选择具体的 AI 引擎实现
#[tauri::command]
pub async fn continue_chat(
    session_id: String,
    message: String,
    window: Window,
    state: State<'_, crate::AppState>,
    work_dir: Option<String>,
    engine_id: Option<String>,
    system_prompt: Option<String>,
) -> Result<()> {
    eprintln!("[continue_chat] 继续会话: {}", session_id);
    eprintln!("[continue_chat] 消息长度: {} 字符", message.len());
    if let Some(ref prompt) = system_prompt {
        eprintln!("[continue_chat] 系统提示词长度: {} 字符", prompt.len());
    }

    // 从 AppState 获取实际配置（在独立作用域中，确保 MutexGuard 在 await 前释放）
    let (config, engine) = {
        let config_store = state.config_store.lock()
            .map_err(|e| crate::error::AppError::Unknown(e.to_string()))?;
        let mut cfg = config_store.get().clone();

        // 如果传入了 work_dir 参数，优先使用它而不是配置中的
        if let Some(ref work_dir_str) = work_dir {
            let work_dir_path = PathBuf::from(work_dir_str);
            eprintln!("[continue_chat] 使用传入的工作目录: {:?}", work_dir_path);
            cfg.work_dir = Some(work_dir_path);
        }

        // 解析引擎 ID
        let engine_id_str = engine_id.unwrap_or_else(|| cfg.default_engine.clone());
        let engine = EngineId::from_str(&engine_id_str)
            .unwrap_or(EngineId::ClaudeCode);

        eprintln!("[continue_chat] 使用引擎: {:?}", engine);

        (cfg, engine)
    }; // MutexGuard 在此处释放

    match engine {
        EngineId::ClaudeCode => {
            continue_claude_chat(&config, &session_id, &message, window, state, system_prompt.as_deref()).await
        }
        EngineId::IFlow => {
            continue_iflow_chat_internal(&config, &session_id, &message, window, state).await
        }
    }
}

/// 继续 Claude Code 聊天会话
async fn continue_claude_chat(
    config: &Config,
    session_id: &str,
    message: &str,
    window: Window,
    state: State<'_, crate::AppState>,
    system_prompt: Option<&str>,
) -> Result<()> {
    eprintln!("[continue_claude_chat] 继续 Claude 会话: {}", session_id);

    // 如果已存在旧进程，先尝试终止它
    let old_pid = {
        let mut sessions = state.sessions.lock()
            .map_err(|e| crate::error::AppError::Unknown(e.to_string()))?;
        sessions.remove(session_id)
    };

    if let Some(pid) = old_pid {
        eprintln!("[continue_claude_chat] 发现旧进程 PID: {}, 尝试终止", pid);
        terminate_process(pid);
    }

    // 根据平台构建命令
    #[cfg(windows)]
    let mut cmd = {
        let claude_cmd = config.get_claude_cmd();
        let (node_exe, cli_js) = resolve_node_and_cli(&claude_cmd)?;
        build_node_command_resume(&node_exe, &cli_js, session_id, message, system_prompt)
    };

    #[cfg(not(windows))]
    let mut cmd = {
        let claude_cmd = config.get_claude_cmd();
        let mut c = Command::new(&claude_cmd)
            .arg("--resume")
            .arg(session_id);
        // 添加 system-prompt 参数（如果有）
        if let Some(prompt) = system_prompt {
            if !prompt.is_empty() {
                c.arg("--system-prompt").arg(prompt);
            }
        }
        c.arg("--print")
            .arg("--verbose")
            .arg("--output-format")
            .arg("stream-json")
            .arg("--permission-mode")
            .arg("bypassPermissions")
            .arg(message)
    };

    cmd.stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    if let Some(ref work_dir) = config.work_dir {
        eprintln!("[continue_claude_chat] work_dir: {:?}", work_dir);
        cmd.current_dir(work_dir);
    }

    if let Some(ref git_bash_path) = config.git_bin_path {
        eprintln!("[continue_claude_chat] 设置 CLAUDE_CODE_GIT_BASH_PATH: {}", git_bash_path);
        cmd.env("CLAUDE_CODE_GIT_BASH_PATH", git_bash_path);
    }

    eprintln!("[continue_claude_chat] 执行命令: {:?}", cmd);

    let child = cmd.spawn()
        .map_err(|e| AppError::ProcessError(format!("继续 Claude 会话失败: {}", e)))?;

    let new_pid = child.id();
    let window_clone = window.clone();
    let session_id_owned = session_id.to_string();

    eprintln!("[continue_claude_chat] 新进程 PID: {}", new_pid);

    {
        let mut sessions = state.sessions.lock()
            .map_err(|e| crate::error::AppError::Unknown(e.to_string()))?;
        sessions.insert(session_id_owned.clone(), new_pid);
    }

    std::thread::spawn(move || {
        eprintln!("[continue_claude_chat] 后台线程开始");
        let session = ChatSession::with_id_and_child(session_id_owned, child);
        session.read_events(move |event| {
            let event_json = serde_json::to_string(&event)
                .unwrap_or_else(|_| "{}".to_string());
            eprintln!("[continue_claude_chat] 发送事件: {}", event_json);
            let _ = window_clone.emit("chat-event", event_json);
        });
        eprintln!("[continue_claude_chat] 后台线程结束");
    });

    Ok(())
}

/// 继续 IFlow 聊天会话
async fn continue_iflow_chat_internal(
    config: &Config,
    session_id: &str,
    message: &str,
    window: Window,
    state: State<'_, crate::AppState>,
) -> Result<()> {
    eprintln!("[continue_iflow_chat] 继续 IFlow 会话: {}", session_id);

    let old_pid = {
        let mut sessions = state.sessions.lock()
            .map_err(|e| AppError::Unknown(e.to_string()))?;
        sessions.remove(session_id)
    };

    if let Some(pid) = old_pid {
        eprintln!("[continue_iflow_chat] 发现旧进程 PID: {:?}, 尝试终止", pid);
        terminate_process(pid);
    }

    let mut child = IFlowService::continue_chat(config, session_id, message)?;
    let new_pid = child.id();

    eprintln!("[continue_iflow_chat] 新进程 PID: {:?}", new_pid);

    let session_id_owned = session_id.to_string();
    {
        let mut sessions = state.sessions.lock()
            .map_err(|e| AppError::Unknown(e.to_string()))?;
        sessions.insert(session_id_owned.clone(), new_pid);
    }

    let sessions_arc = Arc::clone(&state.sessions);
    let window_clone = window.clone();
    let config_clone = config.clone();

    std::thread::spawn(move || {
        eprintln!("[continue_iflow_chat] 后台线程开始");

        if let Ok(jsonl_path) = IFlowService::find_session_jsonl(&config_clone, &session_id_owned) {
            // 获取当前文件行数，从下一行开始读取，避免重复发送已有内容
            let start_line = IFlowService::get_jsonl_line_count(&jsonl_path).unwrap_or(0);
            eprintln!("[continue_iflow_chat] 当前文件有 {} 行，从第 {} 行开始读取", start_line, start_line);

            let session_id_clone = session_id_owned.clone();
            IFlowService::monitor_jsonl_file(
                jsonl_path,
                session_id_clone.clone(),
                move |event| {
                    let event_json = serde_json::to_string(&event)
                        .unwrap_or_else(|_| "{}".to_string());
                    eprintln!("[iflow] 发送事件: {}", event_json);
                    let _ = window_clone.emit("chat-event", event_json);

                    if matches!(event, StreamEvent::SessionEnd) {
                        if let Ok(mut sessions) = sessions_arc.lock() {
                            sessions.remove(&session_id_clone);
                        }
                    }
                },
                start_line, // 从当前行数开始，跳过已有内容
            );
        }

        let _ = child.wait();

        eprintln!("[continue_iflow_chat] 后台线程结束");
    });

    Ok(())
}

/// 终止指定进程（包括其子进程）
fn terminate_process(pid: u32) {
    #[cfg(windows)]
    {
        use std::process::Command;
        // 使用 /T 参数终止进程树
        let result = Command::new("taskkill")
            .args(["/F", "/T", "/PID", &pid.to_string()])
            .output();

        match result {
            Ok(output) => {
                if output.status.success() {
                    eprintln!("[terminate_process] 成功终止进程树: {}", pid);
                } else {
                    eprintln!("[terminate_process] 终止进程失败: {}", String::from_utf8_lossy(&output.stderr));
                }
            }
            Err(e) => {
                eprintln!("[terminate_process] 执行 taskkill 命令失败: {}", e);
            }
        }
    }

    #[cfg(not(windows))]
    {
        use std::process::Command;
        // Unix-like: 先尝试正常终止，等待后强制终止
        let _ = Command::new("kill")
            .arg("-TERM")
            .arg(pid.to_string())
            .output();

        std::thread::sleep(std::time::Duration::from_millis(500));

        let result = Command::new("kill")
            .args(["-9", &pid.to_string()])
            .output();

        match result {
            Ok(output) => {
                if output.status.success() {
                    eprintln!("[terminate_process] 成功终止进程: {}", pid);
                } else {
                    eprintln!("[terminate_process] 终止进程失败: {}", String::from_utf8_lossy(&output.stderr));
                }
            }
            Err(e) => {
                eprintln!("[terminate_process] 执行 kill 命令失败: {}", e);
            }
        }
    }
}

/// 中断聊天会话
#[tauri::command]
pub async fn interrupt_chat(
    session_id: String,
    state: tauri::State<'_, crate::AppState>,
) -> Result<()> {
    eprintln!("[interrupt_chat] 中断会话: {}", session_id);

    // 从 sessions 中取出并移除 PID
    let pid_opt = {
        let mut sessions = state.sessions.lock()
            .map_err(|e| crate::error::AppError::Unknown(e.to_string()))?;
        sessions.remove(&session_id)
    };

    if let Some(pid) = pid_opt {
        eprintln!("[interrupt_chat] 找到进程 PID: {}, 正在终止", pid);
        terminate_process(pid);
        eprintln!("[interrupt_chat] 中断命令已发送");
    } else {
        eprintln!("[interrupt_chat] 未找到会话: {}", session_id);
        return Err(AppError::ProcessError(format!("未找到会话: {}", session_id)));
    }

    Ok(())
}

/// 从文本中提取 IFlow session ID
fn extract_session_id(text: &str) -> Option<String> {
    let re = regex::Regex::new(r"session-[a-f0-9-]+").ok()?;
    re.find(text).map(|m| m.as_str().to_string())
}

// ============================================================================
// IFlow 会话历史相关命令
// ============================================================================

use crate::models::iflow_events::{
    IFlowSessionMeta, IFlowHistoryMessage, IFlowFileContext, IFlowTokenStats,
};

/// 列出 IFlow 会话
#[tauri::command]
pub async fn list_iflow_sessions(
    state: tauri::State<'_, crate::AppState>,
) -> Result<Vec<IFlowSessionMeta>> {
    eprintln!("[list_iflow_sessions] 获取 IFlow 会话列表");

    let config_store = state.config_store.lock()
        .map_err(|e| AppError::Unknown(e.to_string()))?;

    let config = config_store.get().clone();
    crate::services::iflow_service::IFlowService::list_sessions(&config)
}

/// 获取 IFlow 会话历史
#[tauri::command]
pub async fn get_iflow_session_history(
    session_id: String,
    state: tauri::State<'_, crate::AppState>,
) -> Result<Vec<IFlowHistoryMessage>> {
    eprintln!("[get_iflow_session_history] 获取会话历史: {}", session_id);

    let config_store = state.config_store.lock()
        .map_err(|e| AppError::Unknown(e.to_string()))?;

    let config = config_store.get().clone();
    crate::services::iflow_service::IFlowService::get_session_history(&config, &session_id)
}

/// 获取 IFlow 文件上下文
#[tauri::command]
pub async fn get_iflow_file_contexts(
    session_id: String,
    state: tauri::State<'_, crate::AppState>,
) -> Result<Vec<IFlowFileContext>> {
    eprintln!("[get_iflow_file_contexts] 获取文件上下文: {}", session_id);

    let config_store = state.config_store.lock()
        .map_err(|e| AppError::Unknown(e.to_string()))?;

    let config = config_store.get().clone();
    crate::services::iflow_service::IFlowService::get_file_contexts(&config, &session_id)
}

/// 获取 IFlow Token 统计
#[tauri::command]
pub async fn get_iflow_token_stats(
    session_id: String,
    state: tauri::State<'_, crate::AppState>,
) -> Result<IFlowTokenStats> {
    eprintln!("[get_iflow_token_stats] 获取 Token 统计: {}", session_id);

    let config_store = state.config_store.lock()
        .map_err(|e| AppError::Unknown(e.to_string()))?;

    let config = config_store.get().clone();
    crate::services::iflow_service::IFlowService::get_token_stats(&config, &session_id)
}

// ============================================================================
// Claude Code 原生历史相关命令
// ============================================================================

/// Claude Code 会话元数据
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeCodeSessionMeta {
    pub session_id: String,
    pub first_prompt: String,
    pub message_count: u32,
    pub created: String,
    pub modified: String,
    pub file_path: String,
    pub file_size: u64,
}

/// Claude Code 会话消息
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeCodeMessage {
    pub role: String,
    pub content: serde_json::Value,
    pub timestamp: Option<String>,
}

/// 获取 Claude Code 原生会话列表
///
/// 读取 ~/.claude/projects/{项目名}/sessions-index.json
#[tauri::command]
pub async fn list_claude_code_sessions(
    project_path: Option<String>,
) -> Result<Vec<ClaudeCodeSessionMeta>> {
    eprintln!("[list_claude_code_sessions] 获取 Claude Code 会话列表");

    // 获取项目目录名（用于构建 .claude 路径）
    let project_dir = if let Some(path) = project_path {
        PathBuf::from(path)
    } else {
        // 如果没有指定，使用当前工作目录
        std::env::current_dir()
            .map_err(|e| AppError::Unknown(format!("获取当前目录失败: {}", e)))?
    };

    // 获取项目名（如 "D:\Polaris" -> "D--Polaris"）
    let project_name = project_name_from_path(&project_dir);

    // 构建 sessions-index.json 路径
    let projects_dir = claude_projects_dir();
    let index_path = projects_dir.join(&project_name).join("sessions-index.json");

    eprintln!("[list_claude_code_sessions] 项目路径: {:?}", project_dir);
    eprintln!("[list_claude_code_sessions] 项目名: {}", project_name);
    eprintln!("[list_claude_code_sessions] projects 目录: {:?}", projects_dir);
    eprintln!("[list_claude_code_sessions] 索引文件: {:?}", index_path);

    if !index_path.exists() {
        eprintln!("[list_claude_code_sessions] 索引文件不存在，返回空列表");
        return Ok(vec![]);
    }

    // 读取并解析 sessions-index.json
    let content = std::fs::read_to_string(&index_path)
        .map_err(|e| AppError::Unknown(format!("读取索引文件失败: {}", e)))?;

    let index: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| AppError::Unknown(format!("解析索引文件失败: {}", e)))?;

    let mut sessions = vec![];

    if let Some(entries) = index.get("entries").and_then(|v| v.as_array()) {
        for entry in entries {
            if let (Some(session_id), Some(first_prompt), Some(message_count), Some(created), Some(modified), Some(full_path))
                = (
                    entry.get("sessionId").and_then(|v| v.as_str()),
                    entry.get("firstPrompt").and_then(|v| v.as_str()),
                    entry.get("messageCount").and_then(|v| v.as_u64()),
                    entry.get("created").and_then(|v| v.as_str()),
                    entry.get("modified").and_then(|v| v.as_str()),
                    entry.get("fullPath").and_then(|v| v.as_str()),
                ) {
                // 获取文件大小
                let file_size = std::fs::metadata(full_path)
                    .map(|m| m.len())
                    .unwrap_or(0);

                sessions.push(ClaudeCodeSessionMeta {
                    session_id: session_id.to_string(),
                    first_prompt: truncate_string(first_prompt, 100),
                    message_count: message_count as u32,
                    created: created.to_string(),
                    modified: modified.to_string(),
                    file_path: full_path.to_string(),
                    file_size,
                });
            }
        }
    }

    // 按修改时间倒序排序
    sessions.sort_by(|a, b| b.modified.cmp(&a.modified));

    eprintln!("[list_claude_code_sessions] 找到 {} 个会话", sessions.len());
    Ok(sessions)
}

/// 获取 Claude Code 会话详细历史
#[tauri::command]
pub async fn get_claude_code_session_history(
    session_id: String,
    project_path: Option<String>,
) -> Result<Vec<ClaudeCodeMessage>> {
    eprintln!("[get_claude_code_session_history] 获取会话历史: {}", session_id);

    let project_dir = if let Some(path) = project_path {
        PathBuf::from(path)
    } else {
        std::env::current_dir()
            .map_err(|e| AppError::Unknown(format!("获取当前目录失败: {}", e)))?
    };

    let project_name = project_name_from_path(&project_dir);
    let projects_dir = claude_projects_dir();
    let session_file_path = projects_dir.join(&project_name).join(format!("{}.jsonl", session_id));

    eprintln!("[get_claude_code_session_history] 项目路径: {:?}", project_dir);
    eprintln!("[get_claude_code_session_history] 项目名: {}", project_name);
    eprintln!("[get_claude_code_session_history] projects 目录: {:?}", projects_dir);
    eprintln!("[get_claude_code_session_history] 会话文件: {:?}", session_file_path);

    if !session_file_path.exists() {
        return Err(AppError::Unknown(format!("会话文件不存在: {:?}", session_file_path)));
    }

    let mut messages = vec![];
    let content = std::fs::read_to_string(&session_file_path)
        .map_err(|e| AppError::Unknown(format!("读取会话文件失败: {}", e)))?;

    // 解析 jsonl 文件
    for line in content.lines() {
        if let Ok(entry) = serde_json::from_str::<serde_json::Value>(line) {
            // 跳过非消息类型的条目
            let entry_type = entry.get("type").and_then(|v| v.as_str()).unwrap_or("");

            if entry_type == "user" || entry_type == "assistant" {
                if let Some(message) = entry.get("message") {
                    let role = entry_type.to_string();
                    let content_val = message.get("content").cloned().unwrap_or(serde_json::json!(""));

                    // 提取时间戳
                    let timestamp = entry.get("timestamp")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string());

                    messages.push(ClaudeCodeMessage {
                        role,
                        content: content_val,
                        timestamp,
                    });
                }
            }
        }
    }

    eprintln!("[get_claude_code_session_history] 解析到 {} 条消息", messages.len());
    Ok(messages)
}

/// 将路径转换为 Claude Code 项目名格式
/// 例如: "D:\Polaris" -> "D--Polaris"
fn project_name_from_path(path: &Path) -> String {
    path.to_string_lossy()
        .replace(':', "--")
        .replace("\\", "-")
        .replace("/", "-")
        .replace("---", "--")  // 修复 D: -> D-- 后再加 - 导致的 D--- 问题
}

/// 获取 Claude Code projects 目录
/// 通常位于 ~/.claude/projects/
fn claude_projects_dir() -> PathBuf {
    // Windows: 优先使用 USERPROFILE
    #[cfg(windows)]
    {
        if let Some(userprofile) = std::env::var("USERPROFILE").ok() {
            return PathBuf::from(userprofile).join(".claude").join("projects");
        }
    }

    // 非-Windows 或备选方案
    #[cfg(not(windows))]
    {
        if let Some(home) = std::env::var("HOME").ok() {
            return PathBuf::from(home).join(".claude").join("projects");
        }
    }

    // 最后备选：当前目录
    PathBuf::from(".claude").join("projects")
}

/// 截断字符串到指定长度
fn truncate_string(s: &str, max_len: usize) -> String {
    if s.len() <= max_len {
        s.to_string()
    } else {
        format!("{}...", s.chars().take(max_len.saturating_sub(3)).collect::<String>())
    }
}
