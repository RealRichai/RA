'use client';

import * as React from 'react';
import {
  type ThemeMode,
  getStoredTheme,
  setStoredTheme,
  resolveTheme,
  getThemeCSSVars,
} from '@/lib/theme';

interface ThemeContextValue {
  mode: ThemeMode;
  resolvedTheme: 'ivory-light' | 'noir-dark';
  setTheme: (mode: ThemeMode) => void;
}

const ThemeContext = React.createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = React.useState<ThemeMode>('system');
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
    setMode(getStoredTheme());
  }, []);

  React.useEffect(() => {
    if (!mounted) return;

    const resolved = resolveTheme(mode);
    const cssVars = getThemeCSSVars(resolved);

    // Apply CSS variables to document
    Object.entries(cssVars).forEach(([key, value]) => {
      document.documentElement.style.setProperty(key, value);
    });

    // Toggle dark class for Tailwind
    document.documentElement.classList.toggle('dark', resolved === 'noir-dark');
    document.documentElement.setAttribute('data-theme', resolved);
  }, [mode, mounted]);

  React.useEffect(() => {
    if (!mounted || mode !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      const resolved = resolveTheme('system');
      const cssVars = getThemeCSSVars(resolved);
      Object.entries(cssVars).forEach(([key, value]) => {
        document.documentElement.style.setProperty(key, value);
      });
      document.documentElement.classList.toggle('dark', resolved === 'noir-dark');
      document.documentElement.setAttribute('data-theme', resolved);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [mode, mounted]);

  const setTheme = React.useCallback((newMode: ThemeMode) => {
    setStoredTheme(newMode);
    setMode(newMode);
  }, []);

  const resolvedTheme = React.useMemo(() => resolveTheme(mode), [mode]);

  // Prevent flash of wrong theme
  if (!mounted) {
    return (
      <div style={{ visibility: 'hidden' }}>
        {children}
      </div>
    );
  }

  return (
    <ThemeContext.Provider value={{ mode, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = React.useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
