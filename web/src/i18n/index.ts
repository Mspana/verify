import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./locales/en.json";
import zhCN from "./locales/zh-CN.json";

// Language choice order:
//   1. localStorage override (set by the in-app LanguageSwitcher)
//   2. navigator.language — any zh* tag → zh-CN, everything else → en
// Client-side only; no Accept-Language negotiation. Both locale bundles
// are shipped eagerly — they're ~15 KB total, below the noise floor of
// code-splitting value.

export const SUPPORTED_LANGUAGES = ["en", "zh-CN"] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

const STORAGE_KEY = "verify.lang";

export function detectInitialLanguage(): Language {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "en" || stored === "zh-CN") return stored;
  } catch {
    // localStorage can throw under private-mode or sandboxed iframes.
    // Fall through to navigator detection.
  }
  const nav = typeof navigator !== "undefined" ? navigator.language : "";
  if (nav.toLowerCase().startsWith("zh")) return "zh-CN";
  return "en";
}

export function persistLanguage(lang: Language): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // Persistence is best-effort; the active i18n state is what the UI
    // reads. A private-mode user just loses the preference on reload.
  }
}

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    "zh-CN": { translation: zhCN },
  },
  lng: detectInitialLanguage(),
  fallbackLng: "en",
  interpolation: { escapeValue: false },
  // Warn on missing keys during dev; silent in prod so users never see
  // raw key paths if we ship a regression.
  saveMissing: false,
  debug: import.meta.env.DEV,
  returnNull: false,
});

export default i18n;
