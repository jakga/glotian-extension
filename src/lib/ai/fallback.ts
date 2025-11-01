/**
 * Server-side AI fallback (OpenAI/Gemini)
 *
 * Used when Chrome Built-in AI is unavailable
 */

import type {
  TranslateRequest,
  TranslateResponse,
  QARequest,
  QAResponse,
} from "@/types";
import type { ProofreadRequest, ProofreadResponse } from "./proofreader";
import type { RewriteRequest, RewriteResponse } from "./rewriter";
import { logError } from "@/lib/storage";

const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY;
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

/**
 * Translate text using OpenAI API
 */
export async function translateWithOpenAI(
  request: TranslateRequest,
): Promise<TranslateResponse> {
  console.log(
    "[Glotian Fallback] Translating with GPT-5 Nano:",
    request.sourceLang,
    "→",
    request.targetLang,
  );

  if (!OPENAI_API_KEY) {
    throw new Error("OpenAI API key not configured");
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-5-nano-2025-08-07",
        messages: [
          {
            role: "system",
            content: `You are a professional translator. Translate the following text from ${request.sourceLang} to ${request.targetLang}. Provide ONLY the translation, no explanations.${request.cefrLevel ? ` Adjust language complexity to CEFR level ${request.cefrLevel}.` : ""}`,
          },
          {
            role: "user",
            content: request.text,
          },
        ],
        max_completion_tokens: 1000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const translatedText = data.choices[0]?.message?.content?.trim();

    if (!translatedText) {
      throw new Error("No translation returned from OpenAI");
    }

    console.log("[Glotian Fallback] GPT-5 Nano translation successful");

    return {
      translatedText,
      confidence: 0.9,
    };
  } catch (error) {
    console.error("[Glotian Fallback] GPT-5 Nano error:", error);
    await logError("translateWithOpenAI", error as Error, { request });
    throw error;
  }
}

/**
 * Translate text using Gemini API
 */
export async function translateWithGemini(
  request: TranslateRequest,
): Promise<TranslateResponse> {
  console.log(
    "[Glotian Fallback] Translating with Gemini Flash Lite:",
    request.sourceLang,
    "→",
    request.targetLang,
  );

  if (!GEMINI_API_KEY) {
    throw new Error("Gemini API key not configured");
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `Translate the following text from ${request.sourceLang} to ${request.targetLang}. Provide ONLY the translation, no explanations.${request.cefrLevel ? ` Adjust language complexity to CEFR level ${request.cefrLevel}.` : ""}\n\nText: ${request.text}`,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 1000,
          },
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const translatedText = data.candidates[0]?.content?.parts[0]?.text?.trim();

    if (!translatedText) {
      throw new Error("No translation returned from Gemini");
    }

    console.log("[Glotian Fallback] Gemini Flash Lite translation successful");

    return {
      translatedText,
      confidence: 0.9,
    };
  } catch (error) {
    console.error("[Glotian Fallback] Gemini Flash Lite error:", error);
    await logError("translateWithGemini", error as Error, { request });
    throw error;
  }
}

/**
 * Get grammar explanation using OpenAI
 */
export async function getGrammarExplanation(
  originalText: string,
  translatedText: string,
  sourceLang: string,
  targetLang: string,
): Promise<string> {
  if (!OPENAI_API_KEY) {
    return "";
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-5-nano-2025-08-07",
        messages: [
          {
            role: "system",
            content: `You are a language teacher. Provide a brief grammar explanation (2-3 sentences) for language learners. Focus on key grammar structures and vocabulary.`,
          },
          {
            role: "user",
            content: `Original (${sourceLang}): ${originalText}\n\nTranslation (${targetLang}): ${translatedText}\n\nExplain the key grammar points and vocabulary for a language learner.`,
          },
        ],
        max_completion_tokens: 200,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0]?.message?.content?.trim() || "";
  } catch (error) {
    console.error("[Glotian Fallback] Grammar explanation error:", error);
    return "";
  }
}

/**
 * Proofread text using OpenAI API
 */
