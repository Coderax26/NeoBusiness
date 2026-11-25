import React, { createContext, useContext, useState, useEffect } from 'react';

export type ThemeMode = 'paper' | 'night' | 'floor' | 'light' | 'dark' | 'system';
export type DensityMode = 'comfortable' | 'compact';
export type TouchMode = 'desktop' | 'floor';

interface ThemeContextValue {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  density: DensityMode;
  setDensity: (density: DensityMode) => void;
  touchMode: TouchMode;
  setTouchMode: (touchMode: TouchMode) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'paper',
  setTheme: () => {},
  density: 'comfortable',
  setDensity: () => {},
  touchMode: 'desktop',
  setTouchMode: () => {},
});

export interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: ThemeMode;
  defaultDensity?: DensityMode;
  defaultTouchMode?: TouchMode;
}

function normalizeTheme(raw: string | null | undefined, fallback: ThemeMode): ThemeMode {
  if (!raw) return fallback;
  if (raw === 'light' || raw === 'paper') return 'paper';
  if (raw === 'dark' || raw === 'night') return 'night';
  if (raw === 'floor') return 'floor';
  if (raw === 'system') return 'system';
  return fallback;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({
  children,
  defaultTheme = 'paper',
  defaultDensity = 'comfortable',
  defaultTouchMode = 'desktop',
}) => {
  const [theme, setThemeState] = useState<ThemeMode>(defaultTheme);
  const [density, setDensityState] = useState<DensityMode>(defaultDensity);
  const [touchMode, setTouchMode] = useState<TouchMode>(defaultTouchMode);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const savedTheme = localStorage.getItem('neobus_theme');
    const savedDensity = localStorage.getItem('neobus_density');
    if (savedTheme) setThemeState(normalizeTheme(savedTheme, defaultTheme));
    if (savedDensity === 'compact' || savedDensity === 'comfortable') {
      setDensityState(savedDensity);
    }
  }, [defaultTheme]);

  const setTheme = (next: ThemeMode) => {
    const normalized = normalizeTheme(next, 'paper');
    setThemeState(normalized);
    if (typeof window !== 'undefined' && normalized !== 'floor') {
      localStorage.setItem('neobus_theme', normalized);
    }
  };

  const setDensity = (next: DensityMode) => {
    setDensityState(next);
    if (typeof window !== 'undefined') {
      localStorage.setItem('neobus_density', next);
    }
  };

  useEffect(() => {
    if (typeof document !== 'undefined') {
      const root = document.documentElement;
      const resolved =
        theme === 'system'
          ? window.matchMedia?.('(prefers-color-scheme: dark)').matches
            ? 'night'
            : 'paper'
          : normalizeTheme(theme, 'paper');
      root.dataset.theme = resolved;
      root.dataset.density = density;
      root.dataset.touchMode = touchMode;
    }
  }, [theme, density, touchMode]);

  return (
    <ThemeContext.Provider
      value={{
        theme,
        setTheme,
        density,
        setDensity,
        touchMode,
        setTouchMode,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export function useTheme() {
  return useContext(ThemeContext);
}
