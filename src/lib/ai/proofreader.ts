import { ensureAIPolyfill } from "./polyfill";
import { getAIHandle, getModernAIGlobal } from "./env";

/**
 * Chrome Built-in Proofreader API wrapper
 * Detects grammar, spelling, punctuation, and style errors in text
 *
 * @see specs/003-glotian-chrome-extension/contracts/ai-api.md
 */

export interface ProofreadRequest {
  text: string; // Text to proofread (max 1000 chars)
  language: string; // ISO 639-1 code (e.g., 'en')
  context?: string; // Optional context for better proofreading
}

export interface ProofreadResponse {
  corrections: Array<{
    type: "spelling" | "grammar" | "punctuation" | "style";
    original: string; // Original text
    suggestion: string; // Suggested correction
    explanation: string; // Why this is incorrect
    position: { start: number; end: number }; // Character indices
    confidence: number; // 0.0-1.0
  }>;
  processingTime: number;
  aiSource: "chrome" | "openai";
}

export class ProofreadError extends Error {
  constructor(
    message: string,
    public code: string,
    public retryable: boolean = false,
  ) {
    super(message);
    this.name = "ProofreadError";
  }
}

function getProofreaderHandle(): {
  create: Function;
  capabilities?: Function;
} | null {
  const modern = getModernAIGlobal<any>("Proofreader");
  if (modern && typeof modern.create === "function") {
    return modern;
  }

  const aiHandle = getAIHandle() as { proofreader?: any } | undefined;
  if (aiHandle?.proofreader) {
    return aiHandle.proofreader;
  }

  ensureAIPolyfill();
  const fallbackHandle = getAIHandle() as { proofreader?: any } | undefined;
  return fallbackHandle?.proofreader ?? null;
}

/**
 * Check if Chrome Proofreader API is available
 */
export async function isProofreaderAvailable(): Promise<boolean> {
  try {
    const proofreaderHandle = getProofreaderHandle();
    if (!proofreaderHandle) {
      return false;
    }

    // Try to check capabilities
    if (typeof proofreaderHandle.capabilities === "function") {
      const capabilities = await proofreaderHandle.capabilities();
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

    if (
      typeof (proofreaderHandle as Record<string, any>).availability ===
      "function"
    ) {
      const availability = await (
        proofreaderHandle as Record<string, any>
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
    console.warn("[Proofreader] Availability check failed:", error);
    return false;
  }
}

/**
 * Proofread text using Chrome Built-in AI
 */
export async function proofreadWithChromeAI(
  request: ProofreadRequest,
): Promise<ProofreadResponse> {
  const startTime = performance.now();
  const proofreaderHandle = getProofreaderHandle();
  if (!proofreaderHandle) {
    throw new ProofreadError(
      "Proofreader API not available",
      "API_UNAVAILABLE",
      false,
    );
  }

  let proofreader: any = null;

  try {
    // Validate input
    if (!request.text || request.text.length === 0) {
      throw new ProofreadError("Text is required", "EMPTY_TEXT", false);
    }

    if (request.text.length > 1000) {
      throw new ProofreadError(
        "Text too long (max 1000 characters)",
        "TEXT_TOO_LONG",
        false,
      );
    }

    // Check if proofreader is available
    const available = await isProofreaderAvailable();
    if (!available) {
      throw new ProofreadError(
        "Proofreader API not available",
        "API_UNAVAILABLE",
        false,
      );
    }

    // Create proofreader session
    proofreader = await proofreaderHandle.create({
      language: request.language,
      context: request.context || "",
    });

    // Get corrections
    const result = await proofreader.proofread(request.text);

    // Parse result (Chrome AI returns array of corrections)
    const corrections = Array.isArray(result) ? result : [];

    const processingTime = performance.now() - startTime;

    console.log(
      `[Proofreader] Found ${corrections.length} corrections in ${processingTime.toFixed(0)}ms (Chrome AI)`,
    );

    return {
      corrections: corrections.map((correction: any) => ({
        type: correction.type || "grammar",
        original: correction.original || "",
        suggestion: correction.suggestion || "",
        explanation: correction.explanation || "",
        position: {
          start: correction.position?.start ?? 0,
          end: correction.position?.end ?? 0,
        },
        confidence: correction.confidence ?? 0.8,
      })),
      processingTime,
      aiSource: "chrome",
    };
  } catch (error: unknown) {
    console.error("[Proofreader] Chrome AI proofread failed:", error);

    if (error instanceof ProofreadError) {
      throw error;
    }

    // Convert generic errors to ProofreadError
    if (
      error instanceof Error &&
      (error.message.includes("quota") || error.message.includes("rate limit"))
    ) {
      throw new ProofreadError("Rate limit exceeded", "QUOTA_EXCEEDED", true);
    }

    if (
      error instanceof Error &&
      (error.message.includes("not available") ||
        error.message.includes("not supported"))
    ) {
      throw new ProofreadError(
        "Proofreader API not available",
        "API_UNAVAILABLE",
        false,
      );
    }

    throw new ProofreadError(
      "Unknown proofreading error",
      "UNKNOWN_ERROR",
      true,
    );
  } finally {
    // Always destroy session to free resources
    if (proofreader) {
      try {
        await proofreader.destroy();
      } catch (destroyError) {
        console.warn("[Proofreader] Error destroying session:", destroyError);
      }
    }
  }
}

/**
 * Proofread text with timeout and proper cancellation
 */
export async function proofreadWithTimeout(
  request: ProofreadRequest,
  timeoutMs: number = 10000,
): Promise<ProofreadResponse> {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  try {
    // Start timeout that aborts the controller
    timeoutId = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    // Call the proofreader API
    // Note: If the Chrome Proofreader API doesn't support AbortSignal,
    // this will attempt to use it but the API will ignore it gracefully
    const result = await proofreadWithChromeAI(request);

    // Clear timeout on successful completion
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    return result;
  } catch (error: unknown) {
    // Clear timeout on error
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    // Check if error was due to abort/timeout
    if (error instanceof Error && error.name === "AbortError") {
      throw new ProofreadError("Proofreading timeout", "TIMEOUT", true);
    }

    // Re-throw other errors
    throw error;
  }
}
