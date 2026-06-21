import React, { createContext, useContext, useState, useEffect } from 'react';

const LIGHT = {
  bg:           '#eef0f6',
  cardBg:       '#ffffff',
  elevated:     '#f1f5f9',
  hover:        '#f8fafc',
  border:       'rgba(0,0,0,0.07)',
  borderStrong: 'rgba(0,0,0,0.13)',
  textPrimary:  '#0f172a',
  textSec:      '#374151',
  textMuted:    '#6b7280',
  // UI accent (sidebar, buttons, active nav)
  accent:       '#6366f1',
  accentSub:    '#06b6d4',
  accentMuted:  'rgba(99,102,241,0.1)',
  // Semantic page colors (used in AI pages)
  success:      '#059669',
  successBg:    'rgba(5,150,105,0.09)',
  danger:       '#dc2626',
  dangerBg:     'rgba(220,38,38,0.09)',
  warning:      '#d97706',
  warningBg:    'rgba(217,119,6,0.09)',
  info:         '#2563eb',
  infoBg:       'rgba(37,99,235,0.09)',
  muted:        '#6b7280',
  mutedBg:      'rgba(107,114,128,0.09)',
  shadow:       '0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.07)',
  shadowHover:  '0 4px 20px rgba(0,0,0,0.12)',
};

const DARK = {
  bg:           '#09090b',
  cardBg:       '#111827',
  elevated:     '#1a2234',
  hover:        '#1e2d47',
  border:       'rgba(255,255,255,0.06)',
  borderStrong: 'rgba(255,255,255,0.12)',
  textPrimary:  '#f1f5f9',
  textSec:      '#cbd5e1',
  textMuted:    '#64748b',
  // UI accent (sidebar, buttons, active nav)
  accent:       '#818cf8',
  accentSub:    '#22d3ee',
  accentMuted:  'rgba(129,140,248,0.12)',
  // Semantic page colors (used in AI pages)
  success:      '#34d399',
  successBg:    'rgba(52,211,153,0.1)',
  danger:       '#f87171',
  dangerBg:     'rgba(248,113,113,0.1)',
  warning:      '#fbbf24',
  warningBg:    'rgba(251,191,36,0.1)',
  info:         '#60a5fa',
  infoBg:       'rgba(96,165,250,0.1)',
  muted:        '#6b7280',
  mutedBg:      'rgba(107,114,128,0.1)',
  shadow:       '0 1px 3px rgba(0,0,0,0.4), 0 4px 16px rgba(0,0,0,0.35)',
  shadowHover:  '0 4px 24px rgba(0,0,0,0.5)',
};

export const ThemeContext = createContext({ theme: 'dark', T: DARK, toggle: () => {} });

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => localStorage.getItem('ui-theme') || 'dark');

  useEffect(() => {
    localStorage.setItem('ui-theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggle = () => setTheme(t => t === 'dark' ? 'light' : 'dark');

  return (
    <ThemeContext.Provider value={{ theme, T: theme === 'dark' ? DARK : LIGHT, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
