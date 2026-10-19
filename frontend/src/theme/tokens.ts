/**
 * Enterprise Design System Tokens
 * Source: docs/ux/ui-ux-system.md
 */

export const tokens = {
  colors: {
    light: {
      canvas: '#f8fafc', // slate-50
      surface: '#ffffff',
      subtle: '#f1f5f9', // slate-100
      elevated: '#ffffff',
      border: '#e2e8f0', // slate-200
      borderHover: '#cbd5e1', // slate-300
      textPrimary: '#0f172a', // slate-900
      textSecondary: '#475569', // slate-600
      textMuted: '#94a3b8', // slate-400
    },
    dark: {
      canvas: '#090d16',
      surface: '#0f172a', // slate-900
      subtle: '#1e293b', // slate-800
      elevated: '#1e293b',
      border: '#334155', // slate-700
      borderHover: '#475569', // slate-600
      textPrimary: '#f8fafc', // slate-50
      textSecondary: '#94a3b8', // slate-400
      textMuted: '#64748b', // slate-500
    },
    brand: {
      primary: '#4f46e5', // indigo-600
      hover: '#4338ca', // indigo-700
      active: '#3730a3', // indigo-800
      subtleLight: '#eef2ff', // indigo-50
      subtleDark: '#1e1b4b', // indigo-950
      contrast: '#ffffff',
    },
    status: {
      success: '#10b981', // emerald-500
      successSubtle: '#ecfdf5',
      warning: '#f59e0b', // amber-500
      warningSubtle: '#fffbeb',
      danger: '#ef4444', // rose-500
      dangerSubtle: '#fef2f2',
      info: '#0284c7', // sky-600
      infoSubtle: '#f0f9ff',
    },
  },
  typography: {
    fontFamily: [
      'Inter',
      '-apple-system',
      'BlinkMacSystemFont',
      '"Segoe UI"',
      'Roboto',
      'sans-serif',
    ].join(','),
    fontFamilyMono: [
      '"SFMono-Regular"',
      'Consolas',
      '"Liberation Mono"',
      'Menlo',
      'monospace',
    ].join(','),
  },
  shape: {
    borderRadius: 8,
    borderRadiusSm: 6,
    borderRadiusLg: 12,
  },
  shadows: {
    light: {
      card: '0 1px 3px 0 rgba(15, 23, 42, 0.05), 0 1px 2px -1px rgba(15, 23, 42, 0.05)',
      elevated: '0 4px 6px -1px rgba(15, 23, 42, 0.07), 0 2px 4px -2px rgba(15, 23, 42, 0.05)',
      modal: '0 20px 25px -5px rgba(15, 23, 42, 0.1), 0 8px 10px -6px rgba(15, 23, 42, 0.1)',
    },
    dark: {
      card: '0 1px 3px 0 rgba(0, 0, 0, 0.3)',
      elevated: '0 4px 6px -1px rgba(0, 0, 0, 0.4)',
      modal: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
    },
  },
} as const;
