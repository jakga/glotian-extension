/**
 * Chrome runtime message router
 *
 * Handles 12 message types per messaging contract:
 * - CAPTURE_TEXT, CAPTURE_TEXT_OFFLINE, TRANSLATE_RESPONSE
 * - SUMMARIZE_PAGE, SUMMARIZE_RESPONSE
 * - PROOFREAD_TEXT, PROOFREAD_RESPONSE
 * - REWRITE_TEXT, REWRITE_RESPONSE
 * - ASK_QUESTION, ANSWER_QUESTION
 * - PROCESS_IMAGE, PROCESS_AUDIO, MULTIMODAL_RESPONSE
 * - SYNC_NOW, SYNC_STATUS
 * - AUTH_SUCCESS, AUTH_LOGOUT
 * - OPEN_SIDE_PANEL
 * - WEB_APP_SYNC
 */

import type { RuntimeMessage, QARequest, QAResponse } from "@/types";
import { supabase } from "@/lib/supabase";
import { db } from "@/lib/db/schema";
import { createCachedNote } from "@/lib/db/cache";
import { getSetting, setSetting, logError } from "@/lib/storage";
import { processSyncQueue } from "./sync";
import {
  answerQuestionWithGemini,
  answerQuestionWithOpenAI,
  proofreadWithOpenAI,
  rewriteWithOpenAI,
} from "@/lib/ai/fallback";
import { getAISupport } from "@/lib/ai/detect";
import { validatePageContent } from "@/lib/ai/summarize";
import { logActivity } from "@/lib/db/activity-log";
import { translate } from "@/lib/ai/translate";
import { autoTag } from "@/lib/ai/auto-tag";
import {
  ensureSupportedSourceLanguage,
  ensureSupportedTargetLanguage,
  getDefaultLanguagePreferences,
} from "@/lib/language";
import type { Note } from "@/types";

// Helper types for note operations
type NoteDraft = Omit<Note, "id" | "user_id" | "created_at" | "updated_at">  & { user_id?: string };
type SupabaseLearningNote = Note;

// Helper functions for note transformation
function fromSupabaseNote(note: SupabaseLearningNote): Note {
  return note;
}

