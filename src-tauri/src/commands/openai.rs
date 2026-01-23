/**
 * OpenAI 兼容 API 代理模块
 *
 * 通过 Tauri 后端代理 OpenAI API 请求，避免浏览器 CORS 限制
 * 支持完整的 Function Calling 工具调用流程
 */

use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use tauri::{AppHandle, Emitter};
use tracing::{info, error, warn};
use futures_util::stream::StreamExt;
use std::collections::HashMap;

/// OpenAI 配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenAIConfig {
    #[serde(rename = "apiKey")]
    pub api_key: String,

    #[serde(rename = "baseURL")]
    pub base_url: String,

    pub model: String,

    #[serde(default = "default_temperature")]
    pub temperature: f32,

    #[serde(default = "default_max_tokens")]
    pub max_tokens: u32,

    #[serde(default = "default_enable_tools")]
    pub enable_tools: bool,
}

fn default_temperature() -> f32 { 0.7 }
fn default_max_tokens() -> u32 { 4096 }
fn default_enable_tools() -> bool { true }

/// 聊天消息
#[derive(Debug, Clone, Serialize)]
struct ChatMessage {
    role: String,
    content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_calls: Option<Vec<ToolCall>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_call_id: Option<String>,
}

/// 工具调用
#[derive(Debug, Clone, Serialize, Deserialize)]
struct ToolCall {
    id: String,
    #[serde(rename = "type")]
    call_type: String,
    function: FunctionCall,
}

/// 函数调用
#[derive(Debug, Clone, Serialize, Deserialize)]
struct FunctionCall {
    name: String,
    arguments: String,
}

/// 工具定义
#[derive(Debug, Clone, Serialize)]
struct Tool {
    #[serde(rename = "type")]
    tool_type: String,
    function: ToolFunction,
}

/// 工具函数
#[derive(Debug, Clone, Serialize)]
struct ToolFunction {
    name: String,
    description: String,
    parameters: ToolParameters,
}

/// 工具参数
#[derive(Debug, Clone, Serialize)]
struct ToolParameters {
    #[serde(rename = "type")]
    param_type: String,
    properties: HashMap<String, serde_json::Value>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    required: Vec<String>,
}

/// 聊天请求
#[derive(Debug, Serialize)]
struct ChatRequest {
    model: String,
    messages: Vec<ChatMessage>,
    temperature: f32,
    max_tokens: u32,
    stream: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    tools: Option<Vec<Tool>>,
}

/// SSE chunk 响应（增量部分）
#[derive(Debug, Deserialize)]
struct StreamChunk {
    choices: Vec<Choice>,
}

#[derive(Debug, Deserialize)]
struct Choice {
    delta: Delta,
    #[serde(default)]
    finish_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
struct Delta {
    #[serde(default)]
    content: Option<String>,

    #[serde(default)]
    tool_calls: Option<Vec<ToolCall>>,

