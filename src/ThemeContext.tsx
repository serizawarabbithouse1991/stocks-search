import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";

export type Theme = "dark" | "light";

interface ThemeContextValue {
  theme: Theme;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "dark",
  toggle: () => {},
});

function getStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem("app-theme");
    if (stored === "light" || stored === "dark") return stored;
  } catch { /* SSR / privacy mode */ }
  return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(getStoredTheme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const toggle = useCallback(() => {
    setThemeState((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      localStorage.setItem("app-theme", next);
      document.documentElement.setAttribute("data-theme", next);
      return next;
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

export interface ChartColors {
  bg: string;
  grid: string;
  text: string;
  tooltipBg: string;
  tooltipBorder: string;
  volumeFill: string;
}

export function useChartColors(): ChartColors {
  const { theme } = useTheme();
  return theme === "light"
    ? {
        bg: "#ffffff",
        grid: "#e0e0e0",
        text: "#57606a",
        tooltipBg: "#ffffff",
        tooltipBorder: "#d0d7de",
        volumeFill: "#d0d7de",
      }
    : {
        bg: "#0d1117",
        grid: "#30363d",
        text: "#8b949e",
        tooltipBg: "#161b22",
        tooltipBorder: "#30363d",
        volumeFill: "#30363d",
      };
}
