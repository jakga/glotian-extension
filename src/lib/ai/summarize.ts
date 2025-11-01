/**
 * Summarization helper (Chrome Built-in AI only)
 *
 * Produces a page summary using the Chrome Summarizer API.
 */

import {
  summarizeLongContent,
  type SummarizeRequest,
  type SummarizeResponse,
} from "./summarizer";
import { logError } from "@/lib/storage";

const SUPPORTED_SUMMARIZER_LANGS = new Set(["en", "es", "ja"]);

function resolveSummarizerLanguage(language?: string): string {
  if (!language) return "en";
  const lower = language.toLowerCase();
  if (SUPPORTED_SUMMARIZER_LANGS.has(lower)) {
    return lower;
  }
  const base = lower.split(/[-_]/)[0] ?? lower;
  if (SUPPORTED_SUMMARIZER_LANGS.has(base)) {
    return base;
  }
  return "en";
}

function formatChromeAIError(context: string, error: unknown): Error {
  if (error instanceof Error) {
    const message = (error.message || error.name || "Unknown error").trim();
    return new Error(`${context}: ${message}`);
  }
  return new Error(`${context}: ${String(error ?? "Unknown error")}`);
}

/**
 * Full summarization pipeline using Chrome Built-in AI only
 */
export async function summarizePageWithFallback(
  request: SummarizeRequest,
): Promise<SummarizeResponse> {
  console.log(
    "[Glotian Summarize] Starting summarization pipeline:",
    request.pageTitle,
  );

  const startTime = performance.now();

  try {
    const createOptions = {
      type: "tldr" as const,
      format: "plain-text" as const,
      length: "medium" as const,
      expectedInputLanguages: [
        resolveSummarizerLanguage(request.sourceLanguage),
      ],
      expectedContextLanguages: [
        resolveSummarizerLanguage(request.sourceLanguage),
      ],
      outputLanguage: resolveSummarizerLanguage(request.sourceLanguage),
      sharedContext: `Summarize the main ideas from ${request.pageUrl}`,
    };

    const runOptions = {
      context: `Audience reading level: CEFR ${request.cefrLevel}. Provide a neutral overview suitable for language learners.`,
    };

    // Step 1: Summarize original content
    console.log("[Glotian Summarize] Step 1: Summarizing content...");
    const summary = await summarizeLongContent(
      request.pageContent,
      createOptions,
      runOptions,
    ).catch((error) => {
      throw formatChromeAIError(
        "Summarizer API failed to summarize page content",
        error,
      );
    });

    const processingTime = performance.now() - startTime;

    console.log(
      "[Glotian Summarize] Pipeline complete in",
      processingTime.toFixed(0),
      "ms (AI providers: summarizer=chrome)",
    );

    return {
      originalText: request.pageContent.substring(0, 20000), // Truncate for storage
      summary,
      processingTime,
      aiSource: "chrome",
    };
  } catch (error) {
    console.error("[Glotian Summarize] Pipeline error:", error);
    await logError("summarizePageWithFallback", error as Error, {
      request,
    });
    throw error;
  }
}

/**
 * Timeout wrapper for summarization
 */
export async function summarizeWithTimeout(
  request: SummarizeRequest,
  timeoutMs: number = 45000,
): Promise<SummarizeResponse> {
  const estimatedProcessing = estimateProcessingTime(
    request.pageContent.length,
  );
  const effectiveTimeout = Math.max(timeoutMs, estimatedProcessing + 30000);

  let timer: ReturnType<typeof setTimeout> | null = null;

  const timeoutPromise = new Promise<SummarizeResponse>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error("Summarization timeout")),
      effectiveTimeout,
    );
  });

  try {
    const result = await Promise.race([
      summarizePageWithFallback(request),
      timeoutPromise,
    ]);
    return result;
  } finally {
    if (timer !== null) {
      clearTimeout(timer);
    }
  }
}

/**
 * Validate page content before summarization
 */
export function validatePageContent(content: string): {
  valid: boolean;
  error?: string;
} {
  if (!content || content.trim().length === 0) {
    return { valid: false, error: "Content is empty" };
  }

  if (content.length < 100) {
    return {
      valid: false,
      error: "Content too short for summarization (min 100 chars)",
    };
  }

  // Check if content is mostly just navigation/menu items
  const words = content.split(/\s+/);
  if (words.length < 50) {
    return {
      valid: false,
      error: "Content too sparse (min 50 words required)",
    };
  }

  return { valid: true };
}

/**
 * Estimate summarization processing time
 */
export function estimateProcessingTime(contentLength: number): number {
  // Base time: 1s
  // + 0.5s per 1000 chars
  // + chunking overhead if > 20k chars
  const baseTime = 1000;
  const perKCharTime = 500;
  const chunkingOverhead = contentLength > 20000 ? 2000 : 0;

  return baseTime + (contentLength / 1000) * perKCharTime + chunkingOverhead;
}