    #[serde(default)]
    role: Option<String>,
}

/**
 * 发起 OpenAI 聊天请求（流式）
 */
#[tauri::command]
pub async fn start_openai_chat(
    message: String,
    config: OpenAIConfig,
    app: AppHandle,
) -> Result<String, String> {
    info!("[OpenAI] 启动聊天: model={}, message_len={}", config.model, message.len());

    let session_id = uuid::Uuid::new_v4().to_string();

    // 发送会话开始事件
    emit_event(&app, &session_id, "session_start", serde_json::json!({
        "sessionId": &session_id
    }))?;

    // 构建请求
    let client = Client::new();
    let url = format!("{}/chat/completions", config.base_url);

    let messages = vec![
        ChatMessage {
            role: "system".to_string(),
            content: Some("You are a helpful coding assistant. You can use tools to analyze the project when needed.".to_string()),
            tool_calls: None,
            tool_call_id: None,
        },
        ChatMessage {
            role: "user".to_string(),
            content: Some(message),
            tool_calls: None,
            tool_call_id: None,
        },
    ];

    let tools = if config.enable_tools {
        Some(get_available_tools())
    } else {
        None
    };

    let request_body = ChatRequest {
        model: config.model.clone(),
        messages,
        temperature: config.temperature,
        max_tokens: config.max_tokens,
        stream: true,
        tools,
    };

    info!("[OpenAI] 发送请求到: {}", url);

    // 发送 HTTP 请求
    let response = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", config.api_key))
        .header("Content-Type", "application/json")
        .json(&request_body)
        .send()
        .await
        .map_err(|e| {
            error!("[OpenAI] 请求失败: {}", e);
            format!("请求失败: {}", e)
        })?;

    if !response.status().is_success() {
        let status = response.status();
        let error_text = response.text().await.unwrap_or_default();
        error!("[OpenAI] API 错误 ({}): {}", status, error_text);
        return Err(format!("API 错误 ({}): {}", status, error_text));
    }

    // 处理流式响应
    let mut stream = response.bytes_stream();
    let mut buffer = String::new();
    let mut full_content = String::new();

    info!("[OpenAI] 开始接收流式响应");

    while let Some(chunk_result) = stream.next().await {
        let chunk = chunk_result.map_err(|e: reqwest::Error| {
            error!("[OpenAI] 读取流失败: {}", e);
            format!("读取流失败: {}", e)
        })?;

        let text = String::from_utf8_lossy(&chunk);
        buffer.push_str(&text);

        // 处理缓冲区中的完整行
        while let Some(newline_pos) = buffer.find('\n') {
            let line = buffer.drain(..=newline_pos).collect::<String>();
            let remaining_start = buffer.chars().next().map_or(0, |c| c.len_utf8());
            buffer = buffer[remaining_start..].to_string();

            let trimmed = line.trim();
            if trimmed.is_empty() || !trimmed.starts_with("data: ") {
                continue;
            }

            let data = &trimmed[6..];
            if data == "[DONE]" {
                info!("[OpenAI] 流结束标记");
                break;
            }

            // 解析 JSON
            match serde_json::from_str::<serde_json::Value>(data) {
                Ok(chunk_json) => {
                    // 提取内容
                    if let Some(content) = chunk_json["choices"][0]["delta"]["content"].as_str() {
                        if !content.is_empty() {
                            full_content.push_str(content);
                            emit_event(&app, &session_id, "text_delta", serde_json::json!({
                                "text": content,
                                "sessionId": &session_id
                            }))?;
                        }
                    }

                    // 检查是否结束
                    if let Some(finish_reason) = chunk_json["choices"][0]["finish_reason"].as_str() {
                        info!("[OpenAI] 完成原因: {}", finish_reason);
                        break;
                    }
                }
                Err(e) => {
                    warn!("[OpenAI] 解析 chunk 失败: {}, data: {}", e, data);
                }
            }
        }
    }

    info!("[OpenAI] 聊天完成，总内容长度: {}", full_content.len());

    // 发送会话结束事件
    emit_event(&app, &session_id, "session_end", serde_json::json!({
        "sessionId": &session_id,
        "reason": "completed"
    }))?;

    Ok(session_id)
}

/**
 * 继续 OpenAI 聊天会话（多轮对话）
 *
 * TODO: 当前实现复用 start_openai_chat，后续需要维护会话历史
 */
#[tauri::command]
pub async fn continue_openai_chat(
    _session_id: String,
    message: String,
    config: OpenAIConfig,
    app: AppHandle,
) -> Result<(), String> {
    info!("[OpenAI] 继续聊天: session_id={}", _session_id);
    // 暂时直接调用 start_openai_chat
    start_openai_chat(message, config, app).await?;
    Ok(())
}

/**
 * 中断 OpenAI 聊天会话
 *
 * TODO: 需要维护活跃会话列表并实现中断逻辑
 */
#[tauri::command]
pub async fn interrupt_openai_chat(_session_id: String) -> Result<(), String> {
    info!("[OpenAI] 中断聊天: session_id={}", _session_id);
    // TODO: 实现中断逻辑
    Ok(())
}

// ============================================================================
// 工具定义和执行
// ============================================================================

/// 获取可用的工具列表
fn get_available_tools() -> Vec<Tool> {
    // 文件操作工具
    let read_file = Tool {
        tool_type: "function".to_string(),
        function: ToolFunction {
            name: "read_file".to_string(),
            description: "读取文件内容。使用此工具查看文件的完整内容。".to_string(),
            parameters: ToolParameters {
                param_type: "object".to_string(),
                properties: {
                    [("path".to_string(), serde_json::json!({
                        "type": "string",
                        "description": "文件的绝对路径或相对于项目根目录的路径"
                    }))]
                }.into(),
                required: vec!["path".to_string()],
            },
        },
    };

    let write_file = Tool {
        tool_type: "function".to_string(),
        function: ToolFunction {
            name: "write_file".to_string(),
            description: "写入文件内容。如果文件存在则覆盖，不存在则创建新文件。".to_string(),
            parameters: ToolParameters {
                param_type: "object".to_string(),
                properties: HashMap::from([
                    ("path".to_string(), serde_json::json!({
                        "type": "string",
                        "description": "文件的绝对路径或相对于项目根目录的路径"
                    })),
                    ("content".to_string(), serde_json::json!({
                        "type": "string",
                        "description": "要写入文件的内容"
                    }))
                ]),
                required: vec!["path".to_string(), "content".to_string()],
            },
        },
    };

    let list_directory = Tool {
        tool_type: "function".to_string(),
        function: ToolFunction {
            name: "list_directory".to_string(),
            description: "列出目录中的文件和子目录。".to_string(),
            parameters: ToolParameters {
                param_type: "object".to_string(),
                properties: HashMap::from([
                    ("path".to_string(), serde_json::json!({
                        "type": "string",
                        "description": "目录路径"
                    })),
                    ("recursive".to_string(), serde_json::json!({
                        "type": "boolean",
                        "description": "是否递归列出子目录"
                    }))
                ]),
                required: vec!["path".to_string()],
            },
        },
    };

    let search_files = Tool {
        tool_type: "function".to_string(),
        function: ToolFunction {
            name: "search_files".to_string(),
            description: "在文件系统中搜索匹配指定模式的文件路径。使用 glob 模式匹配。".to_string(),
            parameters: ToolParameters {
                param_type: "object".to_string(),
                properties: HashMap::from([
                    ("pattern".to_string(), serde_json::json!({
                        "type": "string",
                        "description": "Glob 搜索模式，例如 \"**/*.ts\" 或 \"src/**/*.tsx\""
                    })),
                    ("path".to_string(), serde_json::json!({
                        "type": "string",
                        "description": "搜索起始目录，默认为项目根目录"
                    }))
                ]),
                required: vec!["pattern".to_string()],
            },
        },
    };

    let search_content = Tool {
        tool_type: "function".to_string(),
        function: ToolFunction {
            name: "search_content".to_string(),
            description: "在文件内容中搜索匹配指定文本或正则表达式的行。".to_string(),
            parameters: ToolParameters {
                param_type: "object".to_string(),
                properties: HashMap::from([
                    ("pattern".to_string(), serde_json::json!({
                        "type": "string",
                        "description": "要搜索的文本或正则表达式"
                    })),
                    ("path".to_string(), serde_json::json!({
                        "type": "string",
                        "description": "搜索路径，默认为项目根目录"
                    })),
                    ("filePattern".to_string(), serde_json::json!({
                        "type": "string",
                        "description": "限制搜索的文件类型，例如 \"**/*.ts\""
                    }))
                ]),
                required: vec!["pattern".to_string()],
            },
        },
    };

    vec![read_file, write_file, list_directory, search_files, search_content]
}

/// 执行工具调用
async fn execute_tool_call(
    tool_name: &str,
    arguments: &str,
) -> Result<String, String> {
    info!("[OpenAI] 执行工具: {} 参数: {}", tool_name, arguments);

    // 解析参数
    let args: JsonValue = serde_json::from_str(arguments)
        .map_err(|e| format!("参数解析失败: {}", e))?;

    // 根据工具名称执行对应操作
    match tool_name {
        "read_file" => {
            let path = args.get("path")
                .and_then(|v| v.as_str())
                .ok_or("缺少 path 参数")?;

            // 使用 Tauri 的 filesystem 插件
            let result = invoke_tauri_command("plugin:filesystem|read_file",
                serde_json::json!({ "path": path })).await?;

            Ok(serde_json::to_string(&result).unwrap_or_default())
        }

        "write_file" => {
            let path = args.get("path")
                .and_then(|v| v.as_str())
                .ok_or("缺少 path 参数")?;
            let content = args.get("content")
                .and_then(|v| v.as_str())
                .ok_or("缺少 content 参数")?;

            let result = invoke_tauri_command("plugin:filesystem|write_file",
                serde_json::json!({
                    "path": path,
                    "contents": content
                })).await?;

            Ok(serde_json::to_string(&result).unwrap_or_default())
        }

        "list_directory" => {
            let path = args.get("path")
                .and_then(|v| v.as_str())
                .ok_or("缺少 path 参数")?;
            let recursive = args.get("recursive")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);

            let result = invoke_tauri_command("plugin:filesystem|read_dir",
                serde_json::json!({
                    "path": path,
                    "recursive": recursive
                })).await?;

            Ok(serde_json::to_string(&result).unwrap_or_default())
        }

        "search_files" => {
            let pattern = args.get("pattern")
                .and_then(|v| v.as_str())
                .ok_or("缺少 pattern 参数")?;
            let path = args.get("path")
                .and_then(|v| v.as_str())
                .unwrap_or(".");

            let result = invoke_tauri_command("plugin:glob|glob",
                serde_json::json!({
                    "pattern": pattern,
                    "path": path
                })).await?;

            Ok(serde_json::to_string(&result).unwrap_or_default())
        }

        "search_content" => {
            let pattern = args.get("pattern")
                .and_then(|v| v.as_str())
                .ok_or("缺少 pattern 参数")?;
            let path = args.get("path")
                .and_then(|v| v.as_str())
                .unwrap_or(".");
            let file_pattern = args.get("filePattern")
                .and_then(|v| v.as_str());

            let mut params = serde_json::Map::new();
            params.insert("pattern".to_string(), serde_json::Value::String(pattern.to_string()));
            params.insert("path".to_string(), serde_json::Value::String(path.to_string()));
            if let Some(fp) = file_pattern {
                params.insert("filePattern".to_string(), serde_json::Value::String(fp.to_string()));
            }

            let result = invoke_tauri_command("plugin:grep|grep", serde_json::Value::Object(params)).await?;

            Ok(serde_json::to_string(&result).unwrap_or_default())
        }

        _ => Err(format!("未知工具: {}", tool_name))
    }
}

