/**
 * Language helper utilities
 *
 * Handles browser language detection, normalization, and default
 * preferences used across the extension.
 */

export type SupportedLanguage =
  | "auto"
  | "en"
  | "ko"
  | "es"
  | "fr"
  | "de"
  | "zh-hans"
  | "zh-hant"
  | "ja"
  | "it"
  | "pt"
  | "ru"
  | "ar"
  | "hi";

export type NonAutoLanguage = Exclude<SupportedLanguage, "auto">;

const SUPPORTED_LANGUAGES: Set<SupportedLanguage> = new Set([
  "auto",
  "en",
  "ko",
  "es",
  "fr",
  "de",
  "zh-hans",
  "zh-hant",
  "ja",
  "it",
  "pt",
  "ru",
  "ar",
  "hi",
]);

const LANGUAGE_ALIASES: Record<string, SupportedLanguage> = {
  en: "en",
  "en-us": "en",
  "en-gb": "en",
  "en-au": "en",
  "en-ca": "en",
  "en-in": "en",
  "en-nz": "en",
  ko: "ko",
  "ko-kr": "ko",
  es: "es",
  "es-es": "es",
  "es-mx": "es",
  "es-ar": "es",
  "es-419": "es",
  fr: "fr",
  "fr-fr": "fr",
  "fr-ca": "fr",
  de: "de",
  "de-de": "de",
  ja: "ja",
  "ja-jp": "ja",
  it: "it",
  "it-it": "it",
  pt: "pt",
  "pt-pt": "pt",
  "pt-br": "pt",
  ru: "ru",
  "ru-ru": "ru",
  ar: "ar",
  "ar-sa": "ar",
  "ar-ae": "ar",
  hi: "hi",
  "hi-in": "hi",
  zh: "zh-hans",
  "zh-cn": "zh-hans",
  "zh-sg": "zh-hans",
  "zh-hans": "zh-hans",
  "zh-tw": "zh-hant",
  "zh-hk": "zh-hant",
  "zh-mo": "zh-hant",
  "zh-hant": "zh-hant",
};

export function getBrowserUILanguage(): string {
  if (
    typeof chrome !== "undefined" &&
    chrome?.i18n &&
    typeof chrome.i18n.getUILanguage === "function"
  ) {
    return chrome.i18n.getUILanguage() || "en";
  }

  if (typeof navigator !== "undefined" && navigator.language) {
    return navigator.language;
  }

  return "en";
}

type NormalizeLanguageOptions = {
  fallback?: SupportedLanguage;
  allowAuto?: boolean;
};

export function normalizeLanguageCode(
  code: string | null | undefined,
  options: NormalizeLanguageOptions = {},
): SupportedLanguage {
  const { fallback = "en", allowAuto = false } = options;

  if (!code) {
    return fallback;
  }

  const trimmed = code.trim();
  if (!trimmed) {
    return fallback;
  }

  const lower = trimmed.toLowerCase();

  if (allowAuto && lower === "auto") {
    return "auto";
  }

  if (LANGUAGE_ALIASES[lower]) {
    return LANGUAGE_ALIASES[lower];
  }

  if (SUPPORTED_LANGUAGES.has(lower as SupportedLanguage)) {
    return lower as SupportedLanguage;
  }

  const delimiterIndex = lower.search(/[-_]/);
  if (delimiterIndex > 0) {
    const base = lower.slice(0, delimiterIndex);
    if (LANGUAGE_ALIASES[base]) {
      return LANGUAGE_ALIASES[base];
    }
    if (SUPPORTED_LANGUAGES.has(base as SupportedLanguage)) {
      return base as SupportedLanguage;
    }
  }

  return fallback;
}

function resolveUILanguage(code: SupportedLanguage): "en" | "ko" {
  if (code === "ko") {
    return "ko";
  }
  return "en";
}

export function getDefaultLanguagePreferences(): {
  sourceLanguage: SupportedLanguage;
  targetLanguage: SupportedLanguage;
  uiLanguage: "en" | "ko";
} {
  const browserLanguage = getBrowserUILanguage();
  const normalizedBrowserLanguage = normalizeLanguageCode(browserLanguage);

  const targetLanguage =
    normalizedBrowserLanguage === "auto" ? "en" : normalizedBrowserLanguage;

  const uiLanguage = resolveUILanguage(targetLanguage);

  return {
    sourceLanguage: "auto",
    targetLanguage,
    uiLanguage,
  };
}

export function ensureSupportedTargetLanguage(
  code: string | null | undefined,
  fallback?: SupportedLanguage,
): NonAutoLanguage {
  const fallbackNonAuto = coerceNonAutoLanguage(fallback ?? "en", "en");
  const normalized = normalizeLanguageCode(code, {
    fallback: fallbackNonAuto,
    allowAuto: false,
  });

  return normalized === "auto" ? fallbackNonAuto : normalized;
}

export function ensureSupportedSourceLanguage(
  code: string | null | undefined,
  fallback?: SupportedLanguage,
): SupportedLanguage {
  return normalizeLanguageCode(code, {
    fallback: fallback ?? "auto",
    allowAuto: true,
  });
}

export function coerceNonAutoLanguage(
  value: SupportedLanguage,
  fallback: NonAutoLanguage,
): NonAutoLanguage {
  return value === "auto" ? fallback : value;
}
