/**
 * Server-backed Chrome AI polyfill.
 *
 * Chrome's built-in AI APIs are currently only available in specific Chrome
 * builds with experimental flags. When they are missing, we install a
 * lightweight polyfill that mirrors the same surface area but delegates to
 * server providers (OpenAI / Gemini) that the extension already supports as
 * fallbacks. This keeps the rest of the codebase working without special-case
 * logic and allows AI features to function across environments.
 */

import type { TranslateRequest } from "@/types";
import type { ProofreadRequest, ProofreadResponse } from "./proofreader";
import type { RewriteRequest, RewriteResponse } from "./rewriter";
import {
  translateWithOpenAI,
  translateWithGemini,
  proofreadWithOpenAI,
  rewriteWithOpenAI,
} from "./fallback";
import { getAIHandle, hasAIHandle, setAIHandle } from "./env";

type Availability = "no" | "after-download" | "readily";

interface TranslatorConfig {
  sourceLanguage?: string;
  targetLanguage: string;
}

interface WriterConfig {
  tone?: "formal" | "neutral" | "casual";
  format?: "plain-text" | "markdown";
  length?: "shorter" | "as-is" | "longer";
}

interface LanguageModelConfig {
  systemPrompt?: string;
  temperature?: number;
  topK?: number;
  maxOutputTokens?: number;
}

interface SummarizerConfig {
  type?: "tldr" | "key-points" | "teaser" | "headline";
  format?: "plain-text" | "markdown";
  length?: "short" | "medium" | "long";
}

interface RewriterConfig extends WriterConfig {
  context?: string;
}

interface ProofreaderConfig {
  language: string;
  context?: string;
}

interface LanguageDetector {
  detect(
    text: string,
  ): Promise<Array<{ detectedLanguage: string; confidence: number }>>;
  destroy(): Promise<void> | void;
}

interface TranslatorSession {
  translate(text: string): Promise<string>;
  destroy(): Promise<void> | void;
}

interface SummarizerSession {
  summarize(text: string): Promise<string>;
  destroy(): Promise<void> | void;
}

interface LanguageModelSession {
  prompt(input: string): Promise<string>;
  destroy(): Promise<void> | void;
}

interface WriterSession {
  write(input: string): Promise<string>;
  destroy(): Promise<void> | void;
}

interface RewriterSession {
  rewrite(text: string): Promise<string>;
  destroy(): Promise<void> | void;
}

interface ProofreaderSession {
  proofread(text: string): Promise<ProofreadResponse["corrections"]>;
  destroy(): Promise<void> | void;
}

interface TranslatorPolyfill {
  capabilities(): Promise<{
    available: Availability;
    supportsLanguageDetection: boolean;
    maxInputCharacters: number;
  }>;
  create(config: TranslatorConfig): Promise<TranslatorSession>;
  createDetector(): Promise<LanguageDetector>;
}

interface SummarizerPolyfill {
  capabilities(): Promise<{
    available: Availability;
    maxInputLength: number;
    formats: Array<"plain-text" | "markdown">;
  }>;
  create(config?: SummarizerConfig): Promise<SummarizerSession>;
}

interface LanguageModelPolyfill {
  capabilities(): Promise<{
    available: Availability;
    modalities: string[];
  }>;
  create(config?: LanguageModelConfig): Promise<LanguageModelSession>;
}

interface WriterPolyfill {
  capabilities(): Promise<{
    available: Availability;
    supportsTone: boolean;
    supportsLength: boolean;
    supportsFormat: boolean;
  }>;
  create(config?: WriterConfig): Promise<WriterSession>;
}

interface RewriterPolyfill {
  capabilities(): Promise<{
    available: Availability;
    supportsTone: boolean;
    supportsLength: boolean;
    supportsContext: boolean;
  }>;
  create(config?: RewriterConfig): Promise<RewriterSession>;
}

interface ProofreaderPolyfill {
  capabilities(): Promise<{
    available: Availability;
    supportedLanguages: string[];
  }>;
  create(config: ProofreaderConfig): Promise<ProofreaderSession>;
}

interface ChromeAIPolyfill {
  translator: TranslatorPolyfill;
  summarizer: SummarizerPolyfill;
  languageModel: LanguageModelPolyfill;
  writer: WriterPolyfill;
  rewriter: RewriterPolyfill;
  proofreader: ProofreaderPolyfill;
}

const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY;
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const OPENAI_MODEL = "gpt-4o-mini";
const GEMINI_MODEL = "gemini-flash-lite-latest";