export async function proofreadWithOpenAI(
  request: ProofreadRequest,
): Promise<ProofreadResponse> {
  const startTime = performance.now();

  console.log("[Glotian Fallback] Proofreading with OpenAI");

  if (!OPENAI_API_KEY) {
    throw new Error("OpenAI API key not configured");
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-5-nano-2025-08-07",
        messages: [
          {
            role: "system",
            content: `You are a professional proofreader. Analyze the text for spelling, grammar, punctuation, and style errors. Return your response as a JSON array of corrections with this format:
[
  {
    "type": "spelling" | "grammar" | "punctuation" | "style",
    "original": "the original text",
    "suggestion": "the corrected text",
    "explanation": "why this is incorrect",
    "position": {"start": 0, "end": 10},
    "confidence": 0.9
  }
]
If there are no errors, return an empty array [].`,
          },
          {
            role: "user",
            content: request.text,
          },
        ],
        max_completion_tokens: 2000,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content?.trim();

    if (!content) {
      throw new Error("No response from OpenAI");
    }

    // Parse JSON response
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      // If not JSON, try to extract corrections array
      const match = content.match(/\[[\s\S]*\]/);
      if (match) {
        parsed = { corrections: JSON.parse(match[0]) };
      } else {
        parsed = { corrections: [] };
      }
    }

    const corrections = Array.isArray(parsed)
      ? parsed
      : parsed.corrections || [];

    const processingTime = performance.now() - startTime;

    console.log(
      `[Glotian Fallback] OpenAI proofreading complete: ${corrections.length} corrections in ${processingTime.toFixed(0)}ms`,
    );

    return {
      corrections,
      processingTime,
      aiSource: "openai",
    };
  } catch (error) {
    console.error("[Glotian Fallback] OpenAI proofread error:", error);
    await logError("proofreadWithOpenAI", error as Error, { request });
    throw error;
  }
}

/**
 * Rewrite text using OpenAI API
 */
export async function rewriteWithOpenAI(
  request: RewriteRequest,
): Promise<RewriteResponse> {
  const startTime = performance.now();

  console.log(
    `[Glotian Fallback] Rewriting with OpenAI (tone: ${request.tone}, length: ${request.length})`,
  );

  if (!OPENAI_API_KEY) {
    throw new Error("OpenAI API key not configured");
  }

  try {
    // Build prompt based on request parameters
    let prompt = `Rewrite the following text`;

    if (request.tone && request.tone !== "neutral") {
      prompt += ` in a ${request.tone} tone`;
    }

    if (request.length && request.length !== "as-is") {
      prompt += ` making it ${request.length}`;
    }

    prompt += `. Also provide 2 alternative versions with different phrasings.`;

    if (request.context) {
      prompt += ` Context: ${request.context}`;
    }

    prompt += `\n\nReturn your response as JSON:
{
  "rewrittenText": "the main rewrite",
  "alternatives": ["alternative 1", "alternative 2"],
  "learningExpressions": [
    {
      "original": "original phrase",
      "rewritten": "improved phrase",
      "explanation": "why this is better"
    }
  ]
}`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-5-nano-2025-08-07",
        messages: [
          {
            role: "system",
            content: `You are a professional writer and editor. ${prompt}`,
          },
          {
            role: "user",
            content: request.text,
          },
        ],
        max_completion_tokens: 2000,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content?.trim();

    if (!content) {
      throw new Error("No response from OpenAI");
    }

    // Parse JSON response
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      throw new Error(
        `Failed to parse OpenAI response as JSON: ${content.substring(0, 100)}`,
      );
    }
    const processingTime = performance.now() - startTime;

    console.log(
      `[Glotian Fallback] OpenAI rewriting complete in ${processingTime.toFixed(0)}ms`,
    );

    return {
      rewrittenText: parsed.rewrittenText || request.text,
      alternatives: parsed.alternatives || [],
      learningExpressions: parsed.learningExpressions || [],
      processingTime,
      aiSource: "openai",
    };
  } catch (error) {
    console.error("[Glotian Fallback] OpenAI rewrite error:", error);
    await logError("rewriteWithOpenAI", error as Error, { request });
    throw error;
  }
}

/**
 * Answer question using OpenAI API (RAG pattern)
 */
