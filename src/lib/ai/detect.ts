import type { AISupport } from "@/types";
// Polyfill intentionally disabled in Chrome Built-in AI only mode
// import { ensureAIPolyfill, isServerPolyfillActive } from "./polyfill";
import { getAIHandle } from "./env";
import {
  ensureSupportedSourceLanguage,
  ensureSupportedTargetLanguage,
  getDefaultLanguagePreferences,
  coerceNonAutoLanguage,
  type NonAutoLanguage,
  type SupportedLanguage,
} from "@/lib/language";

type AvailabilityState =
  | "no"
  | "after-download"
  | "readily"
  | "available"
  | "unavailable";

const MODERN_API_MAP: Record<keyof AISupport, string> = {
  translator: "Translator",
  summarizer: "Summarizer",
  prompt: "LanguageModel",
  writer: "Writer",
  rewriter: "Rewriter",
  proofreader: "Proofreader",
};

type LanguagePreferences = {
  sourceLanguage: NonAutoLanguage;
  targetLanguage: NonAutoLanguage;
};

type LanguagePreferenceOverrides = {
  sourceLanguage?: SupportedLanguage;
  targetLanguage?: SupportedLanguage;
};

const LANGUAGE_DEFAULTS = getDefaultLanguagePreferences();
const DEFAULT_SOURCE = ensureSupportedSourceLanguage(
  LANGUAGE_DEFAULTS.sourceLanguage,
  "en",
);
const DEFAULT_TARGET = ensureSupportedTargetLanguage(
  LANGUAGE_DEFAULTS.targetLanguage,
  "en",
);

const FALLBACK_LANGUAGES: LanguagePreferences = {
  sourceLanguage: coerceNonAutoLanguage(DEFAULT_SOURCE, "en"),
  targetLanguage: DEFAULT_TARGET,
};

async function resolveLanguagePreferences(
  overrides?: LanguagePreferenceOverrides,
): Promise<LanguagePreferences> {
  const preferences: LanguagePreferences = { ...FALLBACK_LANGUAGES };

  if (
    typeof chrome !== "undefined" &&
    chrome?.storage?.local &&
    typeof chrome.storage.local.get === "function"
  ) {
    try {
      const stored = await chrome.storage.local.get([
        "sourceLanguage",
        "targetLanguage",
      ]);

      if (typeof stored.sourceLanguage === "string" && stored.sourceLanguage) {
        const normalizedSource = ensureSupportedSourceLanguage(
          stored.sourceLanguage,
          FALLBACK_LANGUAGES.sourceLanguage,
        );
        preferences.sourceLanguage = coerceNonAutoLanguage(
          normalizedSource,
          FALLBACK_LANGUAGES.sourceLanguage,
        );
      }

      if (typeof stored.targetLanguage === "string" && stored.targetLanguage) {
        preferences.targetLanguage = ensureSupportedTargetLanguage(
          stored.targetLanguage,
          FALLBACK_LANGUAGES.targetLanguage,
        );
      }
    } catch (error) {
      console.warn("[Glotian AI] Failed to read language preferences:", error);
    }
  }

  if (overrides?.sourceLanguage) {
    const normalizedOverride = ensureSupportedSourceLanguage(
      overrides.sourceLanguage,
      FALLBACK_LANGUAGES.sourceLanguage,
    );
    preferences.sourceLanguage = coerceNonAutoLanguage(
      normalizedOverride,
      FALLBACK_LANGUAGES.sourceLanguage,
    );
  }

  if (overrides?.targetLanguage) {
    preferences.targetLanguage = ensureSupportedTargetLanguage(
      overrides.targetLanguage,
      FALLBACK_LANGUAGES.targetLanguage,
    );
  }

  return preferences;
}

function getModernAPI(name: keyof AISupport): Record<string, any> | undefined {
  const globalName = MODERN_API_MAP[name];
  if (!globalName || typeof globalThis === "undefined") {
    return undefined;
  }

  const scope = globalThis as Record<string, any>;
  const api = scope?.[globalName];
  return typeof api === "object" || typeof api === "function" ? api : undefined;
}

function normalizeAvailability(value: unknown): AvailabilityState {
  if (typeof value === "string") {
    return value as AvailabilityState;
  }

  if (value && typeof value === "object") {
    if ("available" in (value as Record<string, unknown>)) {
      const available = (value as Record<string, any>).available;
      if (typeof available === "string") {
        return available as AvailabilityState;
      }
    }
    if ("status" in (value as Record<string, unknown>)) {
      const status = (value as Record<string, any>).status;
      if (typeof status === "string") {
        return status as AvailabilityState;
      }
    }
  }

  return "no";
}

function isAvailable(value: unknown): boolean {
  const state = normalizeAvailability(value);
  return state !== "no" && state !== "unavailable";
}