let polyfillInstalled = false;
let activePolyfill: ChromeAIPolyfill | null = null;

function hasOpenAI(): boolean {
  return Boolean(OPENAI_API_KEY);
}

function hasGemini(): boolean {
  return Boolean(GEMINI_API_KEY);
}

function hasLLMProvider(): boolean {
  return hasOpenAI() || hasGemini();
}

type LLMCallOptions = {
  temperature?: number;
  maxTokens?: number;
  topK?: number;
};

async function callOpenAIText(
  systemPrompt: string,
  userPrompt: string,
  options: LLMCallOptions = {},
): Promise<string> {
  if (!hasOpenAI()) {
    throw new Error("OpenAI API key not configured");
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: userPrompt,
        },
      ],
      temperature: options.temperature ?? 0.5,
      max_tokens: options.maxTokens ?? 1024,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const result = data.choices?.[0]?.message?.content;
  if (!result) {
    throw new Error("OpenAI returned an empty response");
  }

  return typeof result === "string" ? result.trim() : String(result);
}

async function callGeminiText(
  systemPrompt: string,
  userPrompt: string,
  options: LLMCallOptions = {},
): Promise<string> {
  if (!hasGemini()) {
    throw new Error("Gemini API key not configured");
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `${systemPrompt}\n\n${userPrompt}`,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: options.temperature ?? 0.5,
          topK: options.topK ?? 32,
          maxOutputTokens: options.maxTokens ?? 1024,
        },
      }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const parts = data.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts) || parts.length === 0) {
    throw new Error("Gemini returned an empty response");
  }

  const text = parts
    .map((part: { text?: string }) => part.text ?? "")
    .join("")
    .trim();

  if (!text) {
    throw new Error("Gemini response contained no text content");
  }

  return text;
}

async function callLLMText(
  systemPrompt: string,
  userPrompt: string,
  options: LLMCallOptions = {},
): Promise<string> {
  if (hasOpenAI()) {
    try {
      return await callOpenAIText(systemPrompt, userPrompt, options);
    } catch (error) {
      console.warn("[Glotian AI Polyfill] OpenAI call failed:", error);
    }
  }

  if (hasGemini()) {
    return callGeminiText(systemPrompt, userPrompt, options);
  }

  throw new Error("No AI provider configured (OpenAI/Gemini)");
}

function detectLanguageHeuristic(text: string): string {
  const sample = text.slice(0, 200).trim();
  if (!sample) return "en";

  if (/[가-힣]/u.test(sample)) return "ko";
  if (/[ぁ-んァ-ン]/u.test(sample)) return "ja";
  if (/[一-龯]/u.test(sample)) return "zh";
  if (/[а-яА-ЯёЁ]/u.test(sample)) return "ru";
  if (/[¿¡áéíóúñ]/iu.test(sample)) return "es";
  if (/[àâçéèêëîïôûùüÿœæ]/iu.test(sample)) return "fr";
  if (/[ßäöüÄÖÜ]/u.test(sample)) return "de";

  return "en";
}

async function translateViaProviders(
  request: TranslateRequest,
): Promise<string> {
  if (hasOpenAI()) {
    try {
      const result = await translateWithOpenAI(request);
      if (result.translatedText) {
        return result.translatedText;
      }
    } catch (error) {
      console.warn(
        "[Glotian AI Polyfill] OpenAI translation failed, trying Gemini:",
        error,
      );
    }
  }

  if (hasGemini()) {
    const result = await translateWithGemini(request);
    if (result.translatedText) {
      return result.translatedText;
    }
  }

  throw new Error("No translation provider succeeded");
}

async function summarizeViaProviders(
  text: string,
  config: SummarizerConfig,
): Promise<string> {
  const lengthHints: Record<string, string> = {
    short: "under 120 words",
    medium: "around 250 words",
    long: "around 400 words",
  };

  const summaryStyle: Record<string, string> = {
    tldr: "Provide a concise TL;DR style summary.",
    "key-points": "List 3-5 key bullet points.",
    teaser: "Write a short teaser that entices the reader.",
    headline: "Generate a compelling headline plus one supporting sentence.",
  };

  const formatInstruction =
    config.format === "markdown"
      ? "Format the response in Markdown."
      : "Use plain text with minimal formatting.";

  const styleInstruction =
    summaryStyle[config.type ?? "tldr"] ??
    "Provide a concise summary capturing the essential information.";

  const lengthInstruction =
    lengthHints[config.length ?? "medium"] ?? "Aim for roughly 200 words.";

  const systemPrompt =
    `${styleInstruction} ${formatInstruction} ` +
    `Keep the summary ${lengthInstruction} Respond with the summary only.`;

  const sanitized = text.length > 18000 ? text.slice(0, 18000) : text;

  return callLLMText(systemPrompt, sanitized, {
    temperature: 0.4,
    maxTokens: 1024,
  });
}

