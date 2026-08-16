"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { translate, DEFAULT_LOCALE, type Locale } from "@/lib/i18n";

interface I18nContextType {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

const STORAGE_KEY = "af_locale";

export function I18nProvider({ children }: { children: React.ReactNode }) {
  // Server & erster Client-Render: Default (vermeidet Hydration-Mismatch);
  // danach aus localStorage übernehmen.
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    const saved = (localStorage.getItem(STORAGE_KEY) as Locale | null) || DEFAULT_LOCALE;
    if (saved !== locale) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLocaleState(saved);
    }
    document.documentElement.lang = saved;
    const onChange = () => {
      const l = (localStorage.getItem(STORAGE_KEY) as Locale | null) || DEFAULT_LOCALE;
      setLocaleState(l);
      document.documentElement.lang = l;
    };
    window.addEventListener("af_locale_changed", onChange);
    return () => window.removeEventListener("af_locale_changed", onChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setLocale = useCallback((l: Locale) => {
    localStorage.setItem(STORAGE_KEY, l);
    document.documentElement.lang = l;
    setLocaleState(l);
    window.dispatchEvent(new Event("af_locale_changed"));
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => translate(locale, key, vars),
    [locale]
  );

  return <I18nContext.Provider value={{ locale, setLocale, t }}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextType {
  const ctx = useContext(I18nContext);
  if (ctx === undefined) throw new Error("useI18n must be used within an I18nProvider");
  return ctx;
}
