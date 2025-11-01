/**
 * Chrome Prompt API wrapper for Q&A
 *
 * Uses Chrome's built-in language model with RAG pattern for page-based Q&A
 */

import type { QARequest, QAResponse } from "@/types";
import { logError } from "@/lib/storage";
import { ensureAIPolyfill, isServerPolyfillActive } from "./polyfill";
import { getAIHandle, getModernAIGlobal } from "./env";
import { extractTextWithOpenAI, transcribeAudioWithOpenAI } from "./fallback";

function resolveLanguageModel(): any | null {
  const modern = getModernAIGlobal<any>("LanguageModel");
  if (modern && typeof modern.create === "function") {
    return modern;
  }

  const aiHandle = getAIHandle() as { languageModel?: any } | undefined;
  if (aiHandle?.languageModel) {
    return aiHandle.languageModel;
  }

  ensureAIPolyfill();
  const fallbackHandle = getAIHandle() as { languageModel?: any } | undefined;
  return fallbackHandle?.languageModel ?? null;
}

export function detectOutputLanguage(text: string): "en" | "es" | "ja" | null {
  if (!text) {
    return null;
  }

  // Hangul detection — Chrome Prompt API doesn't list Korean, so skip setting output language
  if (/[\u3130-\u318F\uAC00-\uD7A3]/u.test(text)) {
    return null;
  }

  // Japanese detection: Hiragana, Katakana, or common Kanji
  if (/[ぁ-ゟ゠-ヿ一-龯]/u.test(text)) {
    return "ja";
  }

  // Spanish detection: inverted punctuation or accent marks
  if (/[¿¡áéíóúüñÁÉÍÓÚÜÑ]/u.test(text)) {
    return "es";
  }

  // Treat ASCII-heavy text as English by default
  if (!/[^\x00-\x7F]/.test(text)) {
    return "en";
  }

  return null;
}

/**
 * Answer a question using Chrome Prompt API with page context
 *
 * @param request - Q&A request with question and page context
 * @returns AI-generated answer with sources and follow-up questions
 * @throws Error if Chrome AI unavailable or API call fails
 */
