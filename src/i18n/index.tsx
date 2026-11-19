import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { en } from './en';

/**
 * Minimal i18n: Ukrainian source strings are the keys.
 *   tr('Відкрити лог')            → 'Open log' in English
 *   tr('Політ {0}', 3)            → 'Flight 3'
 * Missing translations fall back to the Ukrainian text.
 */

export type Lang = 'uk' | 'en';

export const LANGUAGES: { key: Lang; label: string; flag: string }[] = [
  { key: 'uk', label: 'Українська', flag: '🇺🇦' },
  { key: 'en', label: 'English', flag: '🇬🇧' },
];

const DICTS: Record<Lang, Record<string, string> | null> = { uk: null, en };
const K_LANG = 'wf.lang';

let current: Lang = 'uk';

export function getLang(): Lang {
  return current;
}

/** BCP-47 locale for dates / numbers. */
export function locale(): string {
  return current === 'en' ? 'en-GB' : 'uk-UA';
}

export function tr(key: string, ...args: unknown[]): string {
  if (typeof key !== 'string') return String(key);
  let out = key;
  const dict = DICTS[current];
  if (dict) {
    // keys are stored trimmed; keep the caller's surrounding whitespace
    const m = key.match(/^(\s*)([\s\S]*?)(\s*)$/)!;
    const hit = dict[m[2]];
    if (hit) out = m[1] + hit + m[3];
  }
  if (args.length) out = out.replace(/\{(\d+)\}/g, (_, i) => (args[+i] === undefined || args[+i] === null ? '' : String(args[+i])));
  return out;
}

interface LangState {
  lang: Lang;
  setLang(l: Lang): void;
}
const Ctx = createContext<LangState>({ lang: 'uk', setLang: () => {} });

/** Loads the saved language and remounts the app when it changes. */
export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(K_LANG)
      .then((v) => {
        const l: Lang = v === 'en' || v === 'uk' ? v : 'uk';
        current = l;
        setLangState(l);
      })
      .catch(() => setLangState('uk'));
  }, []);

  const setLang = useCallback((l: Lang) => {
    current = l;
    setLangState(l);
    AsyncStorage.setItem(K_LANG, l).catch(() => {});
  }, []);

  if (!lang) return null;
  return (
    <Ctx.Provider value={{ lang, setLang }}>
      <React.Fragment key={lang}>{children}</React.Fragment>
    </Ctx.Provider>
  );
}

export function useLang(): LangState {
  return useContext(Ctx);
}
