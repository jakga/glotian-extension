/**
 * Chrome Built-in Rewriter API wrapper
 * Rewrites text with different tones and lengths
 *
 * @see specs/003-glotian-chrome-extension/contracts/ai-api.md
 */

import type { RewriteResponse } from "./types";
import { ensureAIPolyfill } from "./polyfill";
import { getAIHandle, getModernAIGlobal } from "./env";

export type { RewriteResponse } from "./types";

export interface RewriteRequest {
  text: string; // Text to rewrite (max 1000 chars)
  tone?: "formal" | "casual" | "neutral"; // Target tone
  length?: "shorter" | "longer" | "as-is"; // Target length
  language: string; // ISO 639-1 code
  context?: string; // Optional context
}

export class RewriteError extends Error {
  constructor(
    message: string,
    public code: string,
    public retryable: boolean = false,
  ) {
    super(message);
    this.name = "RewriteError";
  }
}

function getRewriterHandle(): {
  create: Function;
  capabilities?: Function;
} | null {
  const modern = getModernAIGlobal<any>("Rewriter");
  if (modern && typeof modern.create === "function") {
    return modern;
  }

  const aiHandle = getAIHandle() as { rewriter?: any } | undefined;
  if (aiHandle?.rewriter) {
    return aiHandle.rewriter;
  }

  ensureAIPolyfill();
  const fallbackHandle = getAIHandle() as { rewriter?: any } | undefined;
  return fallbackHandle?.rewriter ?? null;
}

/**
 * Check if Chrome Rewriter API is available
 */
export async function isRewriterAvailable(): Promise<boolean> {
  try {
    const rewriterHandle = getRewriterHandle();
    if (!rewriterHandle) {
      return false;
    }

    // Try to check capabilities
    if (typeof rewriterHandle.capabilities === "function") {
      const capabilities = await rewriterHandle.capabilities();
      const availability =
        typeof capabilities?.available === "string"
          ? capabilities.available
          : typeof capabilities?.status === "string"
            ? capabilities.status
            : "no";
      return (
        availability === "readily" ||
        availability === "after-download" ||
        availability === "available"
      );
    }

    // Modern API exposes availability() instead of capabilities()
    if (
      typeof (rewriterHandle as Record<string, any>).availability === "function"
    ) {
      const availability = await (
        rewriterHandle as Record<string, any>
      ).availability();
      const state =
        typeof availability === "string"
          ? availability
          : typeof availability?.available === "string"
            ? availability.available
            : "no";
      return state !== "no" && state !== "unavailable";
    }

    return true;
  } catch (error) {
    console.warn("[Rewriter] Availability check failed:", error);
    return false;
  }
}

/**
 * Rewrite text using Chrome Built-in AI
 */