async function rewriteViaProviders(
  text: string,
  config: RewriterConfig,
  mode: "writer" | "rewriter",
): Promise<string> {
  const tone = config.tone ?? "neutral";
  const format = config.format ?? "plain-text";
  const length = config.length ?? "as-is";
  const contextPart = config.context ? `Context: ${config.context}\n\n` : "";

  const systemPrompt =
    mode === "writer"
      ? "You are a writing assistant that rewrites text according to the requested parameters."
      : "You are an editing assistant that rewrites text with improved tone and flow according to the requested parameters.";

  const directives: string[] = [
    `Tone: ${tone}`,
    `Format: ${format}`,
    `Desired length: ${length}`,
    "Preserve the original meaning.",
    "Return ONLY the rewritten text with no preface, explanations, or metadata.",
  ];

  const userPrompt = `${contextPart}${text}`;

  return callLLMText(`${systemPrompt}\n${directives.join("\n")}`, userPrompt, {
    temperature: 0.6,
    maxTokens: 1200,
  });
}

async function promptViaProviders(
  config: LanguageModelConfig,
  input: string,
): Promise<string> {
  const systemPrompt =
    config.systemPrompt ??
    "You are a helpful AI assistant. Provide concise, accurate answers.";

  return callLLMText(systemPrompt, input, {
    temperature: config.temperature ?? 0.5,
    maxTokens: config.maxOutputTokens ?? 1500,
    topK: config.topK,
  });
}

async function proofreadViaProviders(
  text: string,
  config: ProofreaderConfig,
): Promise<ProofreadResponse["corrections"]> {
  if (!hasOpenAI()) {
    throw new Error("Proofreader polyfill requires OpenAI configuration");
  }

  const request: ProofreadRequest = {
    text,
    language: config.language || "en",
    context: config.context,
  };

  const result = await proofreadWithOpenAI(request);
  return result.corrections;
}

