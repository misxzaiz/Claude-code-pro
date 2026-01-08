use crate::error::{AppError, Result};
use crate::models::config::Config;
use crate::models::events::StreamEvent;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio, Child};
use std::sync::Arc;
use tauri::{Emitter, Window};
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
fn build_node_command(cli_js: &str, message: &str) -> Command {
    let mut cmd = Command::new("node");
    cmd.arg(cli_js)
        .arg("--print")
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
fn build_node_command_resume(cli_js: &str, session_id: &str, message: &str) -> Command {
    let mut cmd = Command::new("node");
    cmd.arg(cli_js)
        .arg("--resume")
        .arg(session_id)
        .arg("--print")
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
    pub fn start(config: &Config, message: &str) -> Result<Self> {
        eprintln!("[ChatSession::start] 启动 Claude 会话");
        eprintln!("[ChatSession::start] claude_cmd: {}", config.claude_cmd);
        eprintln!("[ChatSession::start] message 长度: {} 字符", message.len());

        // 根据平台构建不同的命令
        #[cfg(windows)]
        let mut cmd = {
            // Windows: 直接调用 Node.js，绕过 cmd.exe
            let (_node_exe, cli_js) = resolve_node_and_cli(&config.claude_cmd)?;
            build_node_command(&cli_js, message)
        };

        #[cfg(not(windows))]
        let mut cmd = {
            // Unix/Mac: 直接使用 claude 命令
            Command::new(&config.claude_cmd)
                .arg("--print")
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

        let stdout = self.child.stdout
            .ok_or_else(|| AppError::ProcessError("无法获取 stdout".to_string()));

        if stdout.is_err() {
            return;
        }

        let stderr = self.child.stderr
            .ok_or_else(|| AppError::ProcessError("无法获取 stderr".to_string()));

        if stderr.is_err() {
            return;
        }

        let stdout = stdout.unwrap();
        let stderr = stderr.unwrap();

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
                callback(event);
            } else {
                eprintln!("[ChatSession::read_events] 解析失败，原始内容: {}", line_trimmed.chars().take(200).collect::<String>());
            }
        }

        eprintln!("[ChatSession::read_events] 读取结束，共处理 {} 行", line_count);

        // 【关键修复】进程退出时自动发送 session_end 事件
        // 这样即使进程异常退出，前端也能收到通知并重置 isStreaming 状态
        eprintln!("[ChatSession::read_events] 发送 session_end 事件");
        callback(StreamEvent::SessionEnd);
    }
}

// ============================================================================
// Tauri Commands
// ============================================================================

/// 启动聊天会话（后台异步执行）
#[tauri::command]
pub async fn start_chat(
    message: String,
    window: Window,
    state: tauri::State<'_, crate::AppState>,
    work_dir: Option<String>,
) -> Result<String> {
    eprintln!("[start_chat] 收到消息，长度: {} 字符", message.len());

    // 从 AppState 获取实际配置
    let config_store = state.config_store.lock()
        .map_err(|e| crate::error::AppError::Unknown(e.to_string()))?;
    let mut config = config_store.get().clone();

    // 如果传入了 work_dir 参数，优先使用它而不是配置中的
    if let Some(ref work_dir_str) = work_dir {
        let work_dir_path = PathBuf::from(work_dir_str);
        eprintln!("[start_chat] 使用传入的工作目录: {:?}", work_dir_path);
        config.work_dir = Some(work_dir_path);
    }

    // 启动 Claude 会话
    let session = ChatSession::start(&config, &message)?;

    let session_id = session.id.clone();
    let window_clone = window.clone();
    let process_id = session.child.id();

    eprintln!("[start_chat] 临时会话 ID: {}, 进程 ID: {}", session_id, process_id);

    // 保存 PID 到全局 sessions，使用临时 UUID 作为 key
    // 稍后收到真实的 session_id 时会更新 key
    {
        let mut sessions = state.sessions.lock()
            .map_err(|e| crate::error::AppError::Unknown(e.to_string()))?;
        sessions.insert(session_id.clone(), process_id);
    }

    // 释放所有 lock 后再启动线程
    drop(config_store);

    // 克隆 sessions Arc 以便在回调中使用
    let sessions_arc = Arc::clone(&state.sessions);
    let temp_session_id = session_id.clone();

    // 在后台线程中读取输出（消费 Child）
    std::thread::spawn(move || {
        eprintln!("[start_chat] 后台线程开始");
        session.read_events(move |event| {
            // 检查是否收到真实的 session_id
            // System 事件的 session_id 存储在 extra HashMap 中
            if let StreamEvent::System { extra, .. } = &event {
                if let Some(serde_json::Value::String(real_session_id)) = extra.get("session_id") {
                    eprintln!("[start_chat] 收到真实 session_id: {}, 更新映射", real_session_id);

                    // 获取 PID 并更新 sessions 映射
                    if let Ok(mut sessions) = sessions_arc.lock() {
                        // 从临时 key 获取 PID
                        if let Some(&pid) = sessions.get(&temp_session_id) {
                            // 删除临时映射
                            sessions.remove(&temp_session_id);
                            // 用真实 session_id 重新插入
                            sessions.insert(real_session_id.clone(), pid);
                            eprintln!("[start_chat] 映射已更新: {} -> PID {}", real_session_id, pid);
                        }
                    }
                }
            }

            // 发送事件到前端 - 直接序列化为 JSON 字符串
            let event_json = serde_json::to_string(&event)
                .unwrap_or_else(|_| "{}".to_string());
            eprintln!("[start_chat] 发送事件: {}", event_json);
            let _ = window_clone.emit("chat-event", event_json);
        });
        eprintln!("[start_chat] 后台线程结束");
    });

    Ok(session_id)
}

