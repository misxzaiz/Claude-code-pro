/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // 主色调 - 蓝色系
        primary: {
          DEFAULT: '#3B82F6',
          hover: '#2563EB',
          50: '#EFF6FF',
          100: '#DBEAFE',
          200: '#BFDBFE',
          300: '#93C5FD',
          400: '#60A5FA',
          500: '#3B82F6',
          600: '#2563EB',
          700: '#1D4ED8',
          faint: 'rgba(59, 130, 246, 0.15)',
          glow: 'rgba(59, 130, 246, 0.3)',
        },
        // 背景色系 - 优化的分层深色
        background: {
          base: '#0F0F11',           // 全局背景 - 稍微提亮
          elevated: '#1A1A1F',        // 侧边栏/面板 - 增加层次
          surface: '#25252B',         // 卡片/输入框 - 更明显的区分
          hover: '#2D2D35',           // 悬停 - 增强交互反馈
          active: '#35353D',          // 激活 - 更强的反馈
          tertiary: '#21262D',         // 兼容旧名
          secondary: '#161B22',       // 兼容旧名
        },
        // 边框色系 - 增强对比度
        border: {
          DEFAULT: 'rgba(255, 255, 255, 0.15)',
          subtle: 'rgba(255, 255, 255, 0.08)',
          default: 'rgba(255, 255, 255, 0.15)',
          strong: 'rgba(255, 255, 255, 0.25)',
          muted: 'rgba(255, 255, 255, 0.12)',
          focus: 'rgba(59, 130, 246, 0.5)',
        },
        // 文本色系 - 优化可读性
        text: {
          DEFAULT: '#F8F8F8',
          primary: '#F8F8F8',          // 主要文本 - 稍微柔和
          secondary: '#B4B4B8',        // 次要文本 - 增加对比度
          tertiary: '#8E8E93',         // 辅助文本 - 提高可读性
          muted: '#6D6D70',            // 弱化文本 - 保持可见性
        },
        // 语义化颜色 - 增加温度感
        success: {
          DEFAULT: '#34D399',
          faint: 'rgba(52, 211, 153, 0.15)',
        },
        warning: {
          DEFAULT: '#FBBF24',
          faint: 'rgba(251, 191, 36, 0.15)',
        },
        danger: {
          DEFAULT: '#F87171',
          faint: 'rgba(248, 113, 113, 0.15)',
        },
        info: {
          DEFAULT: '#60A5FA',
          faint: 'rgba(96, 165, 250, 0.15)',
        },
      },
      // 阴影 - 更自然的阴影系统
      boxShadow: {
        'soft': '0 4px 12px rgba(0, 0, 0, 0.15)',
        'medium': '0 8px 24px rgba(0, 0, 0, 0.2)',
        'glow': '0 0 24px rgba(59, 130, 246, 0.15)',
        'glow-lg': '0 0 48px rgba(59, 130, 246, 0.1)',
        'inner-soft': 'inset 0 2px 4px rgba(0, 0, 0, 0.1)',
      },
      // 间距
      spacing: {
        '18': '4.5rem',   // 72px
        '19': '4.75rem',  // 76px
      },
      // 圆角
      borderRadius: {
        '4xl': '2rem',
      },
    },
  },
  plugins: [],
}