function noteDraftToSupabasePayload(draft: NoteDraft): Partial<Note> {
  return {
    ...draft,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}
import {
  proofreadWithTimeout,
  ProofreadError,
  isProofreaderAvailable,
} from "@/lib/ai/proofreader";
import {
  rewriteWithTimeout,
  RewriteError,
  isRewriterAvailable,
} from "@/lib/ai/rewriter";
import type { SummarizeRequest, SummarizeResponse } from "@/lib/ai/summarizer";
import { runOffscreenTask } from "./offscreen";

/**
 * Web app sync event structure
 * Used for handling sync messages from the web app via WEB_APP_SYNC message type
 */
interface WebAppSyncEvent {
  type: string;
  note?: any;
  noteId?: string;
  deck?: any;
  deckId?: string;
  flashcard?: any;
  flashcardId?: string;
}

/**
 * Maximum page content length for Q&A processing
 * Longer content will be auto-summarized to improve performance
 * Task: T114
 */
const MAX_PAGE_CONTENT_LENGTH = 10000;

export function setupMessageHandlers(): void {
  chrome.runtime.onMessage.addListener(
    (message: RuntimeMessage, sender, sendResponse) => {
      console.log("[Glotian Messaging] Received message:", message.type);

      // Handle different message types
      switch (message.type) {
        case "CAPTURE_TEXT":
          handleCaptureText(message, sender, sendResponse);
          return true; // Keep channel open for async response

        case "CAPTURE_TEXT_OFFLINE":
          handleCaptureTextOffline(message, sender, sendResponse);
          return true;

        case "SUMMARIZE_PAGE":
          handleSummarizePage(message, sender, sendResponse);
          return true;

        case "SAVE_SUMMARY_NOTE":
          handleSaveSummaryNote(message, sendResponse);
          return true;

        case "PROOFREAD_TEXT":
          handleProofreadText(message, sender, sendResponse);
          return true;

        case "REWRITE_TEXT":
          handleRewriteText(message, sender, sendResponse);
          return true;

        case "ASK_QUESTION":
          handleAskQuestion(message, sender, sendResponse);
          return true;

        case "PROCESS_IMAGE":
        case "PROCESS_AUDIO":
          handleMultimodal(message, sender, sendResponse);
          return true;

        case "SYNC_NOW":
          handleSyncNow(sender, sendResponse);
          return true;

        case "AUTH_SUCCESS":
          handleAuthSuccess(message, sender, sendResponse);
          return true;

        case "AUTH_LOGOUT":
          handleAuthLogout(sender, sendResponse);
          return true;

        case "OPEN_SIDE_PANEL":
          handleOpenSidePanel(message, sender, sendResponse);
          return true;

        case "WEB_APP_SYNC":
          handleWebAppSync(message, sender, sendResponse);
          return true;

        default:
          console.warn(
            "[Glotian Messaging] Unknown message type:",
            (message as any).type,
          );
          sendResponse({ error: "Unknown message type" });
          return false;
      }
    },
  );

  console.log("[Glotian Messaging] Message handlers setup complete");
}

// Handler implementations (placeholders for now, will be implemented in Phase 3)

async function handleCaptureText(
  message: Extract<RuntimeMessage, { type: "CAPTURE_TEXT" }>,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: any) => void,
): Promise<void> {
  try {
    console.log("[Glotian Messaging] Handling CAPTURE_TEXT");

    const userId = await getSetting("userId");
    if (!userId) {
      sendResponse({
        error: "Please log in to use translation",
      });
      return;
    }

    // Translate the text via side panel (Chrome AI only works in side panel context)
    const defaults = getDefaultLanguagePreferences();
    const storedSourceLanguage = await getSetting("sourceLanguage");
    const storedTargetLanguage = await getSetting("targetLanguage");

    const sourceLanguage = ensureSupportedSourceLanguage(
      storedSourceLanguage,
      defaults.sourceLanguage,
    );
    const targetLanguage = ensureSupportedTargetLanguage(
      storedTargetLanguage,
      defaults.targetLanguage,
    );

    console.log(
      `[Glotian Messaging] Requesting translation from side panel: ${sourceLanguage} → ${targetLanguage}`,
    );

    // Send translation request to side panel
    const response = await chrome.runtime.sendMessage({
      type: "TRANSLATE_REQUEST",
      request: {
        text: message.selection,
        sourceLang: sourceLanguage,
        targetLang: targetLanguage,
      },
    });

    if (!response || !response.success) {
      throw new Error(response?.error || "Translation failed in side panel");
    }

    const result = response.result;
    const resolvedSourceLanguage =
      result?.detectedLanguage ||
      (sourceLanguage === "auto" ? "en" : sourceLanguage);

    // Auto-tag the note
    const tags = await autoTag({
      text: message.selection,
      language: resolvedSourceLanguage,
    });

    // Send translation response to content script for snackbar
    if (sender.tab?.id) {
      chrome.tabs.sendMessage(sender.tab.id, {
        type: "TRANSLATE_RESPONSE",
        noteId: message.noteId,
        originalText: message.selection,
        translatedText: result.translatedText,
        tags: tags.tags || [],
      });
    }

    // Create note in IndexedDB
    const noteTitle =
      message.selection.length > 80
        ? `${message.selection.substring(0, 77)}…`
        : message.selection;

    const note = await createCachedNote(userId as string, {
      title: noteTitle,
      content: JSON.stringify({
        originalText: message.selection,
        translatedText: result.translatedText,
        sourceLanguage: resolvedSourceLanguage,
        targetLanguage,
        grammar: result.grammarExplanation,
        alternatives: result.alternativeExpressions,
      }),
      tags: tags.tags || [],
      sourceType: "extension",
      sourceUrl: message.pageUrl || null,
    });

    // Log activity
    await logActivity(userId as string, "note_created", {
      entityType: "learning_note",
      entityId: note.id,
      metadata: {
        sourceLanguage: resolvedSourceLanguage,
        targetLanguage,
        textLength: message.selection.length,
      },
    });

    sendResponse({
      success: true,
      noteId: note.id,
      translatedText: result.translatedText,
    });
  } catch (error) {
    console.error("[Glotian Messaging] Error handling CAPTURE_TEXT:", error);
    await logError("handleCaptureText", error as Error, {
      messageType: message.type,
    });

    // Send error to content script
    if (sender.tab?.id) {
      chrome.tabs.sendMessage(sender.tab.id, {
        type: "TRANSLATE_RESPONSE",
        noteId: message.noteId,
        error: (error as Error).message,
      });
    }

    sendResponse({
      success: false,
      error: (error as Error).message,
    });
  }
}

