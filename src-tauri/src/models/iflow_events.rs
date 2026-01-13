/// IFlow JSONL 事件模型
///
/// IFlow CLI 将会话保存为 JSONL 格式文件
/// 文件位置: ~/.iflow/projects/[编码项目路径]/session-[id].jsonl

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// IFlow JSONL 事件（顶层结构）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IFlowJsonlEvent {
    /// 消息唯一 ID
    pub uuid: String,
    /// 父消息 ID
    #[serde(rename = "parentUuid")]
    pub parent_uuid: Option<String>,
    /// 会话 ID
    #[serde(rename = "sessionId")]
    pub session_id: String,
    /// 时间戳
    pub timestamp: String,
    /// 事件类型: user, assistant, tool_result, error 等
    #[serde(rename = "type")]
    pub event_type: String,
    /// 是否为侧链
    #[serde(rename = "isSidechain")]
    pub is_sidechain: bool,
    /// 用户类型
    #[serde(rename = "userType")]
    pub user_type: String,
    /// 消息内容
    pub message: Option<IFlowMessage>,
    /// 当前工作目录
    pub cwd: Option<String>,
    /// Git 分支
    #[serde(rename = "gitBranch")]
    pub git_branch: Option<String>,
    /// 版本
    pub version: Option<String>,
    /// 工具调用结果
    #[serde(rename = "toolUseResult")]
    pub tool_use_result: Option<IFlowToolUseResult>,
}

/// IFlow 消息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IFlowMessage {
    /// 消息 ID（仅 assistant 类型）
    pub id: Option<String>,
    /// 消息类型
    #[serde(rename = "type")]
    pub message_type: Option<String>,
    /// 角色: user, assistant
    pub role: String,
    /// 内容数组
    pub content: Vec<IFlowContentBlock>,
    /// 模型名称
    pub model: Option<String>,
    /// 停止原因
    #[serde(rename = "stop_reason")]
    pub stop_reason: Option<String>,
    /// Token 使用情况
    pub usage: Option<IFlowUsage>,
}

/// IFlow 内容块
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum IFlowContentBlock {
    /// 文本内容
    #[serde(rename = "text")]
    Text { text: String },
    /// 工具调用
    #[serde(rename = "tool_use")]
    ToolUse {
        /// 工具调用 ID
        id: String,
        /// 工具名称
        name: String,
        /// 工具输入参数
        input: serde_json::Value,
    },
    /// 工具结果
    #[serde(rename = "tool_result")]
    ToolResult {
        /// 工具调用 ID
        #[serde(rename = "tool_use_id")]
        tool_use_id: String,
        /// 结果内容
        content: IFlowToolResultContent,
    },
}

/// IFlow 工具结果内容
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IFlowToolResultContent {
    /// 工具调用 ID
    #[serde(rename = "callId")]
    pub call_id: String,
    /// 响应部件
    #[serde(rename = "responseParts")]
    pub response_parts: Option<IFlowResponseParts>,
    /// 结果显示
    #[serde(rename = "resultDisplay")]
    pub result_display: Option<String>,
}

/// IFlow 响应部件
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IFlowResponseParts {
    /// 函数响应
    #[serde(rename = "functionResponse")]
    pub function_response: Option<IFlowFunctionResponse>,
}

/// IFlow 函数响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IFlowFunctionResponse {
    /// 调用 ID
    pub id: String,
    /// 工具名称
    pub name: String,
    /// 响应
    pub response: serde_json::Value,
}

/// IFlow Token 使用情况
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IFlowUsage {
    /// 输入 Token 数
    #[serde(rename = "input_tokens")]
    pub input_tokens: u32,
    /// 输出 Token 数
    #[serde(rename = "output_tokens")]
    pub output_tokens: u32,
}

/// IFlow 工具调用结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IFlowToolUseResult {
    /// 工具名称
    #[serde(rename = "toolName")]
    pub tool_name: String,
    /// 状态
    pub status: String,
    /// 时间戳
    pub timestamp: u64,
}

impl IFlowJsonlEvent {
    /// 解析 JSONL 行
    pub fn parse_line(line: &str) -> Option<Self> {
        let line = line.trim();
        if line.is_empty() {
            return None;
        }
        serde_json::from_str(line).ok()
    }

    /// 转换为统一的 StreamEvent（复用 Claude Code 的事件类型）
    pub fn to_stream_event(&self) -> Option<crate::models::events::StreamEvent> {
        match self.event_type.as_str() {
            "user" => {
                // 用户消息 - 通常不需要发送到前端
                None
            }
            "assistant" => {
                self.to_assistant_event()
            }
            "tool_result" | "tool" => {
                self.to_tool_event()
            }
            _ => {
                eprintln!("[IFlow] 未知事件类型: {}", self.event_type);
                None
            }
        }
    }

    /// 转换为 assistant 事件
    fn to_assistant_event(&self) -> Option<crate::models::events::StreamEvent> {
        let message = self.message.as_ref()?;

        // 构建消息内容
        let mut content_blocks = Vec::new();
        let mut tool_calls = Vec::new();

        for block in &message.content {
            match block {
                IFlowContentBlock::Text { text } => {
                    content_blocks.push(serde_json::json!({
                        "type": "text",
                        "text": text
                    }));
                }
                IFlowContentBlock::ToolUse { id, name, input } => {
                    tool_calls.push(serde_json::json!({
                        "type": "tool_use",
                        "id": id,
                        "name": name,
                        "input": input
                    }));
                }
                IFlowContentBlock::ToolResult { .. } => {
                    // 工具结果在 user 消息中处理
                }
            }
        }

        // 合并内容
        for tool_call in &tool_calls {
            content_blocks.push(tool_call.clone());
        }

        Some(crate::models::events::StreamEvent::Assistant {
            message: serde_json::json!({
                "content": content_blocks,
                "model": message.model,
                "id": message.id,
                "stop_reason": message.stop_reason,
            }),
        })
    }

    /// 转换为工具事件
    fn to_tool_event(&self) -> Option<crate::models::events::StreamEvent> {
        if let Some(ref tool_result) = self.tool_use_result {
            // 工具结束事件
            return Some(crate::models::events::StreamEvent::ToolEnd {
                tool_name: tool_result.tool_name.clone(),
                output: Some(format!("Status: {}", tool_result.status)),
            });
        }

        // 从消息中提取工具调用
        let message = self.message.as_ref()?;
        for block in &message.content {
            if let IFlowContentBlock::ToolUse { name, input, .. } = block {
                return Some(crate::models::events::StreamEvent::ToolStart {
                    tool_name: name.clone(),
                    input: serde_json::to_value(input).unwrap_or(serde_json::Value::Null),
                });
            }
        }

        None
    }

    /// 是否为会话结束事件
    pub fn is_session_end(&self) -> bool {
        // IFlow 没有明确的 session_end 事件
        // 我们通过检查是否有 stop_reason 来判断
        if let Some(ref message) = self.message {
            if let Some(ref stop_reason) = message.stop_reason {
                return stop_reason == "STOP" || stop_reason == "max_tokens";
            }
        }
        false
    }
}
