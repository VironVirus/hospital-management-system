"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";

export type Theme = "light" | "dark";
export type ThemeMode = Theme | "auto" | "system";

type ThemeContextValue = {
  mode: ThemeMode;
  resolvedTheme: Theme;
  setMode: (mode: ThemeMode) => void;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
};

const STORAGE_KEY = "st-gianna-theme-mode";
const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function safeGetStoredMode(): ThemeMode {
  if (typeof window === "undefined") return "auto";
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === "light" || value === "dark" || value === "system" || value === "auto"
      ? value
      : "auto";
  } catch {
    return "auto";
  }
}

function safeSetStoredMode(mode: ThemeMode) {
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {}
}

function getSystemTheme(): Theme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function getScheduledTheme(date = new Date()): Theme {
  const hour = Number(new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    hour12: false,
    timeZone: "Africa/Lagos"
  }).format(date));
  return hour >= 19 || hour < 6 ? "dark" : "light";
}

function resolveTheme(mode: ThemeMode): Theme {
  if (mode === "system") return getSystemTheme();
  if (mode === "auto") return getScheduledTheme();
  return mode;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("auto");
  const [resolvedTheme, setResolvedTheme] = useState<Theme>("light");

  useEffect(() => {
    const storedMode = safeGetStoredMode();
    setModeState(storedMode);
    setResolvedTheme(resolveTheme(storedMode));
  }, []);

  useEffect(() => {
    const update = () => setResolvedTheme(resolveTheme(mode));
    update();
    safeSetStoredMode(mode);

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    if (mode === "system") {
      if (typeof mediaQuery.addEventListener === "function") mediaQuery.addEventListener("change", update);
      else mediaQuery.addListener(update);
    }
    const timer = mode === "auto" ? window.setInterval(update, 60_000) : null;

    return () => {
      if (typeof mediaQuery.removeEventListener === "function") mediaQuery.removeEventListener("change", update);
      else mediaQuery.removeListener(update);
      if (timer !== null) window.clearInterval(timer);
    };
  }, [mode]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", resolvedTheme === "dark");
    document.documentElement.style.colorScheme = resolvedTheme;
  }, [resolvedTheme]);

  const value = useMemo<ThemeContextValue>(() => ({
    mode,
    resolvedTheme,
    setMode: setModeState,
    setTheme: (theme) => setModeState(theme),
    toggleTheme: () => setModeState(resolvedTheme === "dark" ? "light" : "dark")
  }), [mode, resolvedTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within a ThemeProvider");
  return context;
}
