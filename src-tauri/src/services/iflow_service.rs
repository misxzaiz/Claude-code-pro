/// IFlow CLI 服务
///
/// 管理 IFlow CLI 进程和会话文件监控

use crate::error::{AppError, Result};
use crate::models::config::Config;
use crate::models::events::StreamEvent;
use crate::models::iflow_events::IFlowJsonlEvent;
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
        if projects_dir.exists() {
            eprintln!("[get_project_session_dir] projects 目录存在，列出内容:");
            if let Ok(entries) = std::fs::read_dir(&projects_dir) {
                for entry in entries.flatten() {
                    if let Some(name) = entry.file_name().to_str() {
                        eprintln!("[get_project_session_dir]   - {}", name);
                    }
                }
            }
        } else {
            eprintln!("[get_project_session_dir] projects 目录不存在: {:?}", projects_dir);
        }

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

    /// 监控会话文件并发送事件
    pub fn monitor_jsonl_file<F>(
        jsonl_path: PathBuf,
        session_id: String,
        mut callback: F,
    ) -> std::thread::JoinHandle<()>
    where
        F: FnMut(StreamEvent) + Send + 'static,
    {
        std::thread::spawn(move || {
            eprintln!("[IFlowService] 开始监控文件: {:?}", jsonl_path);

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

            // 打开文件并追踪读取
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
            let mut line_count = 0;

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

                line_count += 1;

                // 解析 JSONL 事件
                if let Some(iflow_event) = IFlowJsonlEvent::parse_line(line_trimmed) {
                    eprintln!("[IFlowService] 行 {}: type={}", line_count, iflow_event.event_type);

                    // 转换并发送事件
                    if let Some(stream_event) = iflow_event.to_stream_event() {
                        callback(stream_event);
                    }

                    // 检查是否为会话结束
                    if iflow_event.is_session_end() {
                        eprintln!("[IFlowService] 检测到会话结束");
                        callback(StreamEvent::SessionEnd);
                        break;
                    }
                } else {
                    eprintln!("[IFlowService] 解析失败: {}", line_trimmed.chars().take(100).collect::<String>());
                }
            }

            eprintln!("[IFlowService] 文件监控结束，共处理 {} 行", line_count);
        })
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
                eprintln!("[find_session_jsonl] 检查文件: {}", filename);
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
                                eprintln!("[find_session_jsonl] 行{}: {}", line_num, line_text.chars().take(100).collect::<String>());
                                if let Some(event) = IFlowJsonlEvent::parse_line(&line_text) {
                                    eprintln!("[find_session_jsonl] 解析成功，event.session_id: {}", event.session_id);
                                    if event.session_id == session_id {
                                        eprintln!("[find_session_jsonl] 找到匹配文件!");
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
}
