import React, { createContext, useContext, useState, useEffect } from 'react';

export type ThemeMode = 'light' | 'dark' | 'system';
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
  theme: 'dark',
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

export const ThemeProvider: React.FC<ThemeProviderProps> = ({
  children,
  defaultTheme = 'dark',
  defaultDensity = 'comfortable',
  defaultTouchMode = 'desktop',
}) => {
  const [theme, setTheme] = useState<ThemeMode>(defaultTheme);
  const [density, setDensity] = useState<DensityMode>(defaultDensity);
  const [touchMode, setTouchMode] = useState<TouchMode>(defaultTouchMode);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      const root = document.documentElement;
      root.dataset.theme = theme;
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

