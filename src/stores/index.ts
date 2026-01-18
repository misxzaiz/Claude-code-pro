/**
 * 状态管理统一导出
 */

export { useConfigStore } from './configStore';

// AI Chat Store（基于 AI Runtime 架构）
export { useAIChatStore } from './aiChatStore';

// 事件驱动 Chat Store（基于 Tauri chat-event）
export { useEventChatStore } from './eventChatStore';

export { useCommandStore } from './commandStore';
export { useToolPanelStore, updateToolByName, updateToolByToolUseId } from './toolPanelStore';
export { useWorkspaceStore } from './workspaceStore';
export { useFileExplorerStore } from './fileExplorerStore';
export { useFileEditorStore } from './fileEditorStore';
export { useViewStore } from './viewStore';
export { useFloatingWindowStore } from './floatingWindowStore';
