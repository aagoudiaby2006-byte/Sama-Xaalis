import { createContext, useContext } from 'react';

export const palette = {
  night: '#0F172A',
  cobalt: '#2563EB',
  emerald: '#10B981',
  white: '#FFFFFF',
  pearl: '#F1F5F9',
  danger: '#DC2626',
  warning: '#B45309',
};

export interface Theme {
  dark: boolean;
  colors: {
    background: string;
    surface: string;
    surfaceAlt: string;
    text: string;
    textMuted: string;
    border: string;
    primary: string;
    onPrimary: string;
    accent: string;
    danger: string;
    warning: string;
    warningBg: string;
    successBg: string;
    dangerBg: string;
    hero: string;
    onHero: string;
  };
  radius: { sm: number; md: number; lg: number; pill: number };
  space: (n: number) => number;
}

const base = {
  radius: { sm: 8, md: 14, lg: 22, pill: 999 },
  space: (n: number) => n * 4,
};

export const lightTheme: Theme = {
  ...base,
  dark: false,
  colors: {
    background: palette.pearl,
    surface: palette.white,
    surfaceAlt: '#E2E8F0',
    text: palette.night,
    textMuted: '#475569',
    border: '#CBD5E1',
    primary: palette.cobalt,
    onPrimary: palette.white,
    accent: '#047857', // emerald darkened for AA contrast on white
    danger: palette.danger,
    warning: palette.warning,
    warningBg: '#FEF3C7',
    successBg: '#D1FAE5',
    dangerBg: '#FEE2E2',
    hero: palette.night,
    onHero: palette.white,
  },
};

export const darkTheme: Theme = {
  ...base,
  dark: true,
  colors: {
    background: '#020617',
    surface: palette.night,
    surfaceAlt: '#1E293B',
    text: '#F8FAFC',
    textMuted: '#94A3B8',
    border: '#334155',
    primary: '#3B82F6',
    onPrimary: palette.white,
    accent: palette.emerald,
    danger: '#F87171',
    warning: '#FBBF24',
    warningBg: '#422006',
    successBg: '#064E3B',
    dangerBg: '#450A0A',
    hero: '#1E3A8A',
    onHero: palette.white,
  },
};

export const ThemeContext = createContext<Theme>(lightTheme);

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
