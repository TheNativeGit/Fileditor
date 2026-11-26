export interface LanguageItem {
  code: string;
  name: string;
  nativeName: string;
}

export const AVAILABLE_LANGUAGES: LanguageItem[] = [
  { code: "de", name: "German", nativeName: "Deutsch" },
  { code: "en", name: "English", nativeName: "English" },
  { code: "es", name: "Spanish", nativeName: "Español" },
  { code: "fr", name: "French", nativeName: "Français" },
  { code: "it", name: "Italian", nativeName: "Italiano" }
].sort((a, b) => a.nativeName.localeCompare(b.nativeName));
