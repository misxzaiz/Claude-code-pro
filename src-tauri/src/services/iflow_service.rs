/// IFlow CLI 服务
///
/// 管理 IFlow CLI 进程和会话文件监控

use crate::error::{AppError, Result};
use crate::models::config::Config;
use crate::models::events::StreamEvent;
use crate::models::iflow_events::{
    IFlowJsonlEvent, IFlowSessionMeta, IFlowHistoryMessage, IFlowFileContext,
    IFlowTokenStats, IFlowToolCall, IFlowProjectsConfig,
};
use std::collections::HashMap;
use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio, Child};
use std::sync::Arc;
use std::time::Duration;
use tauri::{Emitter, Window};
use uuid::Uuid;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

/// Windows 进程创建标志：不创建新窗口
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

/// IFlow 会话
pub struct IFlowSession {
    pub id: String,
    pub child: Child,
    pub jsonl_path: PathBuf,
    pub session_id: String,
}

impl IFlowSession {
    /// 创建 IFlowSession 实例
    pub fn new(id: String, child: Child, jsonl_path: PathBuf, session_id: String) -> Self {
        Self {
            id,
            child,
            jsonl_path,
            session_id,
        }
    }
}

/// IFlow CLI 服务
pub struct IFlowService;

impl IFlowService {
    /// 获取 IFlow 配置目录
    fn get_iflow_config_dir() -> Result<PathBuf> {
        let home = std::env::var("USERPROFILE")
            .or_else(|_| std::env::var("HOME"))
            .map_err(|_| AppError::ConfigError("无法获取用户目录".to_string()))?;

        let mut config_dir = PathBuf::from(home);
        config_dir.push(".iflow");

        if !config_dir.exists() {
            return Err(AppError::ConfigError("IFlow 配置目录不存在".to_string()));
        }

        Ok(config_dir)
    }

    /// 编码项目路径为 IFlow 格式
    ///
    /// IFlow 将路径中的特殊字符替换：
    /// C:\Users\... -> -C-Users-...（只带前缀，不带后缀）
    /// 关键：盘符后的冒号和反斜杠被当作一个分隔符，只产生一个 -
    fn encode_project_path(path: &str) -> String {
        // 先将盘符的 : 替换为空，然后统一处理 \ 和 /
        let normalized = path.replace(":", "").replace("\\", "-").replace("/", "-");

        // IFlow 在编码后的路径前面加 -
        format!("-{}", normalized)
    }

    /// 获取项目会话目录
    fn get_project_session_dir(work_dir: &str) -> Result<PathBuf> {
        let config_dir = Self::get_iflow_config_dir()?;
        eprintln!("[get_project_session_dir] config_dir: {:?}", config_dir);
        eprintln!("[get_project_session_dir] work_dir: {}", work_dir);

        let encoded_path = Self::encode_project_path(work_dir);
        eprintln!("[get_project_session_dir] encoded_path: {}", encoded_path);

        // 先列出 projects 目录下的所有子目录，帮助调试
        let mut projects_dir = config_dir.clone();
        projects_dir.push("projects");
//         if projects_dir.exists() {
//             eprintln!("[get_project_session_dir] projects 目录存在，列出内容:");
//             if let Ok(entries) = std::fs::read_dir(&projects_dir) {
//                 for entry in entries.flatten() {
//                     if let Some(name) = entry.file_name().to_str() {
//                         eprintln!("[get_project_session_dir]   - {}", name);
//                     }
//                 }
//             }
//         } else {
//             eprintln!("[get_project_session_dir] projects 目录不存在: {:?}", projects_dir);
//         }

        projects_dir.push(&encoded_path);

        Ok(projects_dir)
    }

