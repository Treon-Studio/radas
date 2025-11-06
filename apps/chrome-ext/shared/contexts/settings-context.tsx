import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type FontSize = 'small' | 'medium' | 'large';

interface SettingsContextType {
  darkMode: boolean;
  fontSize: FontSize;
  toggleDarkMode: () => void;
  setFontSize: (size: FontSize) => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

interface SettingsProviderProps {
  children: ReactNode;
}

export function SettingsProvider({ children }: SettingsProviderProps) {
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('radas-dark-mode');
    return saved ? JSON.parse(saved) : false;
  });

  const [fontSize, setFontSizeState] = useState<FontSize>(() => {
    const saved = localStorage.getItem('radas-font-size');
    return (saved as FontSize) || 'medium';
  });

  useEffect(() => {
    localStorage.setItem('radas-dark-mode', JSON.stringify(darkMode));
  }, [darkMode]);

  useEffect(() => {
    localStorage.setItem('radas-font-size', fontSize);
  }, [fontSize]);

  const toggleDarkMode = () => {
    setDarkMode(prev => !prev);
  };

  const setFontSize = (size: FontSize) => {
    setFontSizeState(size);
  };

  return (
    <SettingsContext.Provider value={{
      darkMode,
      fontSize,
      toggleDarkMode,
      setFontSize
    }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}
