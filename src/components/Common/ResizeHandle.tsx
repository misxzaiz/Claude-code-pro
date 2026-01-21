import { useState, useCallback } from 'react';

interface ResizeHandleProps {
  /** 拖拽方向 */
  direction: 'horizontal' | 'vertical';
  /** 拖拽位置 */
  position: 'left' | 'right' | 'top' | 'bottom';
  /** 拖拽回调 */
  onDrag: (delta: number) => void;
  /** 拖拽结束回调 */
  onDragEnd?: () => void;
  /** 是否禁用 */
  disabled?: boolean;
}

/**
 * 面板拖拽手柄组件
 * 支持鼠标和触摸操作
 */
export function ResizeHandle({ direction, position, onDrag, onDragEnd, disabled = false }: ResizeHandleProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startY = e.clientY;

    setIsDragging(true);

    // 添加全局样式，防止选中文字
    document.body.style.userSelect = 'none';
    document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize';

    const handleMouseMove = (e: MouseEvent) => {
      if (direction === 'horizontal') {
        const delta = e.clientX - startX;
        onDrag(delta);
      } else {
        const delta = e.clientY - startY;
        onDrag(delta);
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      onDragEnd?.();
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [disabled, direction, position, onDrag, onDragEnd]);

  // 触摸支持
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (disabled) return;
    const touch = e.touches[0];
    const startX = touch.clientX;
    const startY = touch.clientY;

    setIsDragging(true);

    document.body.style.userSelect = 'none';
    document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize';

    const handleTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (direction === 'horizontal') {
        const delta = touch.clientX - startX;
        onDrag(delta);
      } else {
        const delta = touch.clientY - startY;
        onDrag(delta);
      }
    };

    const handleTouchEnd = () => {
      setIsDragging(false);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
      onDragEnd?.();
    };

    document.addEventListener('touchmove', handleTouchMove);
    document.addEventListener('touchend', handleTouchEnd);
  }, [disabled, direction, position, onDrag, onDragEnd]);

  const baseClasses = direction === 'horizontal'
    ? 'w-1 hover:w-1.5 cursor-col-resize'
    : 'h-1 hover:h-1.5 cursor-row-resize';

  const colorClasses = disabled
    ? 'bg-border-transparent'
    : isDragging
    ? 'bg-primary'
    : 'bg-border hover:bg-primary/60';

  return (
    <div
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
      className={`${baseClasses} ${colorClasses} transition-all duration-150 flex-shrink-0`}
      style={{ touchAction: 'none' }}
    />
  );
}