    /// 查找最新的会话文件
    fn find_latest_session(session_dir: &Path) -> Result<PathBuf> {
        if !session_dir.exists() {
            return Err(AppError::ProcessError("会话目录不存在".to_string()));
        }

        // 读取目录中的所有 .jsonl 文件
        let entries = std::fs::read_dir(session_dir)
            .map_err(|e| AppError::ProcessError(format!("读取会话目录失败: {}", e)))?;

        let mut latest_file: Option<PathBuf> = None;
        let mut latest_time: u64 = 0;

        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|s| s.to_str()) == Some("jsonl") {
                // 获取文件修改时间
                let metadata = std::fs::metadata(&path);
                if let Ok(meta) = metadata {
                    if let Ok(modified) = meta.modified() {
                        let modified_secs = modified.duration_since(std::time::UNIX_EPOCH)
                            .unwrap_or_default()
                            .as_secs();
                        if modified_secs > latest_time {
                            latest_time = modified_secs;
                            latest_file = Some(path);
                        }
                    }
                }
            }
        }

        latest_file.ok_or_else(|| AppError::ProcessError("未找到会话文件".to_string()))
    }

    /// 启动新的 IFlow 聊天会话
    pub fn start_chat(config: &Config, message: &str) -> Result<IFlowSession> {
        eprintln!("[IFlowService::start_chat] 启动 IFlow 会话");

        // 确定工作目录
        let work_dir = config.work_dir.as_deref()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|| {
                // 默认使用当前目录
                std::env::current_dir()
                    .ok()
                    .map(|p| p.to_string_lossy().to_string())
                    .unwrap_or_else(|| ".".to_string())
            });

        // 获取 IFlow CLI 路径
        let iflow_cmd = Self::get_iflow_cmd(config)?;

        // 构建命令
        let mut cmd = Self::build_iflow_command(&iflow_cmd, &work_dir, message);

        eprintln!("[IFlowService] 执行命令: {:?}", cmd);

        let child = cmd.spawn()
            .map_err(|e| AppError::ProcessError(format!("启动 IFlow 失败: {}", e)))?;

        let process_id = child.id();
        eprintln!("[IFlowService] 进程 PID: {:?}", process_id);

        // 生成临时会话 ID
        let temp_id = Uuid::new_v4().to_string();

        // 先返回临时实例，稍后会更新 session_id 和 jsonl_path
        Ok(IFlowSession::new(
            temp_id,
            child,
            PathBuf::new(), // 临时为空，稍后更新
            String::new(),  // 临时为空，稍后更新
        ))
    }

    /// 获取 IFlow CLI 路径
    fn get_iflow_cmd(config: &Config) -> Result<String> {
        if let Some(ref cli_path) = config.iflow.cli_path {
            Ok(cli_path.clone())
        } else {
            // 尝试查找 IFlow
            if let Some(path) = crate::services::config_store::ConfigStore::find_iflow_path() {
                Ok(path)
            } else {
                Err(AppError::ConfigError("未找到 IFlow CLI，请在设置中配置路径".to_string()))
            }
        }
    }

    /// 构建 IFlow 命令
    fn build_iflow_command(iflow_cmd: &str, work_dir: &str, message: &str) -> Command {
        let mut cmd = Command::new(iflow_cmd);

        // 基础参数
        cmd.arg("--yolo")  // 自动确认所有操作
            .arg("--prompt")
            .arg(message);

        // 设置工作目录
        cmd.current_dir(work_dir);

        // 设置标准输出和错误
        cmd.stdout(Stdio::piped())
            .stderr(Stdio::piped());

        // Windows 上隐藏窗口
        #[cfg(windows)]
        cmd.creation_flags(CREATE_NO_WINDOW);

        cmd
    }

    /// 监控会话文件并发送事件（类似 tail -f）
    ///
    /// # 参数
    /// * `jsonl_path` - JSONL 文件路径
    /// * `session_id` - 会话 ID
    /// * `callback` - 事件回调
    /// * `start_line` - 开始读取的行号（0 表示从头开始），用于 continue_chat 时跳过已有内容
    ///
    /// # 行为
    /// 1. 先读取现有内容，跳过前 `start_line` 行
    /// 2. 然后持续监控文件，等待新内容追加
    /// 3. 检测到 `session_end` 事件时退出
    pub fn monitor_jsonl_file<F>(
        jsonl_path: PathBuf,
        session_id: String,
        mut callback: F,
        start_line: usize,
    ) -> std::thread::JoinHandle<()>
    where
        F: FnMut(StreamEvent) + Send + 'static,
    {
        std::thread::spawn(move || {
            eprintln!("[IFlowService] 开始监控文件: {:?}, 从第 {} 行开始", jsonl_path, start_line);

            // 等待文件创建
            let mut wait_count = 0;
            while !jsonl_path.exists() && wait_count < 50 {
                std::thread::sleep(Duration::from_millis(100));
                wait_count += 1;
            }

            if !jsonl_path.exists() {
                eprintln!("[IFlowService] 文件未创建: {:?}", jsonl_path);
                callback(StreamEvent::Error {
                    error: "会话文件未创建".to_string(),
                });
                return;
            }

            // 持续监控文件（类似 tail -f）
            // 初始化 line_count 为 start_line，这样第一次循环就会跳过前面的行
            let mut line_count = start_line;
            let mut sleep_count = 0;
            const MAX_SLEEPS: usize = 600; // 最多等待 60 秒（600 * 100ms）

            loop {
                // 重新打开文件以读取新内容
                let file = match File::open(&jsonl_path) {
                    Ok(f) => f,
                    Err(e) => {
                        eprintln!("[IFlowService] 打开文件失败: {}", e);
                        callback(StreamEvent::Error {
                            error: format!("打开会话文件失败: {}", e),
                        });
                        return;
                    }
                };

                let reader = BufReader::new(file);
                let mut current_file_lines = 0;
                let mut has_new_content = false;

                for line in reader.lines() {
                    let line = match line {
                        Ok(l) => l,
                        Err(e) => {
                            eprintln!("[IFlowService] 读取行错误: {}", e);
                            break;
                        }
                    };

                    let line_trimmed = line.trim();
                    if line_trimmed.is_empty() {
                        continue;
                    }

                    current_file_lines += 1;

                    // 跳过已经处理过的行
                    if current_file_lines <= line_count {
                        continue;
                    }

                    // 这是新行
                    has_new_content = true;
                    line_count = current_file_lines;
                    sleep_count = 0; // 重置睡眠计数

                    // 解析 JSONL 事件
                    if let Some(iflow_event) = IFlowJsonlEvent::parse_line(line_trimmed) {
                        eprintln!("[IFlowService] 行 {}: type={}", line_count, iflow_event.event_type);

                        // 转换并发送事件（可能返回多个事件）
                        let stream_events = iflow_event.to_stream_events();
                        for stream_event in stream_events {
                            let is_session_end = matches!(stream_event, StreamEvent::SessionEnd);
                            callback(stream_event);

                            // 如果检测到会话结束，退出
                            if is_session_end {
                                eprintln!("[IFlowService] 检测到会话结束");
                                return;
                            }
                        }
                    } else {
                        eprintln!("[IFlowService] 解析失败: {}", line_trimmed.chars().take(100).collect::<String>());
                    }
                }

                // 如果没有新内容，等待一段时间再检查
                if !has_new_content {
                    sleep_count += 1;
                    if sleep_count >= MAX_SLEEPS {
                        eprintln!("[IFlowService] 等待超时，文件监控结束");
                        return;
                    }
                    std::thread::sleep(Duration::from_millis(100));
                }
            }
        })
    }

    /// 获取会话文件当前行数（用于 continue_chat 时确定从哪行开始读取）
    pub fn get_jsonl_line_count(jsonl_path: &PathBuf) -> Result<usize> {
        let file = File::open(jsonl_path)
            .map_err(|e| AppError::ProcessError(format!("打开会话文件失败: {}", e)))?;

        let reader = BufReader::new(file);
        let count = reader
            .lines()
            .filter_map(|r| r.ok())
            .filter(|l| !l.trim().is_empty())
            .count();

        Ok(count)
    }

    /// 继续聊天会话
    pub fn continue_chat(config: &Config, session_id: &str, message: &str) -> Result<Child> {
        eprintln!("[IFlowService::continue_chat] 继续会话: {}", session_id);

        let work_dir = config.work_dir.as_deref()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|| {
                std::env::current_dir()
                    .ok()
                    .map(|p| p.to_string_lossy().to_string())
                    .unwrap_or_else(|| ".".to_string())
            });

        // 获取 IFlow CLI 路径
        let iflow_cmd = Self::get_iflow_cmd(config)?;

        // 构建继续命令
        let mut cmd = Command::new(&iflow_cmd);
        cmd.arg("--yolo")
            .arg("--resume")
            .arg(session_id)
            .arg("--prompt")
            .arg(message);

        cmd.current_dir(&work_dir);
        cmd.stdout(Stdio::piped())
            .stderr(Stdio::piped());

        #[cfg(windows)]
        cmd.creation_flags(CREATE_NO_WINDOW);

        eprintln!("[IFlowService] 执行命令: {:?}", cmd);

        cmd.spawn()
            .map_err(|e| AppError::ProcessError(format!("继续 IFlow 会话失败: {}", e)))
    }

    /// 查找会话对应的 JSONL 文件
    pub fn find_session_jsonl(config: &Config, session_id: &str) -> Result<PathBuf> {
        let work_dir = config.work_dir.as_deref()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|| ".".to_string());

        eprintln!("[find_session_jsonl] work_dir: {}", work_dir);
        eprintln!("[find_session_jsonl] session_id: {}", session_id);

        let session_dir = Self::get_project_session_dir(&work_dir)?;
        eprintln!("[find_session_jsonl] session_dir: {:?}", session_dir);
        eprintln!("[find_session_jsonl] session_dir 存在: {}", session_dir.exists());

        // 查找包含指定 session_id 的文件
        let entries = std::fs::read_dir(&session_dir)
            .map_err(|e| AppError::ProcessError(format!("读取会话目录失败: {}", e)))?;

        let mut file_count = 0;
        for entry in entries.flatten() {
            let path = entry.path();
            if let Some(filename) = path.file_name().and_then(|s| s.to_str()) {
//                 eprintln!("[find_session_jsonl] 检查文件: {}", filename);
                file_count += 1;

                if filename.starts_with("session-") && filename.ends_with(".jsonl") {
                    eprintln!("[find_session_jsonl] 匹配文件名格式，检查内容");
                    // 检查文件内容是否匹配 session_id
                    if let Ok(file) = File::open(&path) {
                        let reader = BufReader::new(file);
                        let mut line_num = 0;
                        for line in reader.lines().take(10) {
                            line_num += 1;
                            if let Ok(line_text) = line {
//                                 eprintln!("[find_session_jsonl] 行{}: {}", line_num, line_text.chars().take(100).collect::<String>());
                                if let Some(event) = IFlowJsonlEvent::parse_line(&line_text) {
//                                     eprintln!("[find_session_jsonl] 解析成功，event.session_id: {}", event.session_id);
                                    if event.session_id == session_id {
//                                         eprintln!("[find_session_jsonl] 找到匹配文件!");
                                        return Ok(path);
                                    }
                                }
                            }
                        }
                    } else {
                        eprintln!("[find_session_jsonl] 无法打开文件");
                    }
                }
            }
        }

        eprintln!("[find_session_jsonl] 共检查 {} 个文件，未找到匹配", file_count);
        Err(AppError::ProcessError(format!("未找到会话文件: {}", session_id)))
    }

    // ========================================================================
    // 会话历史相关方法
    // ========================================================================

    /// 读取 projects.json 获取项目配置
    fn read_projects_config() -> Result<IFlowProjectsConfig> {
        let config_dir = Self::get_iflow_config_dir()?;
        let projects_json_path = config_dir.join("config").join("projects.json");

        eprintln!("[read_projects_config] 读取: {:?}", projects_json_path);

        if !projects_json_path.exists() {
            return Ok(IFlowProjectsConfig {
                projects: HashMap::new(),
            });
        }

        let file = File::open(&projects_json_path)
            .map_err(|e| AppError::ProcessError(format!("打开 projects.json 失败: {}", e)))?;

        let config: IFlowProjectsConfig = serde_json::from_reader(file)
            .map_err(|e| AppError::ProcessError(format!("解析 projects.json 失败: {}", e)))?;

        Ok(config)
    }

    /// 列出项目的所有 IFlow 会话元数据
    pub fn list_sessions(config: &Config) -> Result<Vec<IFlowSessionMeta>> {
        let work_dir = config.work_dir.as_deref()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|| {
                std::env::current_dir()
                    .ok()
                    .map(|p| p.to_string_lossy().to_string())
                    .unwrap_or_else(|| ".".to_string())
            });

        let session_dir = Self::get_project_session_dir(&work_dir)?;

        if !session_dir.exists() {
            eprintln!("[list_sessions] 会话目录不存在: {:?}", session_dir);
            return Ok(Vec::new());
        }

        // 读取目录中的所有 .jsonl 文件
        let entries = std::fs::read_dir(&session_dir)
            .map_err(|e| AppError::ProcessError(format!("读取会话目录失败: {}", e)))?;

        let mut sessions = Vec::new();

        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|s| s.to_str()) == Some("jsonl") {
                if let Ok(meta) = Self::extract_session_meta(&path) {
                    sessions.push(meta);
                }
            }
        }

        // 按更新时间倒序排列
        sessions.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));

        Ok(sessions)
    }

    /// 从 JSONL 文件提取会话元数据
    fn extract_session_meta(jsonl_path: &Path) -> Result<IFlowSessionMeta> {
        let file_size = std::fs::metadata(jsonl_path)
            .map(|m| m.len())
            .unwrap_or(0);

        let file = File::open(jsonl_path)
            .map_err(|e| AppError::ProcessError(format!("打开会话文件失败: {}", e)))?;

        let reader = BufReader::new(file);

        let mut message_count = 0u32;
        let mut input_tokens = 0u32;
        let mut output_tokens = 0u32;
        let mut first_user_content = String::new();
        let mut created_at: Option<String> = None;
        let mut updated_at: Option<String> = None;
        let mut session_id = String::new();

        for line in reader.lines() {
            let line = line.map_err(|e| AppError::ProcessError(format!("读取行失败: {}", e)))?;
            let line_trimmed = line.trim();

            if line_trimmed.is_empty() {
                continue;
            }

            if let Some(event) = IFlowJsonlEvent::parse_line(line_trimmed) {
                // 记录 session_id
                if session_id.is_empty() {
                    session_id = event.session_id.clone();
                }

                // 记录时间
                if created_at.is_none() {
                    created_at = Some(event.timestamp.clone());
                }
                updated_at = Some(event.timestamp.clone());

                // 统计消息和 Token
                if event.event_type == "user" || event.event_type == "assistant" {
                    message_count += 1;

                    // 提取第一条用户消息作为标题
                    if first_user_content.is_empty() && event.event_type == "user" {
                        first_user_content = event.extract_text_content();
                    }
                }

                // 聚合 Token 使用
                if let Some(ref message) = event.message {
                    if let Some(ref usage) = message.usage {
                        input_tokens += usage.input_tokens;
                        output_tokens += usage.output_tokens;
                    }
                }
            }
        }

        // 生成标题
        let title = if first_user_content.is_empty() {
            "IFlow 对话".to_string()
        } else {
            let truncated: String = first_user_content.chars().take(50).collect();
            if first_user_content.len() > 50 {
                format!("{}...", truncated)
            } else {
                truncated
            }
        };

        Ok(IFlowSessionMeta {
            session_id,
            title,
            message_count,
            file_size,
            created_at: created_at.unwrap_or_else(|| String::from("")),
            updated_at: updated_at.unwrap_or_else(|| String::from("")),
            input_tokens,
            output_tokens,
        })
    }

    /// 获取会话的完整历史消息
    pub fn get_session_history(config: &Config, session_id: &str) -> Result<Vec<IFlowHistoryMessage>> {
        let jsonl_path = Self::find_session_jsonl(config, session_id)?;

        let file = File::open(&jsonl_path)
            .map_err(|e| AppError::ProcessError(format!("打开会话文件失败: {}", e)))?;

        let reader = BufReader::new(file);
        let mut messages = Vec::new();

        for line in reader.lines() {
            let line = line.map_err(|e| AppError::ProcessError(format!("读取行失败: {}", e)))?;
            let line_trimmed = line.trim();

            if line_trimmed.is_empty() {
                continue;
            }

            if let Some(event) = IFlowJsonlEvent::parse_line(line_trimmed) {
                // 只处理 user 和 assistant 类型
                if event.event_type == "user" || event.event_type == "assistant" {
                    let tool_calls = if event.event_type == "assistant" {
                        Self::extract_tool_calls_from_event(&event)
                    } else {
                        Vec::new()
                    };

                    let input_tokens = event.message.as_ref()
                        .and_then(|m| m.usage.as_ref())
                        .map(|u| u.input_tokens);
                    let output_tokens = event.message.as_ref()
                        .and_then(|m| m.usage.as_ref())
                        .map(|u| u.output_tokens);

                    messages.push(IFlowHistoryMessage {
                        uuid: event.uuid.clone(),
                        parent_uuid: event.parent_uuid.clone(),
                        timestamp: event.timestamp.clone(),
                        r#type: event.event_type.clone(),
                        content: event.extract_text_content(),
                        model: event.message.as_ref().and_then(|m| m.model.clone()),
                        stop_reason: event.message.as_ref().and_then(|m| m.stop_reason.clone()),
                        input_tokens,
                        output_tokens,
                        tool_calls,
                    });
                }
            }
        }

        // 按时间戳排序
        messages.sort_by(|a, b| a.timestamp.cmp(&b.timestamp));

        Ok(messages)
    }

    /// 从事件中提取工具调用
    fn extract_tool_calls_from_event(event: &IFlowJsonlEvent) -> Vec<IFlowToolCall> {
        let mut tool_calls = Vec::new();

        if let Some(ref message) = event.message {
            if let serde_json::Value::Array(arr) = &message.content {
                for item in arr {
                    if let Some(obj) = item.as_object() {
                        if let Some(block_type) = obj.get("type").and_then(|v| v.as_str()) {
                            if block_type == "tool_use" {
                                tool_calls.push(IFlowToolCall {
                                    id: obj.get("id")
                                        .and_then(|v| v.as_str())
                                        .unwrap_or("")
                                        .to_string(),
                                    name: obj.get("name")
                                        .and_then(|v| v.as_str())
                                        .unwrap_or("unknown")
                                        .to_string(),
                                    input: obj.get("input").cloned()
                                        .unwrap_or(serde_json::Value::Null),
                                });
                            }
                        }
                    }
                }
            }
        }

        tool_calls
    }

    /// 获取会话的文件上下文
    pub fn get_file_contexts(config: &Config, session_id: &str) -> Result<Vec<IFlowFileContext>> {
        let jsonl_path = Self::find_session_jsonl(config, session_id)?;

        let file = File::open(&jsonl_path)
            .map_err(|e| AppError::ProcessError(format!("打开会话文件失败: {}", e)))?;

        let reader = BufReader::new(file);
        let mut file_map: HashMap<String, IFlowFileContext> = HashMap::new();

        for line in reader.lines() {
            let line = line.map_err(|e| AppError::ProcessError(format!("读取行失败: {}", e)))?;
            let line_trimmed = line.trim();

            if line_trimmed.is_empty() {
                continue;
            }

            if let Some(event) = IFlowJsonlEvent::parse_line(line_trimmed) {
                // 从 assistant 消息的 tool_use 中提取文件引用
                if event.event_type == "assistant" {
                    if let Some(ref message) = event.message {
                        Self::extract_files_from_message(&event, message, &mut file_map);
                    }
                }
            }
        }

        let mut contexts: Vec<IFlowFileContext> = file_map.into_values().collect();
        // 按最后访问时间排序
        contexts.sort_by(|a, b| b.last_accessed.cmp(&a.last_accessed));

        Ok(contexts)
    }

    /// 从消息中提取文件引用
    fn extract_files_from_message(
        event: &IFlowJsonlEvent,
        message: &crate::models::iflow_events::IFlowMessage,
        file_map: &mut HashMap<String, IFlowFileContext>,
    ) {
        if let serde_json::Value::Array(arr) = &message.content {
            for item in arr {
                if let Some(obj) = item.as_object() {
                    if let Some(block_type) = obj.get("type").and_then(|v| v.as_str()) {
                        if block_type == "tool_use" {
                            if let Some(name) = obj.get("name").and_then(|v| v.as_str()) {
                                let (file_type, path_key): (Option<&str>, Option<&str>) = match name {
                                    "read_file" => (Some("file"), Some("path")),
                                    "list_directory" => (Some("directory"), Some("path")),
                                    "image_read" => (Some("image"), Some("image_input")),
                                    "search_file_content" => (Some("file"), Some("path")),
                                    _ => (None, None),
                                };

                                if let Some(ft) = file_type {
                                    if let Some(pk) = path_key {
                                        if let Some(path_value) = obj.get(pk) {
                                            if let Some(path) = path_value.as_str() {
                                                file_map.entry(path.to_string())
                                                    .and_modify(|ctx| {
                                                        ctx.access_count += 1;
                                                        ctx.last_accessed = event.timestamp.clone();
                                                    })
                                                    .or_insert(IFlowFileContext {
                                                        path: path.to_string(),
                                                        file_type: ft.to_string(),
                                                        access_count: 1,
                                                        first_accessed: event.timestamp.clone(),
                                                        last_accessed: event.timestamp.clone(),
                                                    });
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    /// 获取会话的 Token 统计
    pub fn get_token_stats(config: &Config, session_id: &str) -> Result<IFlowTokenStats> {
        let jsonl_path = Self::find_session_jsonl(config, session_id)?;

        let file = File::open(&jsonl_path)
            .map_err(|e| AppError::ProcessError(format!("打开会话文件失败: {}", e)))?;

        let reader = BufReader::new(file);

        let mut total_input_tokens = 0u32;
        let mut total_output_tokens = 0u32;
        let mut message_count = 0u32;
        let mut user_message_count = 0u32;
        let mut assistant_message_count = 0u32;

        for line in reader.lines() {
            let line = line.map_err(|e| AppError::ProcessError(format!("读取行失败: {}", e)))?;
            let line_trimmed = line.trim();

            if line_trimmed.is_empty() {
                continue;
            }

            if let Some(event) = IFlowJsonlEvent::parse_line(line_trimmed) {
                if event.event_type == "user" {
                    user_message_count += 1;
                    message_count += 1;
                } else if event.event_type == "assistant" {
                    assistant_message_count += 1;
                    message_count += 1;

                    if let Some(ref message) = event.message {
                        if let Some(ref usage) = message.usage {
                            total_input_tokens += usage.input_tokens;
                            total_output_tokens += usage.output_tokens;
                        }
                    }
                }
            }
        }

        Ok(IFlowTokenStats {
            total_input_tokens: total_input_tokens,
            total_output_tokens: total_output_tokens,
            total_tokens: total_input_tokens + total_output_tokens,
            message_count,
            user_message_count,
            assistant_message_count,
        })
    }
}