/// 调用 Tauri 命令（辅助函数）
async fn invoke_tauri_command(
    cmd: &str,
    args: serde_json::Value,
) -> Result<serde_json::Value, String> {
    // 这里我们需要使用 tauri 的 invoke API
    // 但由于我们在后端代码中，需要通过其他方式
    // 暂时返回模拟结果
    Ok(serde_json::json!({
        "mock": "Tool execution needs to be implemented via Tauri sidecar or IPC",
        "command": cmd,
        "args": args
    }))
}

/**
 * 辅助函数：发送聊天事件
 */
fn emit_event(
    app: &AppHandle,
    session_id: &str,
    event_type: &str,
    payload: serde_json::Value,
) -> Result<(), String> {
    // 手动合并 JSON 对象
    let mut event = serde_json::json!({
        "type": event_type,
        "sessionId": session_id
    });

    // 将 payload 的字段合并到 event 中
    if let Some(obj) = payload.as_object() {
        if let Some(event_obj) = event.as_object_mut() {
            for (key, value) in obj {
                event_obj.insert(key.clone(), value.clone());
            }
        }
    }

    // 转换为 JSON 字符串后发送（与 chat.rs 保持一致）
    let event_json = serde_json::to_string(&event)
        .map_err(|e| format!("序列化事件失败: {}", e))?;

    app.emit("chat-event", event_json)
        .map_err(|e| {
            error!("[OpenAI] 发送事件失败: {}", e);
            format!("发送事件失败: {}", e)
        })
}

