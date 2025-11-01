/**
 * Chrome Translator API wrapper
 *
 * Implements TranslateRequest/Response contracts from ai-api.md
 */

import type { TranslateRequest, TranslateResponse } from "@/types";
import type { SupportedLanguage } from "@/lib/language";
import { isAPIAvailable } from "./detect";
import { getAIHandle } from "./env";

function getModernTranslator(): Record<string, any> | undefined {
  if (typeof globalThis === "undefined") {
    return undefined;
  }

  const scope = globalThis as Record<string, any>;
  const translator = scope?.Translator;
  return typeof translator === "object" || typeof translator === "function"
    ? translator
    : undefined;
}

function getModernLanguageDetector(): Record<string, any> | undefined {
  if (typeof globalThis === "undefined") {
    return undefined;
  }

  const scope = globalThis as Record<string, any>;
  const detector = scope?.LanguageDetector;
  return typeof detector === "object" || typeof detector === "function"
    ? detector
    : undefined;
}

function extractTranslatedText(result: unknown): {
  text: string | null;
  detectedLanguage?: string;
} {
  if (typeof result === "string") {
    return { text: result };
  }

  if (result && typeof result === "object") {
    const record = result as Record<string, unknown>;
    const candidate =
      record.translatedText ??
      record.translation ??
      record.text ??
      record.output ??
      record.result;

    const detectedLanguage =
      typeof record.detectedLanguage === "string"
        ? record.detectedLanguage
        : typeof record.sourceLanguage === "string"
          ? (record.sourceLanguage as string)
          : undefined;

    if (typeof candidate === "string") {
      return { text: candidate, detectedLanguage };
    }
  }

  return { text: null };
}

async function safeDestroy(resource: any): Promise<void> {
  if (!resource || typeof resource !== "object") {
    return;
  }

  const cleanup =
    resource.destroy ?? resource.dispose ?? resource.close ?? resource.release;

  if (typeof cleanup === "function") {
    try {
      await cleanup.call(resource);
    } catch (error) {
      console.warn("[Glotian Translator] Error during cleanup:", error);
    }
  }
}

/**
 * Translate text using Chrome Built-in AI Translator API
 */
export async function translateWithChromeAI(
  request: TranslateRequest,
): Promise<TranslateResponse> {
  console.log(
    "[Glotian Translator] Translating with Chrome AI:",
    request.sourceLang,
    "→",
    request.targetLang,
  );

  try {
    // Check if Translator API is available
    const available = await isAPIAvailable("translator", {
      sourceLanguage: request.sourceLang as SupportedLanguage,
      targetLanguage: request.targetLang as SupportedLanguage,
    });
    if (!available) {
      throw new Error("Translator API not available");
    }

    const modernTranslator = getModernTranslator();
    if (modernTranslator && typeof modernTranslator.create === "function") {
      const translator = await modernTranslator.create({
        sourceLanguage: request.sourceLang as any,
        targetLanguage: request.targetLang as any,
      });

      try {
        const rawResult = await translator.translate(request.text);
        const { text, detectedLanguage } = extractTranslatedText(rawResult);

        if (!text) {
          throw new Error("Translator returned empty result");
        }

        console.log("[Glotian Translator] Translation successful (modern)");

        return {
          translatedText: text,
          detectedLanguage,
          confidence: 1.0,
        };
      } finally {
        await safeDestroy(translator);
      }
    }

    const ai = getAIHandle() as { translator?: any } | undefined;
    if (!ai || !ai.translator) {
      throw new Error(
        "Chrome Built-in AI Translator API not found. Visit chrome://on-device-internals to install the translation model and restart Chrome.",
      );
    }

    const translator = await ai.translator.create({
      sourceLanguage: request.sourceLang as any,
      targetLanguage: request.targetLang as any,
    });

    try {
      const rawResult = await translator.translate(request.text);
      const { text, detectedLanguage } = extractTranslatedText(rawResult);

      if (!text) {
        throw new Error("Translator returned empty result");
      }

      console.log("[Glotian Translator] Translation successful (legacy)");

      return {
        translatedText: text,
        detectedLanguage,
        confidence: 1.0,
      };
    } finally {
      await safeDestroy(translator);
    }
  } catch (error) {
    console.error("[Glotian Translator] Error:", error);
    throw error;
  }
}

/**
 * Detect language of text
 */
export async function detectLanguage(text: string): Promise<string | null> {
  try {
    const modernTranslator = getModernTranslator();
    if (
      modernTranslator &&
      typeof modernTranslator.createDetector === "function"
    ) {
      const detector = await modernTranslator.createDetector();
      try {
        const results = await detector.detect(text);

        if (Array.isArray(results) && results.length > 0) {
          const first = results[0] as Record<string, any>;
          const detected =
            typeof first?.detectedLanguage === "string"
              ? first.detectedLanguage
              : typeof first?.language === "string"
                ? first.language
                : undefined;
          if (detected) {
            return detected;
          }
        }
      } finally {
        await safeDestroy(detector);
      }
    }

    const languageDetector = getModernLanguageDetector();
    if (languageDetector && typeof languageDetector.create === "function") {
      const detector = await languageDetector.create();
      try {
        const results = await detector.detect(text);
        if (Array.isArray(results) && results.length > 0) {
          const first = results[0] as Record<string, any>;
          const detected =
            typeof first?.detectedLanguage === "string"
              ? first.detectedLanguage
              : typeof first?.language === "string"
                ? first.language
                : undefined;
          if (detected) {
            return detected;
          }
        }
      } finally {
        await safeDestroy(detector);
      }
    }

    const ai = getAIHandle() as { translator?: any } | undefined;
    if (!ai || !ai.translator) {
      return null;
    }

    const detector = await ai.translator.createDetector();
    try {
      const results = await detector.detect(text);

      if (results && results.length > 0) {
        return results[0].detectedLanguage;
      }
    } finally {
      await safeDestroy(detector);
    }

    return null;
  } catch (error) {
    console.error("[Glotian Translator] Language detection error:", error);
    return null;
  }
}
