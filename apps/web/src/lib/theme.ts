/**
 * RA Theme System
 * Ivory Light + Noir Dark themes with semantic tokens
 */

export type ThemeMode = 'ivory-light' | 'noir-dark' | 'system';

// RA Brand Color Tokens
export const brandTokens = {
  ivory: '#F6F1E8',
  stone: '#D8D1C6',
  noir: '#0B0B0C',
  graphite: '#2A2B2E',
  deepTeal: '#0F3B3A',
  champagne: '#C6A76A',
} as const;

// Theme configuration
export const themes = {
  'ivory-light': {
    background: brandTokens.ivory,
    foreground: brandTokens.noir,
    card: '#FFFFFF',
    cardForeground: brandTokens.noir,
    primary: brandTokens.noir,
    primaryForeground: brandTokens.ivory,
    secondary: brandTokens.stone,
    secondaryForeground: brandTokens.noir,
    muted: brandTokens.stone,
    mutedForeground: brandTokens.graphite,
    accent: brandTokens.deepTeal,
    accentForeground: brandTokens.ivory,
    destructive: '#DC2626',
    destructiveForeground: '#FFFFFF',
    border: brandTokens.stone,
    input: brandTokens.stone,
    ring: brandTokens.champagne,
  },
  'noir-dark': {
    background: brandTokens.noir,
    foreground: brandTokens.ivory,
    card: brandTokens.graphite,
    cardForeground: brandTokens.ivory,
    primary: brandTokens.ivory,
    primaryForeground: brandTokens.noir,
    secondary: brandTokens.graphite,
    secondaryForeground: brandTokens.ivory,
    muted: brandTokens.graphite,
    mutedForeground: brandTokens.stone,
    accent: brandTokens.champagne,
    accentForeground: brandTokens.noir,
    destructive: '#B91C1C',
    destructiveForeground: '#FFFFFF',
    border: brandTokens.graphite,
    input: brandTokens.graphite,
    ring: brandTokens.deepTeal,
  },
} as const;

// Typography
export const typography = {
  fontFamily: {
    heading: 'Fraunces, "DM Serif Display", Georgia, serif',
    body: 'Inter, system-ui, sans-serif',
  },
  fontWeight: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
} as const;

// Animation timings (luxury: subtle, 150-220ms)
export const motion = {
  fast: '150ms',
  normal: '200ms',
  slow: '220ms',
  easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
} as const;

// Helper to convert hex to HSL for CSS custom properties
function hexToHSL(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

// Generate CSS custom properties for a theme
export function getThemeCSSVars(mode: 'ivory-light' | 'noir-dark'): Record<string, string> {
  const theme = themes[mode];
  return {
    '--background': hexToHSL(theme.background),
    '--foreground': hexToHSL(theme.foreground),
    '--card': hexToHSL(theme.card),
    '--card-foreground': hexToHSL(theme.cardForeground),
    '--primary': hexToHSL(theme.primary),
    '--primary-foreground': hexToHSL(theme.primaryForeground),
    '--secondary': hexToHSL(theme.secondary),
    '--secondary-foreground': hexToHSL(theme.secondaryForeground),
    '--muted': hexToHSL(theme.muted),
    '--muted-foreground': hexToHSL(theme.mutedForeground),
    '--accent': hexToHSL(theme.accent),
    '--accent-foreground': hexToHSL(theme.accentForeground),
    '--destructive': hexToHSL(theme.destructive),
    '--destructive-foreground': hexToHSL(theme.destructiveForeground),
    '--border': hexToHSL(theme.border),
    '--input': hexToHSL(theme.input),
    '--ring': hexToHSL(theme.ring),
    '--radius': '0.5rem',
  };
}

// Storage key for theme preference
export const THEME_STORAGE_KEY = 'ra-theme-mode';

// Get initial theme from storage or system preference
export function getStoredTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'system';
  return (localStorage.getItem(THEME_STORAGE_KEY) as ThemeMode) || 'system';
}

// Save theme preference
export function setStoredTheme(mode: ThemeMode): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(THEME_STORAGE_KEY, mode);
}

// Resolve system preference to actual theme
export function resolveTheme(mode: ThemeMode): 'ivory-light' | 'noir-dark' {
  if (mode === 'system') {
    if (typeof window === 'undefined') return 'ivory-light';
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'noir-dark'
      : 'ivory-light';
  }
  return mode;
}
