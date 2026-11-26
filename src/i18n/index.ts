import { create } from "zustand";
import en from "./locales/en.json";
import de from "./locales/de.json";
import es from "./locales/es.json";
import { AVAILABLE_LANGUAGES, LanguageItem } from "./languages";

export { AVAILABLE_LANGUAGES, type LanguageItem };

const translationsMap: Record<string, any> = {
  en,
  de,
  es
};

interface I18nState {
  currentLanguage: string;
  setLanguage: (lang: string) => void;
  t: (path: string, params?: Record<string, string | number>) => string;
}

const getNestedValue = (obj: any, path: string): string | undefined => {
  const parts = path.split(".");
  let current = obj;
  for (const part of parts) {
    if (current && typeof current === "object" && part in current) {
      current = current[part];
    } else {
      return undefined;
    }
  }
  return typeof current === "string" ? current : undefined;
};

export const useI18nStore = create<I18nState>((set, get) => {
  const initialLang = localStorage.getItem("fileditor_language") || "en";
  const validLang = translationsMap[initialLang] ? initialLang : "en";

  return {
    currentLanguage: validLang,
    setLanguage: (lang: string) => {
      const selected = translationsMap[lang] ? lang : "en";
      localStorage.setItem("fileditor_language", selected);
      set({ currentLanguage: selected });
    },
    t: (path: string, params?: Record<string, string | number>) => {
      const current = get().currentLanguage;
      let text = getNestedValue(translationsMap[current], path);
      if (text === undefined) {
        text = getNestedValue(translationsMap["en"], path);
      }
      if (text === undefined) {
        return path;
      }
      if (params) {
        for (const [key, val] of Object.entries(params)) {
          text = text.replace(new RegExp(`\\{${key}\\}`, "g"), String(val));
        }
      }
      return text;
    }
  };
});

export const t = (path: string, params?: Record<string, string | number>) => {
  return useI18nStore.getState().t(path, params);
};

export const useTranslation = () => {
  const { currentLanguage, setLanguage, t } = useI18nStore();
  return { currentLanguage, setLanguage, t };
};
