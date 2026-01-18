/**
 * CodeMirror 6 编辑器组件
 */

import { useEffect, useRef, useMemo } from 'react';
import { EditorState } from '@codemirror/state';
import {
  EditorView,
  keymap,
  highlightSpecialChars,
  drawSelection,
  dropCursor,
  rectangularSelection,
  crosshairCursor,
  highlightActiveLine,
  lineNumbers,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { bracketMatching, indentOnInput } from '@codemirror/language';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { lintGutter } from '@codemirror/lint';

// 现代化主题
import { modernTheme } from './modernTheme';

// 获取语言扩展
async function getLanguageExtension(lang: string) {
  const langMap: Record<string, any> = {
    javascript: () => import('@codemirror/lang-javascript').then(m => m.javascript({ jsx: true })),
    typescript: () => import('@codemirror/lang-javascript').then(m => m.javascript({ jsx: true, typescript: true })),
    json: () => import('@codemirror/lang-json').then(m => m.json()),
    html: () => import('@codemirror/lang-html').then(m => m.html()),
    css: () => import('@codemirror/lang-css').then(m => m.css()),
    python: () => import('@codemirror/lang-python').then(m => m.python()),
    markdown: () => import('@codemirror/lang-markdown').then(m => m.markdown()),
  };

  return langMap[lang]?.() || Promise.resolve(null);
}

interface EditorProps {
  /** 编辑器内容 */
  value: string;
  /** 语言类型 */
  language: string;
  /** 内容变化回调 */
  onChange: (value: string) => void;
  /** 只读模式 */
  readOnly?: boolean;
  /** 保存回调 */
  onSave?: () => void;
  /** 是否显示行号 */
  lineNumbers?: boolean;
}

export function CodeMirrorEditor({
  value,
  language,
  onChange,
  readOnly = false,
  onSave,
  lineNumbers: showLineNumbers = true,
}: EditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  // 自定义保存快捷键
  const saveKeymap = useMemo(
    () => keymap.of(onSave ? [{ key: 'Mod-s', run: () => { onSave(); return true; } }] : []),
    [onSave]
  );

  useEffect(() => {
    if (!containerRef.current) return;

    // 创建编辑器状态
    const state = EditorState.create({
      doc: value,
      extensions: [
        modernTheme,
        highlightSpecialChars(),
        drawSelection(),
        dropCursor(),
        rectangularSelection(),
        crosshairCursor(),
        highlightActiveLine(),
        // EditorView.lineWrapping,
        showLineNumbers ? lineNumbers() : [],
        highlightSelectionMatches(),
        history(),
        bracketMatching(),
        closeBrackets(),
        indentOnInput(),
        EditorView.editable.of(!readOnly),
        saveKeymap,
        keymap.of(defaultKeymap),
        keymap.of(historyKeymap),
        keymap.of(closeBracketsKeymap),
        keymap.of(searchKeymap),
        lintGutter(),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const newValue = update.state.doc.toString();
            onChange(newValue);
          }
        }),
      ],
    });

    // 创建编辑器视图
    const view = new EditorView({
      state,
      parent: containerRef.current,
    });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // 仅在挂载时初始化
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 更新语言 (需要重新创建编辑器以应用语言扩展)
  useEffect(() => {
    const updateLanguage = async () => {
      if (!viewRef.current) return;

      const langExtension = await getLanguageExtension(language);
      if (langExtension) {
        // 创建新的编辑器状态并替换
        const newState = EditorState.create({
          doc: value,
          extensions: [
            modernTheme,
            highlightSpecialChars(),
            drawSelection(),
            dropCursor(),
            rectangularSelection(),
            crosshairCursor(),
            highlightActiveLine(),
            // EditorView.lineWrapping,
            showLineNumbers ? lineNumbers() : [],
            highlightSelectionMatches(),
            history(),
            langExtension,
            bracketMatching(),
            closeBrackets(),
            indentOnInput(),
            EditorView.editable.of(!readOnly),
            saveKeymap,
            keymap.of(defaultKeymap),
            keymap.of(historyKeymap),
            keymap.of(closeBracketsKeymap),
            keymap.of(searchKeymap),
            lintGutter(),
            EditorView.updateListener.of((update) => {
              if (update.docChanged) {
                const newValue = update.state.doc.toString();
                onChange(newValue);
              }
            }),
          ],
        });

        // 重新创建编辑器视图
        const parent = viewRef.current.dom.parentElement;
        if (parent) {
          viewRef.current.destroy();
          const newView = new EditorView({
            state: newState,
            parent,
          });
          viewRef.current = newView;
        }
      }
    };

    updateLanguage();
  }, [language]);

  // 更新内容（从外部更新时）
  useEffect(() => {
    if (!viewRef.current) return;

    const currentValue = viewRef.current.state.doc.toString();
    if (currentValue !== value) {
      const transaction = viewRef.current.state.update({
        changes: {
          from: 0,
          to: currentValue.length,
          insert: value,
        },
      });
      viewRef.current.dispatch(transaction);
    }
  }, [value]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full overflow-hidden"
    />
  );
}
