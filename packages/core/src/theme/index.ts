/**
 * RealRiches Theme System
 * Luxury champagne gold/bronze/ivory design language
 */

// ============================================================================
// COLOR PALETTE
// ============================================================================

export const colors = {
  // Primary - Deep Teal
  primary: {
    50: '#E6F2F2',
    100: '#B3DADA',
    200: '#80C2C2',
    300: '#4DAAAA',
    400: '#269292',
    500: '#0F3B3A', // Main
    600: '#0D3433',
    700: '#0A2827',
    800: '#071C1B',
    900: '#04100F',
  },
  
  // Accent - Champagne Gold
  accent: {
    50: '#FBF8F0',
    100: '#F5EDD9',
    200: '#EDE0BD',
    300: '#E4D3A1',
    400: '#D5BD7A',
    500: '#C6A76A', // Main
    600: '#B08D4A',
    700: '#8A6E3A',
    800: '#64502A',
    900: '#3E311A',
  },
  
  // Bronze
  bronze: {
    50: '#F9F5F0',
    100: '#EFE5D9',
    200: '#E0CEBB',
    300: '#D1B79D',
    400: '#B8956E',
    500: '#8B7355', // Main
    600: '#725E46',
    700: '#594937',
    800: '#403428',
    900: '#271F19',
  },
  
  // Ivory/Cream Background
  ivory: {
    50: '#FEFDFB',
    100: '#FBF9F4',
    200: '#F6F1E8', // Main Light BG
    300: '#EFE7D8',
    400: '#E5D9C4',
    500: '#D9C9AE',
    600: '#C4AD8A',
    700: '#A58E68',
    800: '#7D6A4E',
    900: '#554634',
  },
  
  // Noir/Dark Mode
  noir: {
    50: '#E8E8E8',
    100: '#C4C4C5',
    200: '#9D9D9F',
    300: '#767679',
    400: '#585859',
    500: '#3A3A3C',
    600: '#2C2C2E',
    700: '#1C1C1E',
    800: '#0F0F10',
    900: '#0A0A0B', // Main Dark BG
  },
  
  // Semantic Colors
  success: {
    50: '#ECFDF5',
    100: '#D1FAE5',
    200: '#A7F3D0',
    300: '#6EE7B7',
    400: '#34D399',
    500: '#10B981',
    600: '#059669',
    700: '#047857',
    800: '#065F46',
    900: '#064E3B',
  },
  
  warning: {
    50: '#FFFBEB',
    100: '#FEF3C7',
    200: '#FDE68A',
    300: '#FCD34D',
    400: '#FBBF24',
    500: '#F59E0B',
    600: '#D97706',
    700: '#B45309',
    800: '#92400E',
    900: '#78350F',
  },
  
  error: {
    50: '#FEF2F2',
    100: '#FEE2E2',
    200: '#FECACA',
    300: '#FCA5A5',
    400: '#F87171',
    500: '#EF4444',
    600: '#DC2626',
    700: '#B91C1C',
    800: '#991B1B',
    900: '#7F1D1D',
  },
  
  info: {
    50: '#EFF6FF',
    100: '#DBEAFE',
    200: '#BFDBFE',
    300: '#93C5FD',
    400: '#60A5FA',
    500: '#3B82F6',
    600: '#2563EB',
    700: '#1D4ED8',
    800: '#1E40AF',
    900: '#1E3A8A',
  },
  
  // Neutral/Slate
  slate: {
    50: '#F8FAFC',
    100: '#F1F5F9',
    200: '#E2E8F0',
    300: '#CBD5E1',
    400: '#94A3B8',
    500: '#64748B',
    600: '#475569',
    700: '#334155',
    800: '#1E293B',
    900: '#0F172A',
  },
} as const;

// ============================================================================
// TYPOGRAPHY
// ============================================================================

export const fonts = {
  // Display/Headings - Playfair Display for luxury feel
  display: {
    family: '"Playfair Display", Georgia, "Times New Roman", serif',
    weights: {
      regular: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
    },
  },
  
  // Body - Inter for readability
  body: {
    family: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    weights: {
      light: 300,
      regular: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
    },
  },
  
  // Mono - JetBrains Mono for code/numbers
  mono: {
    family: '"JetBrains Mono", "SF Mono", Consolas, Monaco, monospace',
    weights: {
      regular: 400,
      medium: 500,
      bold: 700,
    },
  },
};

export const fontSizes = {
  xs: '0.75rem',    // 12px
  sm: '0.875rem',   // 14px
  base: '1rem',     // 16px
  lg: '1.125rem',   // 18px
  xl: '1.25rem',    // 20px
  '2xl': '1.5rem',  // 24px
  '3xl': '1.875rem',// 30px
  '4xl': '2.25rem', // 36px
  '5xl': '3rem',    // 48px
  '6xl': '3.75rem', // 60px
};

export const lineHeights = {
  none: 1,
  tight: 1.25,
  snug: 1.375,
  normal: 1.5,
  relaxed: 1.625,
  loose: 2,
};

// ============================================================================
// SPACING
// ============================================================================

export const spacing = {
  0: '0',
  px: '1px',
  0.5: '0.125rem',  // 2px
  1: '0.25rem',     // 4px
  1.5: '0.375rem',  // 6px
  2: '0.5rem',      // 8px
  2.5: '0.625rem',  // 10px
  3: '0.75rem',     // 12px
  3.5: '0.875rem',  // 14px
  4: '1rem',        // 16px
  5: '1.25rem',     // 20px
  6: '1.5rem',      // 24px
  7: '1.75rem',     // 28px
  8: '2rem',        // 32px
  9: '2.25rem',     // 36px
  10: '2.5rem',     // 40px
  11: '2.75rem',    // 44px
  12: '3rem',       // 48px
  14: '3.5rem',     // 56px
  16: '4rem',       // 64px
  20: '5rem',       // 80px
  24: '6rem',       // 96px
  28: '7rem',       // 112px
  32: '8rem',       // 128px
};