export async function rewriteWithChromeAI(
  request: RewriteRequest,
  options: { signal?: AbortSignal } = {},
): Promise<RewriteResponse> {
  const startTime = performance.now();
  const abortSignal = options.signal;
  const throwIfAborted = () => {
    if (abortSignal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
  };
  const rewriterHandle = getRewriterHandle();
  if (!rewriterHandle) {
    throw new RewriteError(
      "Rewriter API not available",
      "API_UNAVAILABLE",
      false,
    );
  }

  let rewriter: any = null;
  let abortHandler: (() => void) | null = null;
  let primaryRewrite: string | null = null;
  const alternatives: string[] = [];

  try {
    // Validate input
    if (!request.text || request.text.length === 0) {
      throw new RewriteError("Text is required", "EMPTY_TEXT", false);
    }

    if (request.text.length > 1000) {
      throw new RewriteError(
        "Text too long (max 1000 characters)",
        "TEXT_TOO_LONG",
        false,
      );
    }

    // Check if rewriter is available
    const available = await isRewriterAvailable();
    if (!available) {
      throw new RewriteError(
        "Rewriter API not available",
        "API_UNAVAILABLE",
        false,
      );
    }

    throwIfAborted();

    // Create rewriter session
    rewriter = await rewriterHandle.create({
      tone: request.tone || "neutral",
      length: request.length || "as-is",
      context: request.context || "",
    });

    if (abortSignal) {
      abortHandler = () => {
        if (!rewriter) return;
        try {
          const maybePromise = rewriter.destroy();
          if (maybePromise instanceof Promise) {
            maybePromise.catch((destroyError: unknown) => {
              console.warn(
                "[Rewriter] Error destroying session:",
                destroyError,
              );
            });
          }
        } catch (destroyError) {
          console.warn("[Rewriter] Error destroying session:", destroyError);
        } finally {
          rewriter = null;
        }
      };
      abortSignal.addEventListener("abort", abortHandler, { once: true });
      if (abortSignal.aborted) {
        abortHandler();
        throw new DOMException("Aborted", "AbortError");
      }
    }

    throwIfAborted();

    // Get primary rewrite
    primaryRewrite = await rewriter.rewrite(request.text);

    throwIfAborted();

    try {
      // Try to get 2 more alternatives with different parameters
      const alternativeTones = ["formal", "casual"].filter(
        (t) => t !== request.tone,
      );

      for (const altTone of alternativeTones.slice(0, 2)) {
        throwIfAborted();

        const altRewriter = await rewriterHandle.create({
          tone: altTone,
          length: request.length || "as-is",
          context: request.context || "",
        });

        try {
          throwIfAborted();
          const altRewrite = await altRewriter.rewrite(request.text);
          throwIfAborted();
          if (altRewrite && altRewrite !== primaryRewrite) {
            alternatives.push(altRewrite);
          }
        } catch (error) {
          console.warn("[Rewriter] Alternative generation failed:", error);
        } finally {
          try {
            await altRewriter.destroy();
          } catch (destroyError) {
            console.warn(
              "[Rewriter] Error destroying alternative session:",
              destroyError,
            );
          }
        }
      }
    } catch (error) {
      console.warn("[Rewriter] Failed to generate alternatives:", error);
    }

    if (!primaryRewrite) {
      throw new RewriteError("Failed to generate rewrite", "NO_RESULT", true);
    }

    // Extract learning expressions (compare original with rewritten)
    const learningExpressions = extractLearningExpressions(
      request.text,
      primaryRewrite,
    );

    const processingTime = performance.now() - startTime;

    console.log(
      `[Rewriter] Generated ${1 + alternatives.length} versions in ${processingTime.toFixed(0)}ms (Chrome AI)`,
    );

    return {
      rewrittenText: primaryRewrite,
      alternatives,
      learningExpressions,
      processingTime,
      aiSource: "chrome",
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      console.warn("[Rewriter] Rewrite aborted");
      throw error;
    }

    console.error("[Rewriter] Chrome AI rewrite failed:", error);

    if (error instanceof RewriteError) {
      throw error;
    }

    // Convert generic errors to RewriteError
    if (
      error instanceof Error &&
      (error.message.includes("quota") || error.message.includes("rate limit"))
    ) {
      throw new RewriteError("Rate limit exceeded", "QUOTA_EXCEEDED", true);
    }

    if (
      error instanceof Error &&
      (error.message.includes("not available") ||
        error.message.includes("not supported"))
    ) {
      throw new RewriteError(
        "Rewriter API not available",
        "API_UNAVAILABLE",
        false,
      );
    }

    throw new RewriteError("Unknown rewriting error", "UNKNOWN_ERROR", true);
  } finally {
    if (abortSignal && abortHandler) {
      abortSignal.removeEventListener("abort", abortHandler);
    }
    if (rewriter) {
      try {
        await rewriter.destroy();
      } catch (destroyError) {
        console.warn("[Rewriter] Error destroying session:", destroyError);
      }
    }
  }
}

/**
 * Extract learning expressions by comparing original and rewritten text
 * Identifies phrases that were improved
 */
function extractLearningExpressions(
  original: string,
  rewritten: string,
): Array<{ original: string; rewritten: string; explanation: string }> {
  const expressions: Array<{
    original: string;
    rewritten: string;
    explanation: string;
  }> = [];

  // Simple heuristic: split by sentences and find significant changes
  const originalSentences = original.split(/[.!?]+/).filter((s) => s.trim());
  const rewrittenSentences = rewritten.split(/[.!?]+/).filter((s) => s.trim());

  for (
    let i = 0;
    i < Math.min(originalSentences.length, rewrittenSentences.length);
    i++
  ) {
    const origSent = originalSentences[i]?.trim() || "";
    const rewrSent = rewrittenSentences[i]?.trim() || "";

    // If sentences are significantly different, mark as learning expression
    if (origSent !== rewrSent && levenshteinDistance(origSent, rewrSent) > 10) {
      expressions.push({
        original: origSent,
        rewritten: rewrSent,
        explanation: "More natural phrasing", // Generic explanation
      });
    }
  }

  // Limit to top 5 expressions
  return expressions.slice(0, 5);
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0]![j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i]![j] = matrix[i - 1]?.[j - 1] ?? 0;
      } else {
        matrix[i]![j] = Math.min(
          (matrix[i - 1]?.[j - 1] ?? 0) + 1, // substitution
          (matrix[i]?.[j - 1] ?? 0) + 1, // insertion
          (matrix[i - 1]?.[j] ?? 0) + 1, // deletion
        );
      }
    }
  }

  return matrix[b.length]?.[a.length] ?? 0;
}

/**
 * Rewrite text with timeout
 */
export async function rewriteWithTimeout(
  request: RewriteRequest,
  timeoutMs: number = 10000,
): Promise<RewriteResponse> {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  try {
    timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    return await rewriteWithChromeAI(request, { signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new RewriteError("Rewriting timeout", "TIMEOUT", true);
    }
    throw error;
  } finally {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
  }
}
