import { createContext, useContext } from 'react';

// Sama-Xaalis palette: warm cream / charcoal, a deep savings green and a gold coin.
export const palette = {
  cream: '#F5F0E6', // light background, dark-mode text
  ink: '#2C2C2C', // light-mode text
  night: '#1A1A1A', // dark background
  green: '#1E6B52',
  mint: '#5CC99A',
  gold: '#E0A526',
  white: '#FFFFFF',
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
  radius: { sm: 10, md: 16, lg: 24, pill: 999 },
  space: (n: number) => n * 4,
};

export const lightTheme: Theme = {
  ...base,
  dark: false,
  colors: {
    background: palette.cream,
    surface: '#FFFDF8',
    surfaceAlt: '#EAE3D5',
    text: palette.ink,
    textMuted: '#5E5A52',
    border: '#D9D1C1',
    primary: palette.green,
    onPrimary: palette.white,
    accent: palette.green,
    danger: '#B42318',
    warning: '#8A5A00',
    warningBg: '#F8E9C8',
    successBg: '#DDEFE4',
    dangerBg: '#F9DEDA',
    hero: palette.ink,
    onHero: palette.cream,
  },
};

export const darkTheme: Theme = {
  ...base,
  dark: true,
  colors: {
    background: palette.night,
    surface: '#242424',
    surfaceAlt: '#2F2F2F',
    text: palette.cream,
    textMuted: '#B8B2A7',
    border: '#3A3A3A',
    primary: palette.mint,
    onPrimary: palette.night,
    accent: palette.mint,
    danger: '#F28B82',
    warning: '#F2C46D',
    warningBg: '#3A2E12',
    successBg: '#173828',
    dangerBg: '#3D1B18',
    hero: '#1E4D3D',
    onHero: palette.cream,
  },
};

export const ThemeContext = createContext<Theme>(lightTheme);

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