async function handleCaptureTextOffline(
  message: Extract<RuntimeMessage, { type: "CAPTURE_TEXT_OFFLINE" }>,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: any) => void,
): Promise<void> {
  try {
    console.log("[Glotian Messaging] Handling CAPTURE_TEXT_OFFLINE");

    const userId = await getSetting("userId");
    if (!userId) {
      sendResponse({
        success: false,
        noteId: message.noteId,
        error: "User not authenticated. Please login first.",
      });
      return;
    }

    const noteId = message.noteId ?? crypto.randomUUID();
    const trimmedSelection = message.selection.trim();
    const truncatedSelection =
      trimmedSelection.length > 80
        ? `${trimmedSelection.slice(0, 77)}…`
        : trimmedSelection;
    const noteTitle = message.pageTitle
      ? `Offline capture: ${message.pageTitle}`
      : truncatedSelection || "Offline capture";

    const noteDraft: NoteDraft = {
      userId,
      title: noteTitle,
      content: message.selection,
      tags: ["offline"],
      sourceType: "extension",
      sourceUrl: message.pageUrl || null,
    };

    const note = await createCachedNote(userId, {
      id: noteId,
      ...noteDraft,
    });

    const payload = noteDraftToSupabasePayload(noteDraft, {
      timestamp: note.createdAt,
    });

    await db.syncQueue.add({
      operation: "create",
      table: "learning_notes",
      entityId: note.id,
      payload,
      timestamp: Date.now(),
      retryCount: 0,
      lastAttempt: null,
      error: null,
    });

    await logActivity(userId, "note_created", {
      entityType: "learning_note",
      entityId: note.id,
      metadata: {
        offline: true,
        pageUrl: message.pageUrl,
        pageTitle: message.pageTitle,
        textLength: message.selection.length,
      },
    });

    sendResponse({ success: true, noteId: note.id, offline: true });
  } catch (error) {
    console.error(
      "[Glotian Messaging] Error handling CAPTURE_TEXT_OFFLINE:",
      error,
    );
    await logError("handleCaptureTextOffline", error as Error, {
      messageType: message.type,
      pageUrl: message.pageUrl,
    });
    sendResponse({
      success: false,
      noteId: message.noteId,
      error: (error as Error).message,
    });
  }
}

async function handleSummarizePage(
  message: Extract<RuntimeMessage, { type: "SUMMARIZE_PAGE" }>,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: any) => void,
): Promise<void> {
  try {
    console.log("[Glotian Messaging] Handling SUMMARIZE_PAGE");

    // Validate content
    const validation = validatePageContent(message.pageContent);
    if (!validation.valid) {
      sendResponse({
        type: "SUMMARIZE_RESPONSE",
        summary: "",
        originalText: "",
        processingTime: 0,
        aiSource: "chrome",
        error: validation.error,
      });
      return;
    }

    const pageTitle = message.pageTitle || sender.tab?.title || "Untitled";
    const { sourceLanguage, targetLanguage } = await chrome.storage.local.get([
      "sourceLanguage",
      "targetLanguage",
    ]);

    const summarizeRequest: SummarizeRequest = {
      pageContent: message.pageContent,
      pageUrl: message.pageUrl,
      pageTitle,
      cefrLevel: message.cefrLevel,
      sourceLanguage: sourceLanguage || "en",
      targetLanguage: targetLanguage || "ko",
    };

    const result = await runOffscreenTask<SummarizeResponse>("summarize", {
      request: summarizeRequest,
      timeoutMs: 45000,
    });

    console.log(
      "[Glotian Messaging] Summary generated:",
      pageTitle,
      `(${result.processingTime.toFixed(0)}ms)`,
    );

    sendResponse({
      type: "SUMMARIZE_RESPONSE",
      summary: result.summary,
      originalText: result.originalText,
      processingTime: result.processingTime,
      aiSource: result.aiSource,
      error: undefined,
    });
  } catch (error) {
    console.error("[Glotian Messaging] Error handling SUMMARIZE_PAGE:", error);
    await logError("handleSummarizePage", error as Error, {
      messageType: message.type,
      pageUrl: message.pageUrl,
      contentLength: message.pageContent?.length,
    });
    sendResponse({
      type: "SUMMARIZE_RESPONSE",
      summary: "",
      originalText: "",
      processingTime: 0,
      aiSource: "chrome",
      error:
        error instanceof Error
          ? error.message
          : "Summarization failed. Please try again.",
    });
  }
}