export async function answerQuestionWithPrompt(
  request: QARequest,
): Promise<QAResponse> {
  const startTime = performance.now();

  console.log("[Glotian Prompt API] Answering question with page context");

  // Check if Chrome AI is available
  const languageModel = resolveLanguageModel();
  if (!languageModel) {
    throw new Error("Chrome Prompt API not available");
  }

  let session: any = null;
  try {
    // Validate inputs
    if (!request.question || request.question.length < 5) {
      throw new Error("Question must be at least 5 characters");
    }

    if (request.question.length > 500) {
      throw new Error("Question exceeds 500 character limit");
    }

    if (!request.pageContent || request.pageContent.length < 100) {
      throw new Error("Page content must be at least 100 characters");
    }

    if (request.pageContent.length > 10000) {
      throw new Error(
        "Page content exceeds 10,000 character limit (must be summarized first)",
      );
    }

    // Build focused system prompt and pass the heavy page content via user prompt
    const systemPrompt = `You are a helpful AI assistant that answers questions about a single web page.

Follow these rules:
1. Rely only on the provided page content when forming your answer.
2. Include at least one direct quote with character offsets relative to the supplied page content whenever possible.
3. If the information is missing, respond with the exact sentence "I couldn't find that information on this page".
4. Suggest two or three relevant follow-up questions.
5. Match the language used in the latest user question.

Return a strictly valid JSON object that matches this schema:
{
  "answer": "string",
  "sources": [
    {
      "quote": "string",
      "relevance": 0.0,
      "position": {"start": 0, "end": 0}
    }
  ],
  "followUpQuestions": ["string", "string", "string"]
}`;

    const outputLanguage = detectOutputLanguage(request.question);
    if (!outputLanguage) {
      throw new Error(
        "Chrome Prompt API requires outputLanguage to be en, es, or ja",
      );
    }

    // Create language model session with explicit output language to satisfy policy requirements
    session = await languageModel.create({
      systemPrompt,
      temperature: 0.3, // Lower temperature for more factual responses
      topK: 3, // Focus on most relevant tokens
      outputLanguage,
    });

    const history = request.previousMessages
      ?.map(
        (msg) =>
          `${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}`,
      )
      .join("\n\n");

    const promptSections: string[] = [
      `Page URL: ${request.pageUrl}`,
      `Page Title: ${request.pageTitle}`,
      `Page Content:\n${request.pageContent}`,
    ];

    if (history && history.trim().length > 0) {
      promptSections.push(`Conversation so far:\n${history}`);
    }

    promptSections.push(`User Question:\n${request.question}`);
    promptSections.push(
      "Return the JSON response defined in the system instructions. Provide character offsets that reference the supplied page content when quoting sources.",
    );

    const promptInput = promptSections.join("\n\n---\n\n");

    // Get answer from AI
    const response = await session.prompt(promptInput);

    // Parse JSON response
    let parsed: {
      answer: string;
      sources: Array<{
        quote: string;
        relevance: number;
        position?: { start: number; end: number };
      }>;
      followUpQuestions: string[];
    };

    try {
      // Try to extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        // Fallback: treat response as plain text answer
        parsed = {
          answer: response,
          sources: [],
          followUpQuestions: [],
        };
      }
    } catch (e) {
      // If JSON parsing fails, use response as answer
      parsed = {
        answer: response,
        sources: [],
        followUpQuestions: [],
      };
    }

    // Extract sources by finding quotes in page content
    const sources = (parsed.sources || []).map((source) => {
      if (!source.position) {
        // Find position of quote in page content
        const startIndex = request.pageContent.indexOf(source.quote);
        if (startIndex !== -1) {
          source.position = {
            start: startIndex,
            end: startIndex + source.quote.length,
          };
        }
      }
      return source;
    });

    const processingTime = performance.now() - startTime;

    console.log(
      `[Glotian Prompt API] Q&A complete: ${sources.length} sources in ${processingTime.toFixed(0)}ms`,
    );

    return {
      answer: parsed.answer,
      sources,
      followUpQuestions: (parsed.followUpQuestions || []).slice(0, 3), // Limit to 3
      processingTime,
      aiSource: "chrome",
    };
  } catch (error) {
    console.error("[Glotian Prompt API] Q&A error:", error);
    await logError("answerQuestionWithPrompt", error as Error, { request });
    throw error;
  } finally {
    if (session) {
      try {
        await session.destroy();
      } catch (destroyError) {
        console.warn(
          "[Glotian Prompt API] Error destroying session:",
          destroyError,
        );
      }
    }
  }
}

/**
 * Extract text from image using Chrome Prompt API (multimodal)
 *
 * @param imageData - Base64 image data URL or Blob
 * @param language - Optional: hint for OCR language
 * @returns Extracted text with confidence score
 * @throws Error if Chrome AI unavailable or OCR fails
 */
export async function extractTextFromImage(
  imageData: string | Blob,
  language?: string,
): Promise<{
  extractedText: string;
  confidence: number;
  language: string;
  processingTime: number;
  aiSource: "chrome" | "openai-vision";
}> {
  const startTime = performance.now();

  console.log("[Glotian Prompt API] Extracting text from image (OCR)");

  if (isServerPolyfillActive()) {
    return extractTextWithOpenAI(imageData, language);
  }

  const languageModel = resolveLanguageModel();
  if (!languageModel) {
    throw new Error("Chrome Prompt API (multimodal) not available");
  }

  try {
    // Convert Blob to data URL if needed
    let dataUrl: string;
    if (typeof imageData === "string") {
      dataUrl = imageData;
    } else {
      dataUrl = await blobToDataURL(imageData);
    }

    // Check image size (max 3MB)
    const imageSizeBytes = (dataUrl.length * 3) / 4;
    if (imageSizeBytes > 3 * 1024 * 1024) {
      throw new Error("Image exceeds 3MB size limit");
    }

    // Create language model session for OCR
    let session: any = null;
    try {
      session = await languageModel.create({
        systemPrompt: `You are an OCR assistant. Extract all text from the image and return it exactly as it appears. ${language ? `The text is likely in ${language}.` : ""}`,
        expectedInputs: [{ type: "image" }],
      });

      // Send image with OCR prompt using proper multimodal format
      const response = await session.prompt([
        {
          role: "user",
          content: [
            { type: "text", value: "Please extract all text from this image:" },
            { type: "image", value: dataUrl },
          ],
        },
      ]);

      const processingTime = performance.now() - startTime;

      console.log(
        `[Glotian Prompt API] OCR complete in ${processingTime.toFixed(0)}ms`,
      );

      return {
        extractedText: response.trim(),
        confidence: 0.85, // Chrome AI doesn't provide confidence, use default
        language: language || "auto-detected",
        processingTime,
        aiSource: "chrome",
      };
    } finally {
      if (session) {
        try {
          await session.destroy();
        } catch (destroyError) {
          console.warn(
            "[Glotian Prompt API] Error destroying OCR session:",
            destroyError,
          );
        }
      }
    }
  } catch (error) {
    console.error("[Glotian Prompt API] OCR error:", error);
    await logError("extractTextFromImage", error as Error, {
      imageData: typeof imageData,
      language,
    });
    throw error;
  }
}

