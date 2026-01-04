/**
 * 聊天相关 Hook
 */

import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import type { StreamEvent } from '../types';

/** 监听聊天流式事件 */
export function useChatEvent(
  onEvent: (event: StreamEvent) => void,
  onError?: (error: string) => void
) {
  useEffect(() => {
    const unlistenPromise = listen<string>('chat-event', (event) => {
      try {
        const data = JSON.parse(event.payload) as StreamEvent;
        onEvent(data);
      } catch (e) {
        console.error('Failed to parse chat event:', e);
        onError?.(e instanceof Error ? e.message : '解析事件失败');
      }
    });

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, [onEvent, onError]);
}