async function handleSaveSummaryNote(
  message: Extract<RuntimeMessage, { type: "SAVE_SUMMARY_NOTE" }>,
  sendResponse: (response?: any) => void,
): Promise<void> {
  try {
    const { userId } = await chrome.storage.local.get(["userId"]);

    if (!userId) {
      sendResponse({
        success: false,
        error: "User not authenticated. Please login first.",
      });
      return;
    }

    const noteId = crypto.randomUUID();
    const now = new Date().toISOString();

    const summaryTitle = `Summary: ${message.pageTitle || "Untitled"}`;

    const bodyParts = [message.originalText?.trim() ?? ""];
    if (message.translation?.trim()) {
      bodyParts.push("", "Translation:", message.translation.trim());
    }
    const summaryBody = bodyParts.filter(Boolean).join("\n");

    const detailSegments = [`Summary:\n${message.summary.trim()}`];
    if (message.simplifiedSummary?.trim()) {
      const levelLabel = message.cefrLevel ? message.cefrLevel : "N/A";
      detailSegments.push(
        `Simplified (${levelLabel}):\n${message.simplifiedSummary.trim()}`,
      );
    }
    if (message.translation?.trim()) {
      detailSegments.push(`Translation:\n${message.translation.trim()}`);
    }
    const summaryDetails = detailSegments.join("\n\n");

    const tags = ["summary", "webpage"];
    if (message.cefrLevel) {
      tags.push(`cefr-${message.cefrLevel.toLowerCase()}`);
    }

    const summaryDraft: NoteDraft = {
      userId,
      title: summaryTitle,
      content: summaryBody,
      summary: summaryDetails,
      tags,
      sourceType: "extension",
      sourceUrl: message.pageUrl,
    };

    await createCachedNote(userId, {
      id: noteId,
      ...summaryDraft,
      createdAt: now,
      updatedAt: now,
    });

    const summaryPayload = noteDraftToSupabasePayload(summaryDraft, {
      timestamp: now,
    });

    await db.syncQueue.add({
      operation: "create",
      table: "learning_notes",
      entityId: noteId,
      payload: summaryPayload,
      timestamp: Date.now(),
      retryCount: 0,
      lastAttempt: null,
      error: null,
    });

    await db.activityLog.add({
      userId,
      action: "page_summarized",
      entityType: "learning_note",
      entityId: noteId,
      metadata: {
        pageUrl: message.pageUrl,
        pageTitle: message.pageTitle,
        cefrLevel: message.cefrLevel ?? null,
        hasSimplified: Boolean(message.simplifiedSummary),
        hasTranslation: Boolean(message.translation),
      },
      timestamp: Date.now(),
      syncStatus: "pending",
    });

    console.log(
      "[Glotian Messaging] Saved summary note:",
      noteId,
      `(${message.pageTitle || "Untitled"})`,
    );

    sendResponse({ success: true, noteId });
  } catch (error) {
    console.error("[Glotian Messaging] Error saving summary note:", error);
    await logError("handleSaveSummaryNote", error as Error, {
      pageUrl: message.pageUrl,
      pageTitle: message.pageTitle,
    });
    sendResponse({
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to save summary note.",
    });
  }
}

/**
 * Handle PROOFREAD_TEXT message
 * Task: T081, T082
 */
async function handleProofreadText(
  message: Extract<RuntimeMessage, { type: "PROOFREAD_TEXT" }>,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: any) => void,
): Promise<void> {
  try {
    console.log("[Glotian Messaging] Handling PROOFREAD_TEXT");

    const { text, language } = message;

    if (!text || text.trim().length === 0) {
      sendResponse({
        corrections: [],
        error: "No text provided",
      });
      return;
    }

    // Try Chrome Built-in AI first
    let result;
    try {
      const available = await isProofreaderAvailable();

      if (available) {
        console.log("[Glotian Messaging] Using Chrome Proofreader API");
        result = await proofreadWithTimeout(
          {
            text,
            language: language || "en",
          },
          10000,
        );
      } else {
        throw new ProofreadError(
          "Chrome Proofreader not available",
          "API_UNAVAILABLE",
          false,
        );
      }
    } catch (error) {
      // Fallback to server API
      console.log(
        "[Glotian Messaging] Chrome Proofreader failed, falling back to OpenAI",
      );

      if (error instanceof ProofreadError && error.code === "API_UNAVAILABLE") {
        result = await proofreadWithOpenAI({
          text,
          language: language || "en",
        });
      } else {
        throw error;
      }
    }

    // Log activity
    const userId = await getSetting("userId");
    if (userId) {
      await logActivity(userId, "coach_fix_applied", {
        metadata: {
          textLength: text.length,
          correctionsCount: result.corrections.length,
          language: language || "en",
          processingTime: result.processingTime,
          aiSource: result.aiSource,
        },
      });
    }

    // Send response
    sendResponse({
      corrections: result.corrections,
      processingTime: result.processingTime,
      aiSource: result.aiSource,
    });

    console.log(
      `[Glotian Messaging] Proofreading complete: ${result.corrections.length} corrections`,
    );
  } catch (error) {
    console.error("[Glotian Messaging] Error handling PROOFREAD_TEXT:", error);
    await logError("handleProofreadText", error as Error, {
      messageType: message.type,
      textLength: message.text?.length,
      language: message.language,
    });
    const errorMessage =
      error instanceof ProofreadError && error.code === "API_UNAVAILABLE"
        ? "Writing coach check not available. Enable Chrome AI or configure server fallback."
        : error instanceof Error && error.message
          ? error.message
          : typeof error === "string" && error.length > 0
            ? error
            : "Unknown proofreading error";
    sendResponse({
      corrections: [],
      error: errorMessage,
    });
  }
}