/**
 * Transcribe audio using Chrome Prompt API (multimodal)
 *
 * @param audioData - Audio Blob
 * @param language - Optional: hint for transcription language
 * @returns Transcribed text with detected language
 * @throws Error if Chrome AI unavailable or transcription fails
 */
export async function transcribeAudio(
  audioData: Blob,
  language?: string,
): Promise<{
  transcribedText: string;
  language: string;
  duration: number;
  processingTime: number;
  aiSource: "chrome" | "openai-whisper";
}> {
  const startTime = performance.now();

  console.log("[Glotian Prompt API] Transcribing audio");

  if (isServerPolyfillActive()) {
    return transcribeAudioWithOpenAI(audioData, language);
  }

  const languageModel = resolveLanguageModel();
  if (!languageModel) {
    throw new Error("Chrome Prompt API (multimodal) not available");
  }

  let session: any = null;
  try {
    // Check audio size (max ~4MB for 2 minutes)
    if (audioData.size > 4 * 1024 * 1024) {
      throw new Error("Audio exceeds 4MB size limit (max 2 minutes)");
    }

    // Get audio duration
    const duration = await getAudioDuration(audioData);
    if (duration > 120) {
      throw new Error("Audio exceeds 2 minute duration limit");
    }

    // Create language model session for transcription with expectedInputs
    session = await languageModel.create({
      systemPrompt: `You are an audio transcription assistant. Transcribe the audio accurately. ${language ? `The audio is likely in ${language}.` : ""}`,
      expectedInputs: ["audio"], // Signal that we'll send audio
    });

    // Send audio with transcription prompt
    // Note: Pass audio Blob directly (not dataUrl) in the request
    const prompt = [
      { text: "Please transcribe this audio:" },
      { audio: audioData }, // Pass Blob directly
    ];
    const response = await session.prompt(prompt);

    const processingTime = performance.now() - startTime;

    console.log(
      `[Glotian Prompt API] Transcription complete in ${processingTime.toFixed(0)}ms`,
    );

    return {
      transcribedText: response.trim(),
      language: language || "auto-detected",
      duration,
      processingTime,
      aiSource: "chrome",
    };
  } catch (error) {
    console.error("[Glotian Prompt API] Transcription error:", error);
    await logError("transcribeAudio", error as Error, {
      audioSize: audioData.size,
      language,
    });
    throw error;
  } finally {
    // Ensure session is destroyed even if error occurs
    if (session) {
      try {
        await session.destroy();
      } catch (destroyError) {
        console.warn(
          "[Glotian Prompt API] Error destroying session:",
          destroyError,
        );
      }
    }
  }
}

/**
 * Convert Blob to base64 data URL
 */
function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Get audio duration from Blob
 */
function getAudioDuration(audioBlob: Blob): Promise<number> {
  return new Promise((resolve, reject) => {
    const audio = new Audio();
    const url = URL.createObjectURL(audioBlob);

    audio.addEventListener("loadedmetadata", () => {
      URL.revokeObjectURL(url);
      resolve(audio.duration);
    });

    audio.addEventListener("error", () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load audio metadata"));
    });

    audio.src = url;
  });
}