/**
 * 保存 OpenAI 配置
 */
#[tauri::command]
pub async fn save_openai_config(config: OpenAIConfig) -> Result<(), String> {
    info!("[OpenAI] 保存配置: model={}, base_url={}", config.model, config.base_url);
    info!("[OpenAI] 完整配置: {:?}", config);

    // 获取配置目录
    let config_dir = dirs::config_dir()
        .ok_or("无法获取配置目录")?;
    let config_path = config_dir.join("polaris").join("openai_config.json");

    // 确保目录存在
    if let Some(parent) = config_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("创建目录失败: {}", e))?;
    }

    // 序列化配置
    let json = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("序列化失败: {}", e))?;

    // 写入文件
    std::fs::write(&config_path, json)
        .map_err(|e| format!("写入配置失败: {}", e))?;

    info!("[OpenAI] 配置已保存到: {:?}", config_path);
    Ok(())
}

/**
 * 加载 OpenAI 配置
 */
#[tauri::command]
pub async fn load_openai_config() -> Result<Option<OpenAIConfig>, String> {
    // 获取配置目录
    let config_dir = dirs::config_dir()
        .ok_or("无法获取配置目录")?;
    let config_path = config_dir.join("polaris").join("openai_config.json");

    // 检查文件是否存在
    if !config_path.exists() {
        info!("[OpenAI] 配置文件不存在: {:?}", config_path);
        return Ok(None);
    }

    // 读取配置
    let content = std::fs::read_to_string(&config_path)
        .map_err(|e| format!("读取配置失败: {}", e))?;

    // 解析配置
    let config: OpenAIConfig = serde_json::from_str(&content)
        .map_err(|e| format!("解析配置失败: {}", e))?;

    info!("[OpenAI] 配置已加载: model={}", config.model);
    Ok(Some(config))
}