/**
 * Handle REWRITE_TEXT message
 * Task: T087, T088
 */
async function handleRewriteText(
  message: Extract<RuntimeMessage, { type: "REWRITE_TEXT" }>,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: any) => void,
): Promise<void> {
  try {
    console.log("[Glotian Messaging] Handling REWRITE_TEXT");

    const { text, tone, length } = message;

    if (!text || text.trim().length === 0) {
      sendResponse({
        rewrittenText: "",
        alternatives: [],
        learningExpressions: [],
        error: "No text provided",
      });
      return;
    }

    // Try Chrome Built-in AI first
    let result;
    try {
      const available = await isRewriterAvailable();

      if (available) {
        console.log("[Glotian Messaging] Using Chrome Rewriter API");
        result = await rewriteWithTimeout(
          {
            text,
            tone: tone as any,
            length: length as any,
            language: "en",
          },
          10000,
        );
      } else {
        throw new RewriteError(
          "Chrome Rewriter not available",
          "API_UNAVAILABLE",
          false,
        );
      }
    } catch (error) {
      // Fallback to server API
      console.log(
        "[Glotian Messaging] Chrome Rewriter failed, falling back to OpenAI",
      );

      if (error instanceof RewriteError && error.code === "API_UNAVAILABLE") {
        result = await rewriteWithOpenAI({
          text,
          tone: tone as any,
          length: length as any,
          language: "en",
        });
      } else {
        throw error;
      }
    }

    const rewrittenText =
      typeof result?.rewrittenText === "string" &&
      result.rewrittenText.trim().length > 0
        ? result.rewrittenText
        : text;
    const alternatives = Array.isArray(result?.alternatives)
      ? result.alternatives.filter(
          (alt: unknown): alt is string => typeof alt === "string",
        )
      : [];
    const learningExpressions = Array.isArray(result?.learningExpressions)
      ? result.learningExpressions
      : [];
    const processingTime =
      typeof result?.processingTime === "number" ? result.processingTime : 0;
    const aiSource =
      result?.aiSource === "openai" || result?.aiSource === "chrome"
        ? result.aiSource
        : "chrome";

    // Log activity
    const userId = await getSetting("userId");
    if (userId) {
      await logActivity(userId, "coach_fix_applied", {
        metadata: {
          textLength: text.length,
          tone: tone || "neutral",
          length: length || "same",
          alternativesCount: alternatives.length,
          learningExpressionsCount: learningExpressions.length,
          language: "en",
          processingTime,
          aiSource,
        },
      });
    }

    // Send response
    sendResponse({
      rewrittenText,
      alternatives,
      learningExpressions,
      processingTime,
      aiSource,
    });

    console.log(
      `[Glotian Messaging] Rewriting complete: ${alternatives.length} alternatives`,
    );
  } catch (error) {
    console.error("[Glotian Messaging] Error handling REWRITE_TEXT:", error);
    await logError("handleRewriteText", error as Error, {
      messageType: message.type,
      textLength: message.text?.length,
      tone: message.tone,
      length: message.length,
    });
    const errorMessage =
      error instanceof RewriteError && error.code === "API_UNAVAILABLE"
        ? "Writing coach rewrite not available. Enable Chrome AI or configure server fallback."
        : error instanceof Error && error.message
          ? error.message
          : typeof error === "string" && error.length > 0
            ? error
            : "Unknown rewrite error";
    sendResponse({
      rewrittenText: "",
      alternatives: [],
      learningExpressions: [],
      error: errorMessage,
    });
  }
}

