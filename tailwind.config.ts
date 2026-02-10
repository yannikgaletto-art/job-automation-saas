import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Notion-Linear Hybrid Color System
        bg: {
          primary: '#FFFFFF',
          secondary: '#F7F7F5',
          tertiary: '#FAFAF9',
          hover: '#F5F5F4',
        },
        border: {
          light: '#E7E7E5',
          medium: '#D6D6D3',
          focus: '#0066FF',
        },
        text: {
          primary: '#37352F',
          secondary: '#73726E',
          tertiary: '#A8A29E',
        },
        primary: {
          DEFAULT: '#0066FF',
          dark: '#0052CC',
          light: '#3385FF',
        },
        success: '#00C853',
        warning: '#FFA000',
        danger: '#D32F2F',
        info: '#2196F3',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      borderRadius: {
        sm: '0.25rem',  // 4px
        md: '0.5rem',   // 8px - Notion-style default
        lg: '0.75rem',  // 12px
        xl: '1rem',     // 16px
      },
      boxShadow: {
        xs: '0 1px 2px rgba(0, 0, 0, 0.05)',
        sm: '0 2px 4px rgba(0, 0, 0, 0.06)',
        md: '0 4px 6px -1px rgba(0, 0, 0, 0.07), 0 2px 4px -1px rgba(0, 0, 0, 0.04)',
        lg: '0 10px 15px -3px rgba(0, 0, 0, 0.08), 0 4px 6px -2px rgba(0, 0, 0, 0.03)',
        xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
      },
    },
  },
  plugins: [],
};

export default config;