/// 继续聊天会话
#[tauri::command]
pub async fn continue_chat(
    session_id: String,
    message: String,
    window: Window,
    state: tauri::State<'_, crate::AppState>,
    work_dir: Option<String>,
) -> Result<()> {
    eprintln!("[continue_chat] 继续会话: {}", session_id);
    eprintln!("[continue_chat] 消息长度: {} 字符", message.len());

    // 从 AppState 获取实际配置
    let config_store = state.config_store.lock()
        .map_err(|e| crate::error::AppError::Unknown(e.to_string()))?;
    let mut config = config_store.get().clone();

    // 如果传入了 work_dir 参数，优先使用它而不是配置中的
    if let Some(ref work_dir_str) = work_dir {
        let work_dir_path = PathBuf::from(work_dir_str);
        eprintln!("[continue_chat] 使用传入的工作目录: {:?}", work_dir_path);
        config.work_dir = Some(work_dir_path);
    }

    // 如果已存在旧进程，先尝试终止它
    let old_pid = {
        let mut sessions = state.sessions.lock()
            .map_err(|e| crate::error::AppError::Unknown(e.to_string()))?;
        sessions.remove(&session_id)
    };

    if let Some(pid) = old_pid {
        eprintln!("[continue_chat] 发现旧进程 PID: {}, 尝试终止", pid);
        terminate_process(pid);
    }

    // 使用 Claude CLI 原生的 --resume 参数恢复会话
    eprintln!("[continue_chat] 使用 --resume 参数恢复会话");

    // 根据平台构建不同的命令
    #[cfg(windows)]
    let mut cmd = {
        // Windows: 直接调用 Node.js
        let (_node_exe, cli_js) = resolve_node_and_cli(&config.claude_cmd)?;
        build_node_command_resume(&cli_js, &session_id, &message)
    };

    #[cfg(not(windows))]
    let mut cmd = {
        Command::new(&config.claude_cmd)
            .arg("--resume")
            .arg(&session_id)
            .arg("--print")
            .arg("--verbose")
            .arg("--output-format")
            .arg("stream-json")
            .arg("--permission-mode")
            .arg("bypassPermissions")
            .arg(&message)
    };

    cmd.stdout(Stdio::piped())
        .stderr(Stdio::piped());

    // Windows 上隐藏窗口
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    // 设置工作目录
    if let Some(ref work_dir) = config.work_dir {
        eprintln!("[continue_chat] work_dir: {:?}", work_dir);
        cmd.current_dir(work_dir);
    }

    // 设置 Git Bash 环境变量 (Windows 需要)
    if let Some(ref git_bash_path) = config.git_bin_path {
        eprintln!("[continue_chat] 设置 CLAUDE_CODE_GIT_BASH_PATH: {}", git_bash_path);
        cmd.env("CLAUDE_CODE_GIT_BASH_PATH", git_bash_path);
    }

    eprintln!("[continue_chat] 执行命令: {:?}", cmd);

    let child = cmd.spawn()
        .map_err(|e| AppError::ProcessError(format!("继续 Claude 会话失败: {}", e)))?;

    let new_pid = child.id();
    let window_clone = window.clone();

    eprintln!("[continue_chat] 新进程 PID: {}", new_pid);

    // 保存新 PID 到全局 sessions
    {
        let mut sessions = state.sessions.lock()
            .map_err(|e| crate::error::AppError::Unknown(e.to_string()))?;
        sessions.insert(session_id.clone(), new_pid);
    }

    // 释放所有 lock 后再启动线程
    drop(config_store);

    // 在后台线程中读取输出（消费 Child）
    std::thread::spawn(move || {
        eprintln!("[continue_chat] 后台线程开始");
        let session = ChatSession::with_id_and_child(session_id.clone(), child);
        session.read_events(move |event| {
            // 发送事件到前端
            let event_json = serde_json::to_string(&event)
                .unwrap_or_else(|_| "{}".to_string());
            eprintln!("[continue_chat] 发送事件: {}", event_json);
            let _ = window_clone.emit("chat-event", event_json);
        });
        eprintln!("[continue_chat] 后台线程结束");
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