async function handleAskQuestion(
  message: Extract<RuntimeMessage, { type: "ASK_QUESTION" }>,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: any) => void,
): Promise<void> {
  try {
    console.log("[Glotian Messaging] Handling ASK_QUESTION");

    // Validate inputs
    if (!message.question || message.question.trim().length < 5) {
      throw new Error("Question must be at least 5 characters");
    }

    if (message.question.length > 500) {
      throw new Error("Question exceeds 500 character limit");
    }

    if (!message.pageContent || message.pageContent.trim().length < 100) {
      throw new Error(
        "Page content too short. Must be at least 100 characters.",
      );
    }

    // Handle pages > MAX_PAGE_CONTENT_LENGTH - auto-summarize first (T114)
    let pageContent = message.pageContent;
    if (pageContent.length > MAX_PAGE_CONTENT_LENGTH) {
      console.log(
        `[Glotian Messaging] Page content exceeds ${MAX_PAGE_CONTENT_LENGTH} chars (${pageContent.length}), summarizing first...`,
      );

      try {
        const summary = await runOffscreenTask<string>("summarize-content", {
          content: pageContent,
        });
        pageContent = summary;

        console.log(
          `[Glotian Messaging] Summarized page content from ${message.pageContent.length} to ${pageContent.length} chars`,
        );
      } catch (error) {
        console.warn(
          "[Glotian Messaging] Failed to summarize long page content, truncating:",
          error,
        );
        // Fallback: just truncate to MAX_PAGE_CONTENT_LENGTH
        pageContent = pageContent.substring(0, MAX_PAGE_CONTENT_LENGTH) + "...";
      }
    }

    // Build Q&A request
    const request: QARequest = {
      question: message.question.trim(),
      pageContent,
      pageUrl: message.pageUrl || "unknown",
      pageTitle: message.pageTitle || "Untitled",
      previousMessages: message.previousMessages,
    };

    // Check AI support
    const aiSupport = await getAISupport();

    let response: QAResponse | null = null;

    // Try Chrome AI first via offscreen task (T107)
    if (aiSupport.prompt) {
      try {
        const promptResponse = await runOffscreenTask<QAResponse>("qa", {
          request,
        });
        if (promptResponse.answer && promptResponse.answer.trim().length > 0) {
          response = promptResponse;
        } else {
          console.warn(
            "[Glotian Messaging] Chrome Prompt API returned empty answer, attempting Gemini fallback",
          );
        }
      } catch (error) {
        console.warn(
          "[Glotian Messaging] Chrome Prompt API failed, attempting Gemini fallback:",
          error,
        );
      }
    } else {
      console.log(
        "[Glotian Messaging] Chrome Prompt API not available, using fallbacks",
      );
    }

    if (!response) {
      try {
        const geminiResponse = await answerQuestionWithGemini(request);
        if (geminiResponse.answer && geminiResponse.answer.trim().length > 0) {
          response = geminiResponse;
        } else {
          console.warn(
            "[Glotian Messaging] Gemini fallback returned empty answer, using OpenAI",
          );
        }
      } catch (error) {
        console.warn(
          "[Glotian Messaging] Gemini fallback failed, using OpenAI:",
          error,
        );
      }
    }

    if (!response) {
      response = await answerQuestionWithOpenAI(request);
    }

    // Log activity
    const userId = await getSetting("userId");
    if (userId) {
      await db.activityLog.add({
        userId,
        action: "qa_asked",
        entityType: "qa_exchange",
        entityId: null,
        metadata: {
          question: message.question,
          pageUrl: message.pageUrl,
          aiSource: response.aiSource,
          processingTime: response.processingTime,
        },
        timestamp: Date.now(),
        syncStatus: "pending",
      });
    }

    // Send ANSWER_QUESTION response (T108)
    sendResponse({
      type: "ANSWER_QUESTION",
      answer: response.answer,
      sources: response.sources,
      followUpQuestions: response.followUpQuestions,
      error: undefined,
    });

    console.log(
      `[Glotian Messaging] Q&A complete: ${response.sources.length} sources in ${response.processingTime.toFixed(0)}ms using ${response.aiSource}`,
    );
  } catch (error) {
    console.error("[Glotian Messaging] Error handling ASK_QUESTION:", error);
    await logError("handleAskQuestion", error as Error, {
      messageType: message.type,
      questionLength: message.question?.length,
      contentLength: message.pageContent?.length,
      pageUrl: message.pageUrl,
    });

    sendResponse({
      type: "ANSWER_QUESTION",
      answer: "",
      sources: [],
      followUpQuestions: [],
      error: (error as Error).message,
    });
  }
}

