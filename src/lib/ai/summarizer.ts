/**
 * Chrome Summarizer API wrapper
 *
 * Implements SummarizeRequest/Response contracts from ai-api.md
 */

import type { CEFRLevel } from "@/types";
import { isAPIAvailable } from "./detect";
import { getAIHandle, getModernAIGlobal } from "./env";
import { ensureAIPolyfill } from "./polyfill";

export interface SummarizeRequest {
  pageContent: string;
  pageUrl: string;
  pageTitle: string;
  cefrLevel: CEFRLevel;
  sourceLanguage: string;
  targetLanguage: string;
}

export interface SummarizeResponse {
  originalText: string;
  summary: string;
  simplifiedSummary?: string;
  translation?: string;
  cefrLevel?: CEFRLevel;
  processingTime: number;
  aiSource: "chrome" | "openai";
}

function getSummarizerHandle(): {
  create: Function;
  capabilities?: Function;
  availability?: Function;
} | null {
  const modern = getModernAIGlobal<any>("Summarizer");
  if (modern && typeof modern.create === "function") {
    return modern;
  }

  const aiHandle = getAIHandle() as { summarizer?: any } | undefined;
  if (aiHandle?.summarizer) {
    return aiHandle.summarizer;
  }

  ensureAIPolyfill();
  const fallbackHandle = getAIHandle() as { summarizer?: any } | undefined;
  return fallbackHandle?.summarizer ?? null;
}

type SummarizerCreateOptions = {
  type?: "tldr" | "key-points" | "teaser" | "headline";
  format?: "plain-text" | "markdown";
  length?: "short" | "medium" | "long";
  expectedInputLanguages?: string[];
  expectedContextLanguages?: string[];
  outputLanguage?: string;
  sharedContext?: string;
};

type SummarizerRunOptions = {
  context?: string;
};

function describeChromeAIError(context: string, error: unknown): Error {
  if (error instanceof Error) {
    const parts = [];
    if (error.name && error.name !== "Error") {
      parts.push(error.name);
    }
    if (error.message) {
      parts.push(error.message);
    }
    const detail = parts.join(": ").trim();
    return new Error(
      detail ? `${context}: ${detail}` : `${context}: Unknown Chrome AI error`,
    );
  }

  return new Error(`${context}: ${String(error ?? "Unknown error")}`);
}

/**
 * Internal function to summarize content using Chrome Summarizer API
 * Returns plain string summary
 */
async function summarizeWithChromeAIInternal(
  pageContent: string,
  createOptions: SummarizerCreateOptions = {},
  runOptions: SummarizerRunOptions = {},
): Promise<string> {
  console.log("[Glotian Summarizer] Summarizing with Chrome AI");

  try {
    // Check if Summarizer API is available via isAPIAvailable
    const available = await isAPIAvailable("summarizer");
    if (!available) {
      throw new Error("Summarizer API not available");
    }

    const summarizerHandle = getSummarizerHandle();
    if (!summarizerHandle) {
      throw new Error("Summarizer API not properly available");
    }

    // Create summarizer instance
    const summarizer = await summarizerHandle.create({
      type: createOptions.type || "tldr",
      format: createOptions.format || "plain-text",
      length: createOptions.length || "medium",
      expectedInputLanguages: createOptions.expectedInputLanguages,
      expectedContextLanguages: createOptions.expectedContextLanguages,
      outputLanguage: createOptions.outputLanguage,
      sharedContext: createOptions.sharedContext,
    });

    // Perform summarization
    const summary = await summarizer.summarize(pageContent, runOptions);

    // Clean up the summarizer instance
    summarizer.destroy?.();

    console.log(
      "[Glotian Summarizer] Summarization successful:",
      summary.length,
      "chars",
    );

    return summary;
  } catch (error) {
    console.error("[Glotian Summarizer] Error:", error);
    throw describeChromeAIError("Summarizer API", error);
  }
}

/**
 * Public wrapper: Summarize page content using Chrome Built-in AI Summarizer API
 * Kept for backward compatibility
 */
export async function summarizeWithChromeAI(
  pageContent: string,
  createOptions?: SummarizerCreateOptions,
  runOptions?: SummarizerRunOptions,
): Promise<string> {
  return summarizeWithChromeAIInternal(pageContent, createOptions, runOptions);
}

/**
 * Chunk long content into manageable pieces
 */
