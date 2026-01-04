import type { FileInfo } from '../../types';

interface FileIconProps {
  file: FileInfo;
  className?: string;
}

const FILE_ICONS = {
  // 编程语言
  ts: '📘',
  tsx: '⚛️',
  js: '📜',
  jsx: '⚛️',
  rs: '🦀',
  py: '🐍',
  java: '☕',
  cpp: '⚙️',
  c: '⚙️',
  go: '🐹',
  php: '🐘',
  rb: '💎',
  swift: '🍎',
  kt: '🎯',

  // Web 文件
  html: '🌐',
  htm: '🌐',

  // 配置文件
  json: '📋',
  yaml: '📋',
  yml: '📋',
  toml: '⚙️',
  xml: '📄',
  ini: '⚙️',
  conf: '⚙️',
  env: '🔐',

  // 文档文件
  md: '📝',
  txt: '📄',
  doc: '📘',
  docx: '📘',
  pdf: '📕',

  // 样式文件
  css: '🎨',
  scss: '🎨',
  sass: '🎨',
  less: '🎨',

  // 图片文件
  png: '🖼️',
  jpg: '🖼️',
  jpeg: '🖼️',
  gif: '🖼️',
  svg: '🎨',
  ico: '🖼️',

  // 构建文件
  lock: '🔒',
  log: '📜',
  gitignore: '🚫',
  dockerfile: '🐳',

  // 默认图标
  default: '📄',
  folder: '📁',
  folderOpen: '📂',
};

export function FileIcon({ file, className = '' }: FileIconProps) {
  const getIcon = () => {
    if (file.is_dir) {
      return FILE_ICONS.folder;
    }
    
    const extension = file.extension?.toLowerCase();
    if (!extension) {
      return FILE_ICONS.default;
    }
    
    // 特殊文件名处理
    const name = file.name.toLowerCase();
    if (name === 'dockerfile') return FILE_ICONS.dockerfile;
    if (name === 'gitignore') return FILE_ICONS.gitignore;
    if (name.endsWith('.lock')) return FILE_ICONS.lock;
    if (name.endsWith('.log')) return FILE_ICONS.log;
    
    return FILE_ICONS[extension as keyof typeof FILE_ICONS] || FILE_ICONS.default;
  };

  return (
    <span className={`inline-flex items-center justify-center ${className}`}>
      {getIcon()}
    </span>
  );
}