import React, { createContext, useContext, useState } from 'react';
import { fr, TranslationKey } from './fr';
import { en } from './en';

export type Lang = 'fr' | 'en';

const translations: Record<Lang, Record<TranslationKey, string>> = { fr, en };

interface LanguageContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: TranslationKey) => string;
}

const LanguageContext = createContext<LanguageContextValue>({
  lang: 'fr',
  setLang: () => {},
  t: (k) => fr[k],
});

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<Lang>(() => {
    return (localStorage.getItem('cluely_ui_lang') as Lang) || 'fr';
  });

  const setLang = (l: Lang) => {
    localStorage.setItem('cluely_ui_lang', l);
    setLangState(l);
    // Sync to main process for AI prompt language
    (window as any).electronAPI?.invoke?.('set-ui-lang', l);
  };

  const t = (key: TranslationKey): string => translations[lang][key] ?? fr[key];

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useT = () => useContext(LanguageContext);