async function handleMultimodal(
  message: Extract<RuntimeMessage, { type: "PROCESS_IMAGE" | "PROCESS_AUDIO" }>,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: any) => void,
): Promise<void> {
  try {
    console.log("[Glotian Messaging] Handling", message.type);
    // TODO: Implement in Phase 7
    sendResponse({
      type: "MULTIMODAL_RESPONSE",
      text: "",
      error: "Not implemented yet",
    });
  } catch (error) {
    console.error(`[Glotian Messaging] Error handling ${message.type}:`, error);
    sendResponse({
      type: "MULTIMODAL_RESPONSE",
      text: "",
      error: (error as Error).message,
    });
  }
}

async function handleSyncNow(
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: any) => void,
): Promise<void> {
  try {
    console.log("[Glotian Messaging] Handling SYNC_NOW");
    const userId = await getSetting("userId");

    if (!userId) {
      sendResponse({
        type: "SYNC_STATUS",
        pendingCount: 0,
        syncedCount: 0,
        failedCount: 0,
        lastSyncTime: null,
      });
      return;
    }

    await processSyncQueue(userId);

    // Get updated sync status
    const pendingCount = await db.syncQueue.count();
    const failedCount = await db.syncQueue.where("retryCount").above(0).count();
    const lastSyncTime = await getSetting("lastSyncTime");

    sendResponse({
      type: "SYNC_STATUS",
      pendingCount,
      syncedCount: 0, // TODO: Track this
      failedCount,
      lastSyncTime,
    });
  } catch (error) {
    console.error("[Glotian Messaging] Error handling SYNC_NOW:", error);
    await logError("handleSyncNow", error as Error);
    sendResponse({
      type: "SYNC_STATUS",
      pendingCount: 0,
      syncedCount: 0,
      failedCount: 0,
      lastSyncTime: null,
    });
  }
}

async function handleAuthSuccess(
  message: Extract<RuntimeMessage, { type: "AUTH_SUCCESS" }>,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: any) => void,
): Promise<void> {
  try {
    console.log(
      "[Glotian Messaging] Handling AUTH_SUCCESS for user:",
      message.userId,
    );
    await setSetting("userId", message.userId);
    await setSetting("supabaseSession", message.session);
    sendResponse({ success: true });
  } catch (error) {
    console.error("[Glotian Messaging] Error handling AUTH_SUCCESS:", error);
    await logError("handleAuthSuccess", error as Error, {
      userId: message.userId,
    });
    sendResponse({ success: false, error: (error as Error).message });
  }
}

async function handleAuthLogout(
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: any) => void,
): Promise<void> {
  try {
    console.log("[Glotian Messaging] Handling AUTH_LOGOUT");
    await supabase.auth.signOut();
    await setSetting("userId", null);
    await setSetting("supabaseSession", null);

    // Clear local data
    await db.notes.clear();
    await db.flashcards.clear();
    await db.decks.clear();
    await db.syncQueue.clear();
    await db.activityLog.clear();

    sendResponse({ success: true });
  } catch (error) {
    console.error("[Glotian Messaging] Error handling AUTH_LOGOUT:", error);
    await logError("handleAuthLogout", error as Error);
    sendResponse({ success: false, error: (error as Error).message });
  }
}