export async function answerQuestionWithOpenAI(
  request: QARequest,
): Promise<QAResponse> {
  const startTime = performance.now();

  console.log("[Glotian Fallback] Answering question with OpenAI (RAG)");

  if (!OPENAI_API_KEY) {
    throw new Error("OpenAI API key not configured");
  }

  try {
    // Validate content length (rough limit: ~100k characters ≈ 25k tokens)
    const maxContentLength = 100000;
    const truncatedContent =
      request.pageContent.length > maxContentLength
        ? request.pageContent.substring(0, maxContentLength) +
          "\n\n[Content truncated due to length...]"
        : request.pageContent;

    // Build system prompt with page context
    const systemPrompt = `You are a helpful AI assistant that answers questions based on the content of a web page.

Page URL: ${request.pageUrl}
Page Title: ${request.pageTitle}

Page Content:
${truncatedContent}

Instructions:
1. Answer the user's question based ONLY on the information in the page content above
2. Quote directly from the page content to support your answer
3. If the page content doesn't contain the answer, say "I couldn't find that information on this page"
4. Suggest 2-3 relevant follow-up questions the user might ask
5. Be concise but thorough

Format your response as JSON:
{
  "answer": "Your answer here",
  "sources": [
    {
      "quote": "Direct quote from page content",
      "relevance": 0.9
    }
  ],
  "followUpQuestions": ["Question 1?", "Question 2?", "Question 3?"]
}`;

    // Build messages array
    const messages: Array<{ role: string; content: string }> = [
      {
        role: "system",
        content: systemPrompt,
      },
    ];

    // Add previous messages if provided
    if (request.previousMessages && request.previousMessages.length > 0) {
      for (const msg of request.previousMessages) {
        messages.push({
          role: msg.role,
          content: msg.content,
        });
      }
    }

    // Add current question
    messages.push({
      role: "user",
      content: request.question,
    });

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-5-nano-2025-08-07",
        messages,
        max_completion_tokens: 2000,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content?.trim();

    if (!content) {
      throw new Error("No response from OpenAI");
    }

    // Parse JSON response
    const parsed = JSON.parse(content);

    // Extract sources and find their positions in page content
    const sources = (parsed.sources || []).map(
      (source: { quote: string; relevance: number }) => {
        const startIndex = request.pageContent.indexOf(source.quote);
        return {
          quote: source.quote,
          relevance: source.relevance,
          position:
            startIndex !== -1
              ? {
                  start: startIndex,
                  end: startIndex + source.quote.length,
                }
              : undefined,
        };
      },
    );

    const processingTime = performance.now() - startTime;

    console.log(
      `[Glotian Fallback] OpenAI Q&A complete: ${sources.length} sources in ${processingTime.toFixed(0)}ms`,
    );

    return {
      answer: parsed.answer || "I couldn't find that information on this page.",
      sources,
      followUpQuestions: (parsed.followUpQuestions || []).slice(0, 3),
      processingTime,
      aiSource: "openai",
    };
  } catch (error) {
    console.error("[Glotian Fallback] OpenAI Q&A error:", error);
    await logError("answerQuestionWithOpenAI", error as Error, { request });
    throw error;
  }
}

