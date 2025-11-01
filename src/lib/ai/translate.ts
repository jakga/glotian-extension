/**
 * Translation orchestrator (Chrome Built-in AI only)
 */

import type { TranslateRequest, TranslateResponse } from "@/types";
import { getSetting, updateAISupport } from "@/lib/storage";
import {
  ensureSupportedSourceLanguage,
  ensureSupportedTargetLanguage,
  getDefaultLanguagePreferences,
  coerceNonAutoLanguage,
  type SupportedLanguage,
  type NonAutoLanguage,
} from "@/lib/language";
import { translateWithChromeAI, detectLanguage } from "./translator";
import { detectAISupport } from "./detect";

/**
 * Translate text using Chrome's on-device models only.
 * Surfaces actionable errors when the native Translator API is unavailable.
 */
export async function translate(
  request: TranslateRequest,
): Promise<TranslateResponse> {
  console.log(
    "[Glotian Translate] Starting translation:",
    request.sourceLang,
    "→",
    request.targetLang,
  );

  const startTime = Date.now();
  const defaults = getDefaultLanguagePreferences();

  let resolvedSourceLanguage: SupportedLanguage = ensureSupportedSourceLanguage(
    request.sourceLang,
    defaults.sourceLanguage,
  );
  const resolvedTargetLanguage: NonAutoLanguage = ensureSupportedTargetLanguage(
    request.targetLang,
    defaults.targetLanguage,
  );

  let detectedSourceLanguage: SupportedLanguage | undefined;

  if (resolvedSourceLanguage === "auto") {
    try {
      const detected = await detectLanguage(request.text);
      if (detected) {
        const normalizedDetected = ensureSupportedSourceLanguage(detected, "en");
        resolvedSourceLanguage = coerceNonAutoLanguage(
          normalizedDetected,
          "en",
        );
        detectedSourceLanguage = resolvedSourceLanguage;
      } else {
        resolvedSourceLanguage = "en";
      }
    } catch (error) {
      console.warn(
        "[Glotian Translate] Language detection failed, falling back to English:",
        error,
      );
      resolvedSourceLanguage = "en";
    }
  }

  console.log(
    "[Glotian Translate] Resolved languages:",
    resolvedSourceLanguage,
    "→",
    resolvedTargetLanguage,
  );

  // CHROME BUILT-IN AI ONLY MODE - No fallback to server APIs
  const chromeAIEnabled = await getSetting("chromeAIEnabled");
  const aiSupport = await detectAISupport({
    sourceLanguage: resolvedSourceLanguage,
    targetLanguage: resolvedTargetLanguage,
  });
  try {
    await updateAISupport(aiSupport);
  } catch (error) {
    console.warn("[Glotian Translate] Failed to cache AI support:", error);
  }

  if (!chromeAIEnabled) {
    throw new Error(
      "Translation unavailable: Chrome Built-in AI is disabled in settings",
    );
  }

  if (!aiSupport.translator) {
    throw new Error(
      "Translation unavailable: Chrome Built-in AI Translator is not available. Open chrome://on-device-internals to check the on-device translation model status and ensure Chrome Built-in AI is enabled.",
    );
  }

  try {
    console.log(
      "🔵 [Glotian AI] Using Chrome Built-in AI (on-device translation only - no fallback)",
    );
    const result = await translateWithChromeAI({
      ...request,
      sourceLang: resolvedSourceLanguage,
      targetLang: resolvedTargetLanguage,
    });
    const duration = Date.now() - startTime;
    console.log(
      `✅ [Glotian AI] Chrome Built-in AI translation completed in ${duration}ms`,
    );
    return {
      ...result,
      detectedLanguage:
        result.detectedLanguage ??
        detectedSourceLanguage ??
        resolvedSourceLanguage,
    };
  } catch (error) {
    console.error(
      "❌ [Glotian AI] Chrome Built-in AI failed (no fallback available):",
      error,
    );
    throw new Error(
      `Chrome Built-in AI translation failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
