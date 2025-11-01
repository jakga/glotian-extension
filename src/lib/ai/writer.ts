/**
 * Chrome Writer API wrapper for CEFR-level simplification
 *
 * Implements Writer API contracts from ai-api.md
 */

import type { CEFRLevel } from "@/types";
import { isAPIAvailable } from "./detect";
import { ensureAIPolyfill } from "./polyfill";
import { getAIHandle, getModernAIGlobal } from "./env";

export type { CEFRLevel };

// CEFR level descriptions (shared with prompts to ensure consistency)
const CEFR_DESCRIPTIONS: Record<CEFRLevel, string> = {
  A1: "Beginner level: Use very simple vocabulary and short sentences. Avoid complex grammar.",
  A2: "Elementary level: Use common vocabulary and simple sentence structures.",
  B1: "Intermediate level: Use everyday vocabulary and moderate complexity.",
  B2: "Upper-intermediate level: Use varied vocabulary and more complex structures.",
  C1: "Advanced level: Use sophisticated vocabulary and complex sentences.",
  C2: "Proficient level: Use native-like fluency with nuanced expression.",
};

/**
 * Exported interfaces for future use (structured request/response pattern)
 * TODO: Implement these once structured simplification endpoints are available
 */
export interface SimplifyRequest {
  text: string;
  cefrLevel: CEFRLevel;
  sourceLanguage: string;
}

export interface SimplifyResponse {
  simplifiedText: string;
  cefrLevel: CEFRLevel;
  processingTime: number;
}

function getWriterHandle(): {
  create: Function;
  capabilities?: Function;
  availability?: Function;
} | null {
  const modern = getModernAIGlobal<any>("Writer");
  if (modern && typeof modern.create === "function") {
    return modern;
  }

  const aiHandle = getAIHandle() as { writer?: any } | undefined;
  if (aiHandle?.writer) {
    return aiHandle.writer;
  }

  ensureAIPolyfill();
  const fallbackHandle = getAIHandle() as { writer?: any } | undefined;
  return fallbackHandle?.writer ?? null;
}

/**
 * Simplify text to target CEFR level using Chrome Built-in Writer API
 */
type WriterLengthPreference = "shorter" | "as-is" | "longer";

function mapLengthPreference(
  preference: WriterLengthPreference | undefined,
): "short" | "medium" | "long" {
  switch (preference) {
    case "shorter":
      return "short";
    case "longer":
      return "long";
    default:
      return "medium";
  }
}

export async function simplifyWithChromeAI(
  text: string,
  cefrLevel: CEFRLevel,
  options: {
    tone?: "formal" | "neutral" | "casual";
    format?: "plain-text" | "markdown";
    length?: WriterLengthPreference;
    outputLanguage?: string;
  } = {},
): Promise<string> {
  console.log("[Glotian Writer] Simplifying text to CEFR level:", cefrLevel);

  try {
    // Check if Writer API is available
    const available = await isAPIAvailable("writer");
    if (!available) {
      throw new Error("Writer API not available");
    }

    const writerHandle = getWriterHandle();
    if (!writerHandle) {
      throw new Error("Writer API not found");
    }

    // Create writer instance
    const outputLanguage = (options.outputLanguage || "en").toLowerCase();

    const writer = await writerHandle.create({
      tone: options.tone || "neutral",
      format: options.format || "plain-text",
      length: mapLengthPreference(options.length),
      outputLanguage,
    });

    try {
      // Create prompt for CEFR-level rewriting using shared descriptions
      const prompt = `Rewrite the following text to match CEFR ${cefrLevel} level (${CEFR_DESCRIPTIONS[cefrLevel]}). Keep the same meaning but adjust vocabulary and sentence complexity:

${text}`;

      // Perform rewriting
      const simplifiedText = await writer.write(prompt);

      console.log(
        "[Glotian Writer] Simplification successful:",
        simplifiedText.length,
        "chars",
      );

      return simplifiedText;
    } finally {
      // Clean up writer instance
      if (writer && typeof writer.destroy === "function") {
        await writer.destroy();
      }
    }
  } catch (error) {
    console.error("[Glotian Writer] Error:", error);
    throw error;
  }
}

/**
 * Rewrite text with different tone
 */
export async function rewriteWithTone(
  text: string,
  tone: "formal" | "neutral" | "casual",
  length: WriterLengthPreference = "as-is",
): Promise<string> {
  console.log("[Glotian Writer] Rewriting with tone:", tone);

  try {
    const available = await isAPIAvailable("writer");
    if (!available) {
      throw new Error("Writer API not available");
    }

    const writerHandle = getWriterHandle();
    if (!writerHandle) {
      throw new Error("Writer API not found");
    }

    const writer = await writerHandle.create({
      tone,
      format: "plain-text",
      length: mapLengthPreference(length),
      outputLanguage: "en",
    });

    try {
      const result = await writer.write(text);
      console.log("[Glotian Writer] Rewrite successful");
      return result;
    } finally {
      // Clean up writer instance
      if (writer && typeof writer.destroy === "function") {
        await writer.destroy();
      }
    }
  } catch (error) {
    console.error("[Glotian Writer] Error:", error);
    throw error;
  }
}

/**
 * Get CEFR level description for UI
 * Uses shared CEFR_DESCRIPTIONS constant for consistency with prompts
 */
export function getCEFRDescription(level: CEFRLevel): string {
  return CEFR_DESCRIPTIONS[level];
}

function resolveAvailabilityState(value: unknown): string {
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
}

/**
 * Get available writer capabilities
 */