export async function answerQuestionWithGemini(
  request: QARequest,
): Promise<QAResponse> {
  const startTime = performance.now();

  console.log("[Glotian Fallback] Answering question with Gemini Flash");

  if (!GEMINI_API_KEY) {
    throw new Error("Gemini API key not configured");
  }

  try {
    const maxContentLength = 80000;
    const truncatedContent =
      request.pageContent.length > maxContentLength
        ? `${request.pageContent.substring(0, maxContentLength)}\n\n[Content truncated due to length...]`
        : request.pageContent;

    const prompt = `You are a helpful AI assistant that answers questions based on the content of a web page. Use only the provided page content.

Page URL: ${request.pageUrl}
Page Title: ${request.pageTitle}

Page Content:\n${truncatedContent}

Instructions:
1. Answer the user's question based ONLY on the page content above.
2. Include direct quotes from the page with short relevance notes.
3. If the answer is not present, respond with "I couldn't find that information on this page".
4. Suggest two or three follow-up questions.
5. Return a strict JSON object with the schema: {"answer": string, "sources": [{"quote": string, "relevance": number}], "followUpQuestions": string[] }.

User Question: ${request.question}`;

    const body = {
      contents: [
        {
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 2048,
      },
    };

    const geminiModel = "gemini-flash-lite-latest";
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const parts = data.candidates?.[0]?.content?.parts ?? [];
    const textResponse = parts
      .map((part: { text?: string }) => part?.text ?? "")
      .join("\n")
      .trim();

    if (!textResponse) {
      throw new Error("No response from Gemini");
    }

    let parsed: {
      answer: string;
      sources?: Array<{ quote: string; relevance: number }>;
      followUpQuestions?: string[];
    };

    try {
      const jsonMatch = textResponse.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { answer: textResponse };
    } catch (parseError) {
      console.warn("[Glotian Fallback] Gemini JSON parse error:", parseError);
      parsed = { answer: textResponse };
    }

    const sources = (parsed.sources || []).map((source) => {
      const startIndex = request.pageContent.indexOf(source.quote);
      return {
        quote: source.quote,
        relevance: source.relevance ?? 0.5,
        position:
          startIndex !== -1
            ? { start: startIndex, end: startIndex + source.quote.length }
            : undefined,
      };
    });

    const processingTime = performance.now() - startTime;

    console.log(
      `[Glotian Fallback] Gemini Q&A complete: ${sources.length} sources in ${processingTime.toFixed(0)}ms`,
    );

    return {
      answer: parsed.answer || "I couldn't find that information on this page.",
      sources,
      followUpQuestions: (parsed.followUpQuestions || []).slice(0, 3),
      processingTime,
      aiSource: "gemini",
    };
  } catch (error) {
    console.error("[Glotian Fallback] Gemini Q&A error:", error);
    await logError("answerQuestionWithGemini", error as Error, { request });
    throw error;
  }
}

/**
 * Extract text from image using OpenAI Vision API (GPT-4o)
 */
export async function extractTextWithOpenAI(
  imageData: string | Blob,
  language?: string,
): Promise<{
  extractedText: string;
  confidence: number;
  language: string;
  processingTime: number;
  aiSource: "openai-vision";
}> {
  const startTime = performance.now();

  console.log(
    "[Glotian Fallback] Extracting text from image with OpenAI Vision",
  );

  if (!OPENAI_API_KEY) {
    throw new Error("OpenAI API key not configured");
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

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-5-nano-2025-08-07",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Extract all text from this image. Return ONLY the extracted text, preserving line breaks and formatting.${language ? ` The text is likely in ${language}.` : ""}`,
              },
              {
                type: "image_url",
                image_url: {
                  url: dataUrl,
                },
              },
            ],
          },
        ],
        max_completion_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `OpenAI Vision API error: ${response.status} - ${errorText}`,
      );
    }

    const data = await response.json();
    const extractedText = data.choices[0]?.message?.content?.trim();

    if (!extractedText) {
      throw new Error("No text extracted from image");
    }

    const processingTime = performance.now() - startTime;

    console.log(
      `[Glotian Fallback] OpenAI Vision OCR complete in ${processingTime.toFixed(0)}ms`,
    );

    return {
      extractedText,
      confidence: 0.9, // OpenAI doesn't provide confidence score
      language: language || "auto-detected",
      processingTime,
      aiSource: "openai-vision",
    };
  } catch (error) {
    console.error("[Glotian Fallback] OpenAI Vision error:", error);
    await logError("extractTextWithOpenAI", error as Error, {
      imageData: typeof imageData,
      language,
    });
    throw error;
  }
}

/**
 * Transcribe audio using OpenAI Whisper API
 */
export async function transcribeAudioWithOpenAI(
  audioData: Blob,
  language?: string,
): Promise<{
  transcribedText: string;
  language: string;
  duration: number;
  processingTime: number;
  aiSource: "openai-whisper";
}> {
  const startTime = performance.now();

  console.log("[Glotian Fallback] Transcribing audio with OpenAI Whisper");

  if (!OPENAI_API_KEY) {
    throw new Error("OpenAI API key not configured");
  }

  try {
    // Check audio size (max 4MB for 2 minutes)
    if (audioData.size > 4 * 1024 * 1024) {
      throw new Error("Audio exceeds 4MB size limit (max 2 minutes)");
    }

    // Get audio duration
    const duration = await getAudioDuration(audioData);
    if (duration > 120) {
      throw new Error("Audio exceeds 2 minute duration limit");
    }

    // Create form data for multipart upload
    const formData = new FormData();
    formData.append("file", audioData, "audio.webm");
    formData.append("model", "whisper-1");
    if (language) {
      formData.append("language", language);
    }

    const response = await fetch(
      "https://api.openai.com/v1/audio/transcriptions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: formData,
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `OpenAI Whisper API error: ${response.status} - ${errorText}`,
      );
    }

    const data = await response.json();
    const transcribedText = data.text?.trim();

    if (!transcribedText) {
      throw new Error("No transcription returned from Whisper");
    }

    const processingTime = performance.now() - startTime;

    console.log(
      `[Glotian Fallback] OpenAI Whisper transcription complete in ${processingTime.toFixed(0)}ms`,
    );

    return {
      transcribedText,
      language: data.language || language || "auto-detected",
      duration,
      processingTime,
      aiSource: "openai-whisper",
    };
  } catch (error) {
    console.error("[Glotian Fallback] OpenAI Whisper error:", error);
    await logError("transcribeAudioWithOpenAI", error as Error, {
      audioSize: audioData.size,
      language,
    });
    throw error;
  }
}

/**
 * Helper: Convert Blob to base64 data URL
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
 * Helper: Get audio duration from Blob
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