async function handleOpenSidePanel(
  message: Extract<RuntimeMessage, { type: "OPEN_SIDE_PANEL" }>,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: any) => void,
): Promise<void> {
  try {
    console.log("[Glotian Messaging] Handling OPEN_SIDE_PANEL");

    const extensionOrigin = chrome.runtime.getURL("");
    const sentFromExtensionUI =
      typeof sender.url === "string" &&
      sender.url.startsWith(extensionOrigin) &&
      sender.url.includes("/popup/");

    if (!message.openedBySender && !sentFromExtensionUI) {
      // Determine target tab or window for background-triggered openings
      let targetTabId = sender.tab?.id;

      if (typeof targetTabId !== "number") {
        const [activeTab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        targetTabId = activeTab?.id;
      }

      if (typeof targetTabId === "number") {
        await chrome.sidePanel.open({ tabId: targetTabId });
      } else {
        const currentWindow = await chrome.windows.getCurrent();
        if (typeof currentWindow.id === "number") {
          await chrome.sidePanel.open({ windowId: currentWindow.id });
        } else {
          throw new Error("Unable to determine active window for side panel.");
        }
      }
    }

    // Save last tab preference
    const allowedTabs = ["capture", "summarize", "qa", "media", "activity"];
    if (message.tab && allowedTabs.includes(message.tab)) {
      await setSetting("sidePanelLastTab", message.tab as any);
    }

    sendResponse({ success: true });
  } catch (error) {
    console.error("[Glotian Messaging] Error handling OPEN_SIDE_PANEL:", error);
    await logError("handleOpenSidePanel", error as Error);
    sendResponse({ success: false, error: (error as Error).message });
  }
}

async function handleWebAppSync(
  message: Extract<RuntimeMessage, { type: "WEB_APP_SYNC" }>,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: any) => void,
): Promise<void> {
  try {
    const syncEvent = message.syncEvent as WebAppSyncEvent;

    console.log("[Glotian Messaging] Handling WEB_APP_SYNC:", syncEvent.type);

    // Update local cache based on sync event type
    const eventType = syncEvent.type;

    if (
      eventType.includes("NOTE_CREATED") ||
      eventType.includes("NOTE_UPDATED")
    ) {
      if (syncEvent.note) {
        const notePayload =
          "original_text" in (syncEvent.note as Record<string, unknown>)
            ? fromSupabaseNote(syncEvent.note as SupabaseLearningNote)
            : (syncEvent.note as NoteRecord);

        await db.notes.put({
          ...notePayload,
          syncStatus: "synced" as const,
          lastAccessedAt: Date.now(),
        });
        console.log(
          `[Glotian Messaging] Updated note in cache: ${syncEvent.noteId || "unknown"}`,
        );
      }
    } else if (eventType.includes("NOTE_DELETED")) {
      if (syncEvent.noteId) {
        await db.notes.delete(syncEvent.noteId);
        console.log(
          `[Glotian Messaging] Deleted note from cache: ${syncEvent.noteId}`,
        );
      }
    } else if (
      eventType.includes("DECK_CREATED") ||
      eventType.includes("DECK_UPDATED")
    ) {
      if (syncEvent.deck) {
        await db.decks.put({
          ...syncEvent.deck,
          syncStatus: "synced" as const,
          lastAccessedAt: Date.now(),
        });
        console.log(
          `[Glotian Messaging] Updated deck in cache: ${syncEvent.deckId || "unknown"}`,
        );
      }
    } else if (eventType.includes("DECK_DELETED")) {
      if (syncEvent.deckId) {
        await db.decks.delete(syncEvent.deckId);
        console.log(
          `[Glotian Messaging] Deleted deck from cache: ${syncEvent.deckId}`,
        );
      }
    } else if (
      eventType.includes("FLASHCARD_CREATED") ||
      eventType.includes("FLASHCARD_UPDATED")
    ) {
      if (syncEvent.flashcard) {
        await db.flashcards.put({
          ...syncEvent.flashcard,
          syncStatus: "synced" as const,
          lastAccessedAt: Date.now(),
        });
        console.log(
          `[Glotian Messaging] Updated flashcard in cache: ${syncEvent.flashcardId || "unknown"}`,
        );
      }
    } else if (eventType.includes("FLASHCARD_DELETED")) {
      if (syncEvent.flashcardId) {
        await db.flashcards.delete(syncEvent.flashcardId);
        console.log(
          `[Glotian Messaging] Deleted flashcard from cache: ${syncEvent.flashcardId}`,
        );
      }
    } else if (eventType.includes("BULK_SYNC")) {
      console.log(`[Glotian Messaging] Bulk sync event received`);
      // For bulk sync, trigger a full sync from background worker
      const userId = await getSetting("userId");
      if (userId) {
        await processSyncQueue(userId);
      }
    } else {
      console.warn("[Glotian Messaging] Unknown sync event type:", eventType);
    }

    // Notify side panel to refresh UI (if open)
    chrome.runtime
      .sendMessage({
        type: "CACHE_UPDATED",
        entity: eventType.includes("NOTE")
          ? "note"
          : eventType.includes("DECK")
            ? "deck"
            : "flashcard",
      })
      .catch(() => {
        // Side panel may not be open, ignore error
      });

    sendResponse({ success: true });
  } catch (error) {
    console.error("[Glotian Messaging] Error handling WEB_APP_SYNC:", error);
    await logError("handleWebAppSync", error as Error, {
      eventType: (message.syncEvent as WebAppSyncEvent)?.type,
    });
    sendResponse({ success: false, error: (error as Error).message });
  }
}