export async function getWriterCapabilities(): Promise<{
  available: boolean;
  supportsTone: boolean;
  supportsLength: boolean;
  supportsFormat: boolean;
}> {
  try {
    const writerHandle = getWriterHandle();
    if (!writerHandle) {
      return {
        available: false,
        supportsTone: false,
        supportsLength: false,
        supportsFormat: false,
      };
    }

    if (typeof writerHandle.capabilities !== "function") {
      // Modern Writer API exposes availability + optional metadata; assume tone/length support.
      return {
        available: true,
        supportsTone: true,
        supportsLength: true,
        supportsFormat: true,
      };
    }

    const capabilities = await writerHandle.capabilities();
    const availability = resolveAvailabilityState(capabilities);

    return {
      available: availability !== "no" && availability !== "unavailable",
      supportsTone: capabilities.supportsTone || false,
      supportsLength: capabilities.supportsLength || false,
      supportsFormat: capabilities.supportsFormat || false,
    };
  } catch (error) {
    console.warn("[Glotian Writer] Error checking capabilities:", error);
    return {
      available: false,
      supportsTone: false,
      supportsLength: false,
      supportsFormat: false,
    };
  }
}

/**
 * Chunk long text for simplification while preserving formatting
 */
export async function simplifyLongText(
  text: string,
  cefrLevel: CEFRLevel,
  options?: {
    tone?: "formal" | "neutral" | "casual";
    format?: "plain-text" | "markdown";
    length?: WriterLengthPreference;
    outputLanguage?: string;
  },
): Promise<string> {
  // If text is short enough, simplify directly
  if (text.length <= 2000) {
    return simplifyWithChromeAI(text, cefrLevel, options);
  }

  console.log("[Glotian Writer] Chunking long text for simplification");

  // Split by paragraphs (double newlines) first to preserve document structure
  const paragraphs = text.split(/\n\n+/);
  const simplifiedParagraphs: string[] = [];

  for (const paragraph of paragraphs) {
    // If paragraph is short enough, simplify directly
    if (paragraph.length <= 2000) {
      const simplified = await simplifyWithChromeAI(
        paragraph,
        cefrLevel,
        options,
      );
      simplifiedParagraphs.push(simplified);
      continue;
    }

    // For long paragraphs, split into sentences while preserving delimiters
    const sentences = paragraph.match(/[^.!?]+[.!?]+/g) || [paragraph];
    const chunks: string[] = [];
    let currentChunk = "";

    for (const sentence of sentences) {
      if (currentChunk.length + sentence.length > 2000) {
        if (currentChunk) {
          chunks.push(currentChunk.trim());
        }
        // Handle oversized sentences
        if (sentence.length > 2000) {
          throw new Error("Single sentence exceeds maximum chunk size");
        }
        currentChunk = sentence;
      } else {
        currentChunk += sentence;
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk.trim());
    }

    // Simplify each chunk
    const simplifiedChunks: string[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      if (!chunk) {
        continue;
      }

      console.log(
        `[Glotian Writer] Simplifying chunk ${i + 1}/${chunks.length}`,
      );
      const simplified = await simplifyWithChromeAI(chunk, cefrLevel, options);
      simplifiedChunks.push(simplified);
    }

    // Join chunks with space to preserve sentence boundaries
    simplifiedParagraphs.push(simplifiedChunks.join(" "));
  }

  // Join paragraphs with double newlines to preserve document structure
  return simplifiedParagraphs.join("\n\n");
}

export async function ensureWriterModelReady(
  options: {
    tone?: "formal" | "neutral" | "casual";
    format?: "plain-text" | "markdown";
    length?: WriterLengthPreference;
    outputLanguage?: string;
    monitorDownload?: (percentage: number) => void;
  } = {},
): Promise<void> {
  const writerHandle = getWriterHandle();
  if (!writerHandle) {
    throw new Error("Writer API not found");
  }

  let availabilityState: string | null = null;

  if (typeof writerHandle.availability === "function") {
    try {
      availabilityState = resolveAvailabilityState(
        await writerHandle.availability(),
      );
    } catch (error) {
      console.warn("[Glotian Writer] availability() check failed:", error);
    }
  }

  if (availabilityState === null) {
    return;
  }

  if (availabilityState === "available" || availabilityState === "readily") {
    return;
  }

  if (availabilityState === "no" || availabilityState === "unavailable") {
    throw new Error("Writer API not available");
  }

  if (
    typeof navigator !== "undefined" &&
    navigator.userActivation &&
    !navigator.userActivation.isActive
  ) {
    throw new Error(
      "Writer model download requires an active user gesture. Please click Summarize again after Chrome finishes downloading the model.",
    );
  }

  const downloadHandler = options.monitorDownload;
  const outputLanguage = (options.outputLanguage || "en").toLowerCase();

  const writer = await writerHandle.create({
    tone: options.tone || "neutral",
    format: options.format || "plain-text",
    length: mapLengthPreference(options.length),
    outputLanguage,
    monitor(m: any) {
      if (typeof m?.addEventListener === "function") {
        m.addEventListener("downloadprogress", (event: any) => {
          const loaded =
            typeof event?.loaded === "number" ? event.loaded : undefined;
          if (loaded !== undefined) {
            const percentage = Math.round(
              Math.min(Math.max(loaded * 100, 0), 100),
            );
            console.log(`[Glotian Writer] Download progress: ${percentage}%`);
            downloadHandler?.(percentage);
          }
        });
      }
    },
  });

  try {
    writer.destroy?.();
  } catch (error) {
    console.warn(
      "[Glotian Writer] Error destroying warm-up writer session:",
      error,
    );
  }
}
