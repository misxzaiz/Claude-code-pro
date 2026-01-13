/// IFlow CLI Tauri Commands
///
/// 提供与 IFlow CLI 交互的 Tauri 命令

use crate::error::{AppError, Result};
use crate::models::events::StreamEvent;
use crate::services::iflow_service::IFlowService;
use std::sync::Arc;
use tauri::{Emitter, State, Window};
use std::io::{BufRead, BufReader};

/// 启动 IFlow 聊天会话
#[tauri::command]
pub async fn start_iflow_chat(
    message: String,
    window: Window,
    state: State<'_, crate::AppState>,
) -> Result<String> {
    eprintln!("[start_iflow_chat] 收到消息，长度: {} 字符", message.len());

    // 从 AppState 获取配置
    let config_store = state.config_store.lock()
        .map_err(|e| AppError::Unknown(e.to_string()))?;
    let config = config_store.get().clone();

    // 启动 IFlow 会话
    let session = IFlowService::start_chat(&config, &message)?;

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

    // 释放 lock 后启动线程
    drop(config_store);

    let sessions_arc = Arc::clone(&state.sessions);

    // 启动后台线程监控进程
    std::thread::spawn(move || {
        eprintln!("[start_iflow_chat] 后台线程开始");

        let temp_id = temp_session_id.clone();
        let mut session_id_found = false;
        let mut jsonl_monitor_started = false;

        // 读取 stderr 以获取会话信息
        let mut child = session.child;
        if let Some(stderr) = child.stderr.take() {
            let reader = BufReader::new(stderr);

            for line in reader.lines() {
                if let Ok(line_text) = line {
                    eprintln!("[iflow stderr] {}", line_text);

                    // 尝试从 stderr 中提取 session-id
                    // IFlow 可能输出类似 "session-xxx" 的信息
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
                            let _ = window_clone.emit("chat-event", serde_json::json!({
                                "type": "system",
                                "subtype": "session_id",
                                "extra": {
                                    "session_id": id
                                }
                            }).to_string());

                            // 查找 JSONL 文件并启动监控
                            if let Ok(jsonl_path) = IFlowService::find_session_jsonl(&config, &id) {
                                eprintln!("[start_iflow_chat] 找到 JSONL 文件: {:?}", jsonl_path);

                                let sessions_arc_clone = Arc::clone(&sessions_arc);
                                let id_clone = id.clone();
                                let window_clone2 = window_clone.clone();

                                // 启动 JSONL 文件监控
                                IFlowService::monitor_jsonl_file(
                                    jsonl_path,
                                    id_clone.clone(),
                                    move |event| {
                                        let event_json = serde_json::to_string(&event)
                                            .unwrap_or_else(|_| "{}".to_string());
                                        eprintln!("[iflow] 发送事件: {}", event_json);
                                        let _ = window_clone2.emit("chat-event", event_json);

                                        // 如果是 session_end，移除会话
                                        if matches!(event, StreamEvent::SessionEnd) {
                                            if let Ok(mut sessions) = sessions_arc_clone.lock() {
                                                sessions.remove(&id_clone);
                                            }
                                        }
                                    },
                                );

                                jsonl_monitor_started = true;
                            }
                        }
                    }
                }
            }
        }

        // 如果没有找到 JSONL 文件，等待并重试
        if !jsonl_monitor_started && session_id_found {
            eprintln!("[start_iflow_chat] 等待 JSONL 文件创建...");
            std::thread::sleep(std::time::Duration::from_secs(1));

            // 可以在这里添加重试逻辑
        }

        // 等待进程结束
        let _ = child.wait();

        eprintln!("[start_iflow_chat] 后台线程结束");
    });

    Ok(return_session_id)
}

/// 继续聊天会话
#[tauri::command]
pub async fn continue_iflow_chat(
    session_id: String,
    message: String,
    window: Window,
    state: State<'_, crate::AppState>,
) -> Result<()> {
    eprintln!("[continue_iflow_chat] 继续会话: {}", session_id);
    eprintln!("[continue_iflow_chat] 消息长度: {} 字符", message.len());

    // 从 AppState 获取配置
    let config_store = state.config_store.lock()
        .map_err(|e| AppError::Unknown(e.to_string()))?;
    let config = config_store.get().clone();

    // 如果已存在旧进程，先尝试终止它
    let old_pid = {
        let mut sessions = state.sessions.lock()
            .map_err(|e| AppError::Unknown(e.to_string()))?;
        sessions.remove(&session_id)
    };

    if let Some(pid) = old_pid {
        eprintln!("[continue_iflow_chat] 发现旧进程 PID: {:?}, 尝试终止", pid);
        terminate_process(pid);
    }

    // 启动新进程
    let mut child = IFlowService::continue_chat(&config, &session_id, &message)?;
    let new_pid = child.id();

    eprintln!("[continue_iflow_chat] 新进程 PID: {:?}", new_pid);

    // 保存新 PID
    {
        let mut sessions = state.sessions.lock()
            .map_err(|e| AppError::Unknown(e.to_string()))?;
        sessions.insert(session_id.clone(), new_pid);
    }

    let sessions_arc = Arc::clone(&state.sessions);
    let window_clone = window.clone();

    // 启动后台线程
    std::thread::spawn(move || {
        eprintln!("[continue_iflow_chat] 后台线程开始");

        // 查找 JSONL 文件并监控
        if let Ok(jsonl_path) = IFlowService::find_session_jsonl(&config, &session_id) {
            IFlowService::monitor_jsonl_file(
                jsonl_path,
                session_id.clone(),
                move |event| {
                    let event_json = serde_json::to_string(&event)
                        .unwrap_or_else(|_| "{}".to_string());
                    eprintln!("[iflow] 发送事件: {}", event_json);
                    let _ = window_clone.emit("chat-event", event_json);

                    // 如果是 session_end，移除会话
                    if matches!(event, StreamEvent::SessionEnd) {
                        if let Ok(mut sessions) = sessions_arc.lock() {
                            sessions.remove(&session_id);
                        }
                    }
                },
            );
        }

        // 等待进程结束
        let _ = child.wait();

        eprintln!("[continue_iflow_chat] 后台线程结束");
    });

    Ok(())
}

/// 中断聊天会话
#[tauri::command]
pub async fn interrupt_iflow_chat(
    session_id: String,
    state: State<'_, crate::AppState>,
) -> Result<()> {
    eprintln!("[interrupt_iflow_chat] 中断会话: {}", session_id);

    // 从 sessions 中取出并移除 PID
    let pid_opt = {
        let mut sessions = state.sessions.lock()
            .map_err(|e| AppError::Unknown(e.to_string()))?;
        sessions.remove(&session_id)
    };

    if let Some(pid) = pid_opt {
        eprintln!("[interrupt_iflow_chat] 找到进程 PID: {:?}, 正在终止", pid);
        terminate_process(pid);
        eprintln!("[interrupt_iflow_chat] 中断命令已发送");
    } else {
        eprintln!("[interrupt_iflow_chat] 未找到会话: {}", session_id);
        return Err(AppError::ProcessError(format!("未找到会话: {}", session_id)));
    }

    Ok(())
}

/// 从文本中提取 session ID
fn extract_session_id(text: &str) -> Option<String> {
    // IFlow 可能输出 "session-xxx" 格式的 ID
    let re = regex::Regex::new(r"session-[a-f0-9-]+").ok()?;
    re.find(text).map(|m| m.as_str().to_string())
}

/// 终止进程
fn terminate_process(pid: u32) {
    #[cfg(windows)]
    {
        use std::process::Command;
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