async function checkModernAvailability(
  apiName: keyof AISupport,
  preferences: LanguagePreferences,
): Promise<boolean> {
  try {
    const api = getModernAPI(apiName);
    if (!api || typeof api.availability !== "function") {
      return false;
    }

    const availabilityArgs: Record<string, any>[] = [];

    if (apiName === "translator") {
      availabilityArgs.push({
        sourceLanguage: preferences.sourceLanguage,
        targetLanguage: preferences.targetLanguage,
      });
    }

    const availability = await api.availability(...availabilityArgs);
    return isAvailable(availability);
  } catch (error) {
    console.warn(
      `[Glotian AI] Error checking ${apiName} availability (modern API):`,
      error,
    );
    return false;
  }
}

/**
 * Detect Chrome Built-in AI API availability
 *
 * Checks for:
 * - Translator API
 * - Summarizer API
 * - Prompt API (for Q&A and multimodal)
 * - Writer API (for CEFR simplification)
 * - Rewriter API (for tone adjustment)
 * - Proofreader API (for grammar checking)
 *
 * Returns AISupport object with boolean flags for each API
 */
export async function detectAISupport(
  overrides?: LanguagePreferenceOverrides,
): Promise<AISupport> {
  const support: AISupport = {
    translator: false,
    summarizer: false,
    prompt: false,
    writer: false,
    rewriter: false,
    proofreader: false,
  };

  try {
    // DO NOT use polyfill - Chrome Built-in AI only mode
    // ensureAIPolyfill(); // DISABLED - no server fallback

    // Debug: Check what's available
    console.log(
      "[Glotian AI] Checking Translator global:",
      typeof (globalThis as any)?.Translator,
    );
    console.log(
      "[Glotian AI] Checking LanguageModel global:",
      typeof (globalThis as any)?.LanguageModel,
    );
    console.log(
      "[Glotian AI] Checking chrome.ai:",
      typeof (globalThis as any)?.chrome?.ai,
    );

    const languagePreferences = await resolveLanguagePreferences(overrides);

    const modernStatus = await Promise.all(
      (Object.keys(MODERN_API_MAP) as Array<keyof AISupport>).map(
        async (key) => ({
          key,
          available: await checkModernAvailability(key, languagePreferences),
        }),
      ),
    );

    for (const { key, available } of modernStatus) {
      if (available) {
        support[key] = true;
        console.log(`[Glotian AI] ${key} API (modern): available`);
      }
    }

    const aiHandle = getAIHandle() as Record<string, unknown> | undefined;
    if (!aiHandle) {
      console.log(
        "[Glotian AI] chrome.ai handle not found (modern namespaces likely in use)",
      );
      return support;
    }

    console.log(
      "[Glotian AI] Detecting Chrome Built-in AI capabilities (legacy handle)",
    );
    console.log("[Glotian AI] aiHandle keys:", Object.keys(aiHandle));

    const ai = aiHandle as Record<string, any>;

    if (!support.translator && "translator" in ai) {
      try {
        const capabilities = await ai.translator.capabilities();
        support.translator = isAvailable(capabilities);
        console.log(
          "[Glotian AI] Translator API (legacy):",
          support.translator ? "available" : "unavailable",
        );
      } catch (error) {
        console.warn(
          "[Glotian AI] Error checking Translator API (legacy):",
          error,
        );
      }
    }

    if (!support.summarizer && "summarizer" in ai) {
      try {
        const capabilities = await ai.summarizer.capabilities();
        support.summarizer = isAvailable(capabilities);
        console.log(
          "[Glotian AI] Summarizer API (legacy):",
          support.summarizer ? "available" : "unavailable",
        );
      } catch (error) {
        console.warn(
          "[Glotian AI] Error checking Summarizer API (legacy):",
          error,
        );
      }
    }

    if (!support.prompt && "languageModel" in ai) {
      try {
        const capabilities = await ai.languageModel.capabilities();
        support.prompt = isAvailable(capabilities);
        console.log(
          "[Glotian AI] Prompt API (legacy):",
          support.prompt ? "available" : "unavailable",
        );
      } catch (error) {
        console.warn("[Glotian AI] Error checking Prompt API (legacy):", error);
      }
    }

    if (!support.writer && "writer" in ai) {
      try {
        const capabilities = await ai.writer.capabilities();
        support.writer = isAvailable(capabilities);
        console.log(
          "[Glotian AI] Writer API (legacy):",
          support.writer ? "available" : "unavailable",
        );
      } catch (error) {
        console.warn("[Glotian AI] Error checking Writer API (legacy):", error);
      }
    }

    if (!support.rewriter && "rewriter" in ai) {
      try {
        const capabilities = await ai.rewriter.capabilities();
        support.rewriter = isAvailable(capabilities);
        console.log(
          "[Glotian AI] Rewriter API (legacy):",
          support.rewriter ? "available" : "unavailable",
        );
      } catch (error) {
        console.warn(
          "[Glotian AI] Error checking Rewriter API (legacy):",
          error,
        );
      }
    }

    if (!support.proofreader && "proofreader" in ai) {
      try {
        const capabilities = await ai.proofreader.capabilities();
        support.proofreader = isAvailable(capabilities);
        console.log(
          "[Glotian AI] Proofreader API (legacy):",
          support.proofreader ? "available" : "unavailable",
        );
      } catch (error) {
        console.warn(
          "[Glotian AI] Error checking Proofreader API (legacy):",
          error,
        );
      }
    }
  } catch (error) {
    console.error("[Glotian AI] Error detecting AI support:", error);
  }

  return support;
}