function createAIPolyfill(): ChromeAIPolyfill {
  const translator: TranslatorPolyfill = {
    async capabilities() {
      return {
        available: hasLLMProvider() ? "readily" : "no",
        supportsLanguageDetection: hasLLMProvider(),
        maxInputCharacters: 4000,
      };
    },
    async create(config: TranslatorConfig): Promise<TranslatorSession> {
      if (!hasLLMProvider()) {
        throw new Error("Translator polyfill unavailable (no providers)");
      }

      const sourceLang = config.sourceLanguage ?? "auto";
      const targetLang = config.targetLanguage;

      return {
        async translate(text: string): Promise<string> {
          const request: TranslateRequest = {
            text,
            sourceLang:
              sourceLang === "auto"
                ? detectLanguageHeuristic(text)
                : sourceLang,
            targetLang,
          };

          return translateViaProviders(request);
        },
        async destroy(): Promise<void> {
          // No resources to release
        },
      };
    },
    async createDetector(): Promise<LanguageDetector> {
      return {
        async detect(text: string) {
          const detected = detectLanguageHeuristic(text);
          return [
            {
              detectedLanguage: detected,
              confidence: 0.6,
            },
          ];
        },
        async destroy(): Promise<void> {
          // No resources to release
        },
      };
    },
  };

  const summarizer: SummarizerPolyfill = {
    async capabilities() {
      return {
        available: hasLLMProvider() ? "readily" : "no",
        maxInputLength: 20000,
        formats: ["plain-text", "markdown"],
      };
    },
    async create(config?: SummarizerConfig): Promise<SummarizerSession> {
      if (!hasLLMProvider()) {
        throw new Error("Summarizer polyfill unavailable (no providers)");
      }

      const normalized: SummarizerConfig = {
        type: config?.type ?? "tldr",
        format: config?.format ?? "plain-text",
        length: config?.length ?? "medium",
      };

      return {
        async summarize(text: string): Promise<string> {
          return summarizeViaProviders(text, normalized);
        },
        async destroy(): Promise<void> {
          // No resources to release
        },
      };
    },
  };

  const languageModel: LanguageModelPolyfill = {
    async capabilities() {
      return {
        available: hasLLMProvider() ? "readily" : "no",
        modalities: ["text"],
      };
    },
    async create(
      config: LanguageModelConfig = {},
    ): Promise<LanguageModelSession> {
      if (!hasLLMProvider()) {
        throw new Error("Prompt polyfill unavailable (no providers)");
      }

      const normalized: LanguageModelConfig = {
        systemPrompt: config.systemPrompt,
        temperature: config.temperature,
        topK: config.topK,
        maxOutputTokens: config.maxOutputTokens,
      };

      return {
        async prompt(input: string): Promise<string> {
          return promptViaProviders(normalized, input);
        },
        async destroy(): Promise<void> {
          // No resources to release
        },
      };
    },
  };

  const writer: WriterPolyfill = {
    async capabilities() {
      return {
        available: hasLLMProvider() ? "readily" : "no",
        supportsTone: true,
        supportsLength: true,
        supportsFormat: true,
      };
    },
    async create(config: WriterConfig = {}): Promise<WriterSession> {
      if (!hasLLMProvider()) {
        throw new Error("Writer polyfill unavailable (no providers)");
      }

      const normalized: WriterConfig = {
        tone: config.tone ?? "neutral",
        format: config.format ?? "plain-text",
        length: config.length ?? "as-is",
      };

      return {
        async write(input: string): Promise<string> {
          return rewriteViaProviders(input, normalized, "writer");
        },
        async destroy(): Promise<void> {
          // No resources to release
        },
      };
    },
  };

  const rewriter: RewriterPolyfill = {
    async capabilities() {
      return {
        available: hasLLMProvider() ? "readily" : "no",
        supportsTone: true,
        supportsLength: true,
        supportsContext: true,
      };
    },
    async create(config: RewriterConfig = {}): Promise<RewriterSession> {
      if (!hasLLMProvider()) {
        throw new Error("Rewriter polyfill unavailable (no providers)");
      }

      const normalized: RewriterConfig = {
        tone: config.tone ?? "neutral",
        format: config.format ?? "plain-text",
        length: config.length ?? "as-is",
        context: config.context ?? "",
      };

      return {
        async rewrite(text: string): Promise<string> {
          // Attempt to use structured fallback first for richer responses
          if (hasOpenAI()) {
            try {
              const result: RewriteResponse = await rewriteWithOpenAI({
                text,
                tone: normalized.tone,
                length: normalized.length,
                language: "en",
                context: normalized.context,
              } satisfies RewriteRequest);

              if (result.rewrittenText) {
                return result.rewrittenText;
              }
            } catch (error) {
              console.warn(
                "[Glotian AI Polyfill] Structured rewrite failed, using generic prompt:",
                error,
              );
            }
          }

          return rewriteViaProviders(text, normalized, "rewriter");
        },
        async destroy(): Promise<void> {
          // No resources to release
        },
      };
    },
  };

  const proofreader: ProofreaderPolyfill = {
    async capabilities() {
      return {
        available: hasOpenAI() ? "readily" : "no",
        supportedLanguages: ["en"],
      };
    },
    async create(config: ProofreaderConfig): Promise<ProofreaderSession> {
      if (!hasOpenAI()) {
        throw new Error(
          "Proofreader polyfill unavailable (OpenAI not configured)",
        );
      }

      const normalized: ProofreaderConfig = {
        language: config.language || "en",
        context: config.context,
      };

      return {
        async proofread(text: string) {
          return proofreadViaProviders(text, normalized);
        },
        async destroy(): Promise<void> {
          // No resources to release
        },
      };
    },
  };

  return {
    translator,
    summarizer,
    languageModel,
    writer,
    rewriter,
    proofreader,
  };
}

/**
 * Ensure the AI polyfill is installed exactly once. If Chrome already exposes
 * a native `chrome.ai` handle (or modern globals), we leave it untouched.
 */
export function ensureAIPolyfill(): void {
  if (polyfillInstalled) {
    return;
  }

  if (hasAIHandle()) {
    polyfillInstalled = true;
    return;
  }

  activePolyfill = createAIPolyfill();
  setAIHandle(activePolyfill);
  polyfillInstalled = true;

  if (hasLLMProvider()) {
    console.info(
      "[Glotian AI] Installed server-backed Chrome AI polyfill (OpenAI/Gemini)",
    );
  } else {
    console.info(
      "[Glotian AI] Installed Chrome AI polyfill (no providers configured)",
    );
  }
}

/**
 * Determine whether the server-backed polyfill is the active implementation.
 */
export function isServerPolyfillActive(): boolean {
  return activePolyfill !== null && getAIHandle() === activePolyfill;
}
