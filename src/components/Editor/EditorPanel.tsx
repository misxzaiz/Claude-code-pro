/**
 * 编辑器面板组件
 */

import { useFileEditorStore } from '../../stores';
import { CodeMirrorEditor } from './Editor';
import { EditorHeader } from './EditorHeader';

interface EditorPanelProps {
  className?: string;
}

export function EditorPanel({ className = '' }: EditorPanelProps) {
  const { currentFile, setContent, saveFile, isOpen, status, error } = useFileEditorStore();

  // 显示错误状态
  if (error) {
    return (
      <div className={`h-full flex flex-col ${className}`}>
        <div className="flex-1 flex items-center justify-center text-danger text-sm px-4">
          <div className="text-center">
            <div className="text-lg mb-2">⚠️</div>
            <div>{error}</div>
          </div>
        </div>
      </div>
    );
  }

  if (!isOpen || !currentFile) {
    return (
      <div className={`h-full flex flex-col ${className}`}>
        <div className="flex-1 flex items-center justify-center text-text-tertiary text-sm">
          {status === 'loading' ? '加载中...' : '未打开文件'}
        </div>
      </div>
    );
  }

  return (
    <div className={`h-full flex flex-col bg-background-base ${className}`}>
      <EditorHeader />
      <div className="flex-1 overflow-hidden">
        <CodeMirrorEditor
          value={currentFile.content}
          language={currentFile.language}
          onChange={setContent}
          onSave={saveFile}
        />
      </div>
    </div>
  );
}
