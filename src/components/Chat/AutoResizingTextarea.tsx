/**
 * 自适应高度文本框组件
 */
import { forwardRef, useEffect, useRef } from 'react';

interface AutoResizingTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  maxHeight?: number;
  minHeight?: number;
}

export const AutoResizingTextarea = forwardRef<HTMLTextAreaElement, AutoResizingTextareaProps>(
  ({ value, maxHeight = 200, minHeight = 40, className = '', ...props }, ref) => {
    const innerRef = useRef<HTMLTextAreaElement>(null);
    const textareaRef = (ref as React.RefObject<HTMLTextAreaElement>) || innerRef;

    useEffect(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      textarea.style.height = 'auto';
      const newHeight = Math.min(Math.max(textarea.scrollHeight, minHeight), maxHeight);
      textarea.style.height = `${newHeight}px`;
    }, [value, maxHeight, minHeight, textareaRef]);

    return (
      <textarea
        ref={textareaRef}
        value={value}
        className={className}
        style={{ minHeight: `${minHeight}px`, maxHeight: `${maxHeight}px` }}
        {...props}
      />
    );
  }
);

AutoResizingTextarea.displayName = 'AutoResizingTextarea';
