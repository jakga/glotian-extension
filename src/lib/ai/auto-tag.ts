/**
 * Auto-tagging using Chrome Prompt API
 *
 * Generates tags, keywords, and CEFR level detection
 */

import type { AutoTagRequest, AutoTagResponse } from "@/types";
import { isAPIAvailable } from "./detect";
import { autoTagWithFallback } from "./auto-tag-fallback";
import { ensureAIPolyfill } from "./polyfill";
import { getAIHandle, getModernAIGlobal } from "./env";

/**
 * Generate tags using Chrome Prompt API
 */
export async function autoTag(
  request: AutoTagRequest,
): Promise<AutoTagResponse> {
  if (import.meta.env.DEV) {
    console.log(
      "[Glotian Auto-Tag] Generating tags for text (length: " +
        request.text.length +
        " chars)",
    );
  }

  try {
    // Check if Prompt API is available
    const available = await isAPIAvailable("prompt");
    if (!available) {
      console.log(
        "[Glotian Auto-Tag] Prompt API not available, using fallback",
      );
      return autoTagWithFallback(request);
    }

    let languageModel: any | null = null;
    const modern = getModernAIGlobal<any>("LanguageModel");
    if (modern && typeof modern.create === "function") {
      languageModel = modern;
    } else {
      const aiHandle = getAIHandle() as { languageModel?: any } | undefined;
      if (aiHandle?.languageModel) {
        languageModel = aiHandle.languageModel;
      } else {
        ensureAIPolyfill();
        const fallbackHandle = getAIHandle() as
          | { languageModel?: any }
          | undefined;
        languageModel = fallbackHandle?.languageModel ?? null;
      }
    }

    if (!languageModel) {
      console.log(
        "[Glotian Auto-Tag] Language model not found, using fallback",
      );
      return autoTagWithFallback(request);
    }

    // Create language model session with AbortController for cleanup
    const abortController = new AbortController();
    let session;
    try {
      session = await languageModel.create({
        temperature: 0.7,
        topK: 3,
      });

      // Sanitize and limit text length
      const sanitizedText = request.text
        .replace(/"/g, '\\"')
        .substring(0, 5000); // Add reasonable length limit

      // Create prompt for structured output
      const prompt = `Analyze the following ${request.language} text and provide:
1. 3-5 relevant tags (single words, lowercase, no spaces)
2. 3-5 key vocabulary words or phrases
3. CEFR level (A1, A2, B1, B2, C1, or C2)

Text: "${sanitizedText}"

Respond ONLY in this JSON format (no markdown, no extra text):
{
  "tags": ["tag1", "tag2", "tag3"],
  "keywords": ["keyword1", "keyword2", "keyword3"],
  "cefrLevel": "B1",
  "domain": "general"
}`;

      const response = await session.prompt(prompt);

      try {
        const jsonMatch = response.match(/\{[\s\S]*?\}/); // Non-greedy
        if (!jsonMatch) {
          throw new Error("No JSON found in response");
        }
        const result = JSON.parse(jsonMatch[0]);

        // Validate schema
        if (
          !result.tags ||
          !Array.isArray(result.tags) ||
          !result.keywords ||
          !Array.isArray(result.keywords) ||
          !result.cefrLevel ||
          !result.domain
        ) {
          throw new Error("Invalid response schema");
        }

        if (import.meta.env.DEV) {
          console.log("[Glotian Auto-Tag] Tags generated successfully");
        }
        return result;
      } catch (parseError) {
        console.warn(
          "[Glotian Auto-Tag] Failed to parse JSON, using fallback:",
          parseError,
        );
        return autoTagWithFallback(request);
      }
    } finally {
      // Ensure session cleanup
      if (session && typeof session.destroy === "function") {
        try {
          session.destroy();
        } catch (e) {
          console.warn("[Glotian Auto-Tag] Error cleaning up session:", e);
        }
      }
      abortController.abort();
    }
  } catch (error) {
    console.error("[Glotian Auto-Tag] Error:", error);
    return autoTagWithFallback(request);
  }
}
