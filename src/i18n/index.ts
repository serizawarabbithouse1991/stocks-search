import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import React from "react";
import ja from "./ja";
import en from "./en";

export type Locale = "ja" | "en";

const dictionaries: Record<Locale, Record<string, string>> = { ja, en };

interface LocaleContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string) => string;
}

const STORAGE_KEY = "app-locale";

function detectLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "ja" || stored === "en") return stored;
  } catch {}
  const lang = navigator.language?.toLowerCase() ?? "";
  if (lang.startsWith("ja")) return "ja";
  return "en";
}

const LocaleContext = createContext<LocaleContextValue>({
  locale: "ja",
  setLocale: () => {},
  t: (key) => key,
});

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(detectLocale);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {}
  }, []);

  const t = useCallback(
    (key: string): string => dictionaries[locale][key] ?? key,
    [locale]
  );

  return React.createElement(
    LocaleContext.Provider,
    { value: { locale, setLocale, t } },
    children
  );
}

export function useLocale() {
  return useContext(LocaleContext);
}