// ============================================================================
// BORDERS
// ============================================================================

export const borderRadius = {
  none: '0',
  sm: '0.125rem',   // 2px
  DEFAULT: '0.25rem', // 4px
  md: '0.375rem',   // 6px
  lg: '0.5rem',     // 8px
  xl: '0.75rem',    // 12px
  '2xl': '1rem',    // 16px
  '3xl': '1.5rem',  // 24px
  full: '9999px',
};

export const borderWidths = {
  0: '0',
  DEFAULT: '1px',
  2: '2px',
  4: '4px',
  8: '8px',
};

// ============================================================================
// SHADOWS
// ============================================================================

export const shadows = {
  sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
  DEFAULT: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
  md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
  lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
  xl: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
  '2xl': '0 25px 50px -12px rgb(0 0 0 / 0.25)',
  inner: 'inset 0 2px 4px 0 rgb(0 0 0 / 0.05)',
  none: 'none',
  
  // Luxury shadows with gold tint
  luxury: '0 4px 20px -2px rgba(198, 167, 106, 0.15)',
  luxuryLg: '0 10px 40px -4px rgba(198, 167, 106, 0.2)',
};

// ============================================================================
// TRANSITIONS
// ============================================================================

export const transitions = {
  duration: {
    75: '75ms',
    100: '100ms',
    150: '150ms',
    200: '200ms',
    300: '300ms',
    500: '500ms',
    700: '700ms',
    1000: '1000ms',
  },
  timing: {
    DEFAULT: 'cubic-bezier(0.4, 0, 0.2, 1)',
    linear: 'linear',
    in: 'cubic-bezier(0.4, 0, 1, 1)',
    out: 'cubic-bezier(0, 0, 0.2, 1)',
    inOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
  },
};

// ============================================================================
// Z-INDEX
// ============================================================================

export const zIndex = {
  0: 0,
  10: 10,
  20: 20,
  30: 30,
  40: 40,
  50: 50,
  dropdown: 100,
  sticky: 200,
  fixed: 300,
  modalBackdrop: 400,
  modal: 500,
  popover: 600,
  tooltip: 700,
  toast: 800,
};

// ============================================================================
// BREAKPOINTS
// ============================================================================

export const breakpoints = {
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
};

// ============================================================================
// THEME PRESETS
// ============================================================================

export const lightTheme = {
  name: 'ivory' as const,
  colors: {
    background: colors.ivory[200],
    surface: '#FFFFFF',
    surfaceHover: colors.ivory[100],
    text: colors.noir[800],
    textSecondary: colors.slate[600],
    textMuted: colors.slate[400],
    primary: colors.primary[500],
    primaryHover: colors.primary[600],
    accent: colors.accent[500],
    accentHover: colors.accent[600],
    border: colors.ivory[400],
    borderHover: colors.bronze[300],
    divider: colors.ivory[300],
  },
};

export const darkTheme = {
  name: 'noir' as const,
  colors: {
    background: colors.noir[900],
    surface: colors.noir[800],
    surfaceHover: colors.noir[700],
    text: colors.ivory[100],
    textSecondary: colors.slate[300],
    textMuted: colors.slate[500],
    primary: colors.accent[500],
    primaryHover: colors.accent[400],
    accent: colors.primary[400],
    accentHover: colors.primary[300],
    border: colors.noir[600],
    borderHover: colors.noir[500],
    divider: colors.noir[700],
  },
};

// ============================================================================
// COMPONENT STYLES
// ============================================================================

export const componentStyles = {
  button: {
    primary: {
      bg: colors.primary[500],
      text: '#FFFFFF',
      hover: colors.primary[600],
      active: colors.primary[700],
    },
    secondary: {
      bg: colors.accent[500],
      text: colors.noir[900],
      hover: colors.accent[600],
      active: colors.accent[700],
    },
    outline: {
      bg: 'transparent',
      text: colors.primary[500],
      border: colors.primary[500],
      hover: colors.primary[50],
    },
    ghost: {
      bg: 'transparent',
      text: colors.slate[600],
      hover: colors.slate[100],
    },
  },
  
  input: {
    bg: '#FFFFFF',
    border: colors.slate[300],
    borderFocus: colors.primary[500],
    text: colors.noir[800],
    placeholder: colors.slate[400],
    error: colors.error[500],
  },
  
  card: {
    bg: '#FFFFFF',
    border: colors.ivory[300],
    shadow: shadows.md,
    radius: borderRadius.xl,
  },
  
  badge: {
    success: {
      bg: colors.success[100],
      text: colors.success[700],
    },
    warning: {
      bg: colors.warning[100],
      text: colors.warning[700],
    },
    error: {
      bg: colors.error[100],
      text: colors.error[700],
    },
    info: {
      bg: colors.info[100],
      text: colors.info[700],
    },
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export const theme = {
  colors,
  fonts,
  fontSizes,
  lineHeights,
  spacing,
  borderRadius,
  borderWidths,
  shadows,
  transitions,
  zIndex,
  breakpoints,
  light: lightTheme,
  dark: darkTheme,
  components: componentStyles,
};

export type Theme = typeof theme;
export type ThemeMode = 'light' | 'dark';