/**
 * Check if a specific AI API is available
 */
export async function isAPIAvailable(
  apiName: keyof AISupport,
  overrides?: LanguagePreferenceOverrides,
): Promise<boolean> {
  try {
    // DO NOT use polyfill - Chrome Built-in AI only mode
    // ensureAIPolyfill(); // DISABLED - no server fallback

    const languagePreferences = await resolveLanguagePreferences(overrides);

    if (await checkModernAvailability(apiName, languagePreferences)) {
      return true;
    }

    const aiHandle = getAIHandle() as Record<string, any> | undefined;
    if (!aiHandle) {
      return false;
    }

    if (!(apiName in aiHandle)) {
      return false;
    }

    const capabilities = await aiHandle[apiName].capabilities();
    return isAvailable(capabilities);
  } catch (error) {
    console.warn(`[Glotian AI] Error checking ${apiName} API:`, error);
    return false;
  }
}

/**
 * Wait for AI model download to complete
 * Some Chrome AI APIs require model download before use
 */
export async function waitForModelDownload(
  apiName: keyof AISupport,
  maxWaitMs: number = 60000,
  overrides?: LanguagePreferenceOverrides,
): Promise<boolean> {
  const startTime = Date.now();
  const languagePreferences = await resolveLanguagePreferences(overrides);

  while (Date.now() - startTime < maxWaitMs) {
    try {
      // DO NOT use polyfill - Chrome Built-in AI only mode
      // ensureAIPolyfill(); // DISABLED - no server fallback

      const modernApi = getModernAPI(apiName);
      if (modernApi && typeof modernApi.availability === "function") {
        const availabilityArgs: Record<string, any>[] = [];

        if (apiName === "translator") {
          availabilityArgs.push({
            sourceLanguage: languagePreferences.sourceLanguage,
            targetLanguage: languagePreferences.targetLanguage,
          });
        }

        const availability = await modernApi.availability(...availabilityArgs);
        const state = normalizeAvailability(availability);
        if (state === "readily" || state === "available") {
          console.log(`[Glotian AI] ${apiName} model is ready (modern)`);
          return true;
        }

        if (state === "after-download") {
          console.log(`[Glotian AI] ${apiName} model is downloading (modern)`);
          await sleep(5000);
          continue;
        }
      }

      const aiHandle = getAIHandle() as Record<string, any> | undefined;
      if (!aiHandle) {
        await sleep(1000);
        continue;
      }

      if (!(apiName in aiHandle)) {
        await sleep(1000);
        continue;
      }

      const capabilities = await aiHandle[apiName].capabilities();
      const state = normalizeAvailability(capabilities);
      if (state === "readily" || state === "available") {
        console.log(`[Glotian AI] ${apiName} model is ready (legacy)`);
        return true;
      }

      if (state === "after-download") {
        console.log(`[Glotian AI] ${apiName} model is downloading...`);
        await sleep(5000); // Check every 5 seconds during download
        continue;
      }

      if (!isAvailable(capabilities)) {
        console.warn(`[Glotian AI] ${apiName} model is not available`);
        return false;
      }
    } catch (error) {
      console.warn(
        `[Glotian AI] Error checking ${apiName} model status:`,
        error,
      );
    }

    await sleep(1000);
  }

  console.warn(
    `[Glotian AI] ${apiName} model download timeout after ${maxWaitMs}ms`,
  );
  return false;
}

/**
 * Get cached AI support status from chrome.storage
 */
export async function getAISupport(): Promise<AISupport> {
  try {
    const result = await chrome.storage.local.get("aiSupport");
    if (result.aiSupport) {
      return result.aiSupport as AISupport;
    }
  } catch (error) {
    console.warn("[Glotian AI] Error reading cached AI support:", error);
  }

  // If no cached value, detect and cache
  const support = await detectAISupport();
  try {
    await chrome.storage.local.set({ aiSupport: support });
  } catch (error) {
    console.warn("[Glotian AI] Error caching AI support:", error);
  }
  return support;
}

/**
 * Helper function to sleep
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