export function chunkContent(
  content: string,
  maxChunkSize: number = 5000,
): string[] {
  const chunks: string[] = [];
  const paragraphs = content.split("\n\n");
  let currentChunk = "";

  for (const para of paragraphs) {
    if (currentChunk.length + para.length > maxChunkSize) {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
      }
      // Handle oversized paragraphs
      if (para.length > maxChunkSize) {
        // Split large paragraph by characters if needed
        for (let i = 0; i < para.length; i += maxChunkSize) {
          chunks.push(para.slice(i, i + maxChunkSize).trim());
        }
        currentChunk = "";
      } else {
        currentChunk = para;
      }
    } else {
      currentChunk += (currentChunk ? "\n\n" : "") + para;
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

/**
 * Summarize long content by chunking
 */
export async function summarizeLongContent(
  pageContent: string,
  createOptions?: SummarizerCreateOptions,
  runOptions?: SummarizerRunOptions,
): Promise<string> {
  console.log(
    "[Glotian Summarizer] Content length:",
    pageContent.length,
    "chars",
  );

  // Get actual API capabilities
  const capabilities = await getSummarizerCapabilities();
  const maxInputLength = capabilities.maxInputLength || 20000;
  const chunkSize = Math.floor(maxInputLength / 4); // Safety factor: 1/4 of max

  // If content is short enough, summarize directly
  if (pageContent.length <= maxInputLength) {
    return summarizeWithChromeAIInternal(
      pageContent,
      createOptions,
      runOptions,
    );
  }

  console.log(
    "[Glotian Summarizer] Chunking long content (maxInputLength:",
    maxInputLength,
    "chunkSize:",
    chunkSize,
    ")",
  );

  // Chunk content into smaller pieces using dynamic chunk size
  const chunks = chunkContent(pageContent, chunkSize);
  console.log("[Glotian Summarizer] Created", chunks.length, "chunks");

  // Summarize each chunk
  const chunkSummaries: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    console.log(
      `[Glotian Summarizer] Summarizing chunk ${i + 1}/${chunks.length}`,
    );
    const chunk = chunks[i];
    if (!chunk) {
      continue;
    }

    const summary = await summarizeWithChromeAIInternal(
      chunk,
      {
        ...createOptions,
        length: "short", // Use short summaries for chunks
      },
      runOptions,
    );
    chunkSummaries.push(summary);
  }

  // If we have many chunk summaries, summarize them again
  const combinedSummaries = chunkSummaries.join("\n\n");
  if (combinedSummaries.length > 5000) {
    console.log(
      "[Glotian Summarizer] Summarizing chunk summaries (meta-summarization)",
    );
    return summarizeWithChromeAIInternal(
      combinedSummaries,
      createOptions,
      runOptions,
    );
  }

  return combinedSummaries;
}

/**
 * Get available summarizer capabilities
 */
export async function getSummarizerCapabilities(): Promise<{
  available: boolean;
  supportsStreaming: boolean;
  maxInputLength: number;
}> {
  const resolveAvailability = (value: unknown): string => {
    if (typeof value === "string") {
      return value;
    }

    if (value && typeof value === "object") {
      const record = value as Record<string, unknown>;
      if (typeof record.available === "string") {
        return record.available;
      }
      if (typeof record.status === "string") {
        return record.status;
      }
    }

    return "no";
  };

  try {
    const summarizerHandle = getSummarizerHandle();
    if (!summarizerHandle) {
      return {
        available: false,
        supportsStreaming: false,
        maxInputLength: 0,
      };
    }

    if (typeof summarizerHandle.capabilities === "function") {
      const capabilities = await summarizerHandle.capabilities();
      const availabilityState = resolveAvailability(capabilities);
      const maxInputLength =
        (capabilities && typeof capabilities.maxInputLength === "number"
          ? capabilities.maxInputLength
          : typeof capabilities.maxInputCharacters === "number"
            ? capabilities.maxInputCharacters
            : typeof capabilities.maxInputTokens === "number"
              ? capabilities.maxInputTokens
              : 20000) ?? 20000;

      return {
        available:
          availabilityState !== "no" && availabilityState !== "unavailable",
        supportsStreaming:
          Boolean(
            (capabilities as Record<string, unknown>)?.supportsStreaming,
          ) || false,
        maxInputLength,
      };
    }

    if (typeof summarizerHandle.availability === "function") {
      const availability = await summarizerHandle.availability();
      const availabilityState = resolveAvailability(availability);
      return {
        available:
          availabilityState !== "no" && availabilityState !== "unavailable",
        supportsStreaming: false,
        maxInputLength: 20000,
      };
    }

    return {
      available: false,
      supportsStreaming: false,
      maxInputLength: 0,
    };
  } catch (error) {
    console.warn("[Glotian Summarizer] Error checking capabilities:", error);
    return {
      available: false,
      supportsStreaming: false,
      maxInputLength: 0,
    };
  }
}
