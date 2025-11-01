/**
 * Q&A Session Manager
 *
 * Manages chat history, context window, and session state for page-based Q&A
 */

import type { QARequest, QAResponse } from "@/types";
import { answerQuestionWithPrompt, detectOutputLanguage } from "./prompt";
import { answerQuestionWithGemini, answerQuestionWithOpenAI } from "./fallback";
import { getAISupport } from "./detect";
import { logError } from "@/lib/storage";

export interface QASessionMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  sources?: QAResponse["sources"];
}

export interface QASession {
  id: string;
  pageUrl: string;
  pageTitle: string;
  pageContent: string;
  messages: QASessionMessage[];
  createdAt: number;
  updatedAt: number;
}

// In-memory session store (keyed by tab ID or session ID)
const sessions = new Map<string, QASession>();

// Flag to gate the Chrome Prompt API (currently enabled for English-only questions)
const ENABLE_PROMPT_QA = true;

// Maximum number of messages to keep in history (for context window management)
const MAX_HISTORY_SIZE = 10;

// Maximum page content size (10k chars)
const MAX_CONTENT_SIZE = 10000;

/**
 * Create a new Q&A session for a page
 *
 * @param pageUrl - URL of the page
 * @param pageTitle - Title of the page
 * @param pageContent - Main content of the page (will be truncated if > 10k chars)
 * @returns Session ID
 */
export function createSession(
  pageUrl: string,
  pageTitle: string,
  pageContent: string,
): string {
  const sessionId = generateSessionId();

  // Truncate content if too long
  let content = pageContent;
  if (content.length > MAX_CONTENT_SIZE) {
    console.warn(
      `[QA Session] Page content exceeds ${MAX_CONTENT_SIZE} chars, truncating`,
    );
    content = content.substring(0, MAX_CONTENT_SIZE) + "...";
  }

  const session: QASession = {
    id: sessionId,
    pageUrl,
    pageTitle,
    pageContent: content,
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  sessions.set(sessionId, session);

  console.log(`[QA Session] Created session ${sessionId} for ${pageUrl}`);

  return sessionId;
}

/**
 * Get an existing session by ID
 *
 * @param sessionId - Session ID
 * @returns Session or null if not found
 */
export function getSession(sessionId: string): QASession | null {
  return sessions.get(sessionId) || null;
}

/**
 * Update session page context (when user navigates to a new page)
 *
 * @param sessionId - Session ID
 * @param pageUrl - New page URL
 * @param pageTitle - New page title
 * @param pageContent - New page content
 * @param clearHistory - Whether to clear chat history (default: true)
 */
export function updateSessionContext(
  sessionId: string,
  pageUrl: string,
  pageTitle: string,
  pageContent: string,
  clearHistory = true,
): void {
  const session = sessions.get(sessionId);

  if (!session) {
    console.error(`[QA Session] Session ${sessionId} not found`);
    return;
  }

  // Truncate content if too long
  let content = pageContent;
  if (content.length > MAX_CONTENT_SIZE) {
    console.warn(
      `[QA Session] Page content exceeds ${MAX_CONTENT_SIZE} chars, truncating`,
    );
    content = content.substring(0, MAX_CONTENT_SIZE) + "...";
  }

  session.pageUrl = pageUrl;
  session.pageTitle = pageTitle;
  session.pageContent = content;
  session.updatedAt = Date.now();

  if (clearHistory) {
    session.messages = [];
    console.log(`[QA Session] Cleared history for session ${sessionId}`);
  }

  console.log(`[QA Session] Updated context for session ${sessionId}`);
}

/**
 * Ask a question in a session
 *
 * @param sessionId - Session ID
 * @param question - User's question
 * @returns AI-generated answer with sources
 */
export async function askQuestion(
  sessionId: string,
  question: string,
): Promise<QAResponse> {
  const session = sessions.get(sessionId);

  if (!session) {
    throw new Error(`Session ${sessionId} not found`);
  }

  console.log(`[QA Session] Asking question in session ${sessionId}`);

  // Validate question
  if (!question || question.trim().length < 5) {
    throw new Error("Question must be at least 5 characters");
  }

  if (question.length > 500) {
    throw new Error("Question exceeds 500 character limit");
  }

  // Build request with chat history
  const previousMessages = session.messages.map((msg) => ({
    role: msg.role,
    content: msg.content,
  }));

  const request: QARequest = {
    question: question.trim(),
    pageContent: session.pageContent,
    pageUrl: session.pageUrl,
    pageTitle: session.pageTitle,
    previousMessages:
      previousMessages.length > 0 ? previousMessages : undefined,
  };

  try {
    // Check AI support
    const aiSupport = await getAISupport();

    let response: QAResponse | null = null;
    const outputLanguage = detectOutputLanguage(request.question);

    if (ENABLE_PROMPT_QA && aiSupport.prompt && outputLanguage === "en") {
      try {
        const promptResponse = await answerQuestionWithPrompt(request);
        if (promptResponse.answer && promptResponse.answer.trim().length > 0) {
          response = promptResponse;
        } else {
          console.warn(
            "[QA Session] Chrome Prompt API returned empty answer, retrying with fallbacks",
          );
        }
      } catch (error) {
        console.warn(
          "[QA Session] Chrome Prompt API failed, attempting Gemini fallback:",
          error,
        );
      }
    } else {
      if (!ENABLE_PROMPT_QA) {
        console.log("[QA Session] Chrome Prompt API disabled, using fallbacks");
      } else if (!aiSupport.prompt) {
        console.log(
          "[QA Session] Chrome Prompt API not available, using fallbacks",
        );
      } else if (outputLanguage !== "en") {
        console.log(
          `[QA Session] Chrome Prompt skipped (unsupported output language: ${outputLanguage ?? "unknown"}), using fallbacks`,
        );
      }
    }

    if (!response) {
      try {
        const geminiResponse = await answerQuestionWithGemini(request);
        if (geminiResponse.answer && geminiResponse.answer.trim().length > 0) {
          response = geminiResponse;
        } else {
          console.warn(
            "[QA Session] Gemini fallback returned empty answer, escalating to OpenAI",
          );
        }
      } catch (error) {
        console.warn(
          "[QA Session] Gemini fallback failed, using OpenAI:",
          error,
        );
      }
    }

    if (!response) {
      response = await answerQuestionWithOpenAI(request);
    }

    const fallbackAnswer = "I couldn't find that information on this page.";
    const safeAnswer =
      typeof response.answer === "string" && response.answer.trim().length > 0
        ? response.answer.trim()
        : fallbackAnswer;

    if (safeAnswer !== response.answer) {
      response = {
        ...response,
        answer: safeAnswer,
      };
    }

    // Add user question to history
    session.messages.push({
      role: "user",
      content: question.trim(),
      timestamp: Date.now(),
    });

    // Add assistant answer to history
    session.messages.push({
      role: "assistant",
      content: safeAnswer,
      timestamp: Date.now(),
      sources: response.sources,
    });

    // Trim history if too long (keep last N messages)
    if (session.messages.length > MAX_HISTORY_SIZE) {
      const trimCount = session.messages.length - MAX_HISTORY_SIZE;
      session.messages.splice(0, trimCount);
      console.log(
        `[QA Session] Trimmed ${trimCount} old messages from history`,
      );
    }

    session.updatedAt = Date.now();

    console.log(
      `[QA Session] Question answered in ${response.processingTime.toFixed(0)}ms using ${response.aiSource}`,
    );

    return response;
  } catch (error) {
    console.error("[QA Session] Error asking question:", error);
    await logError("askQuestion", error as Error, {
      sessionId,
      question,
      pageUrl: session.pageUrl,
    });
    throw error;
  }
}

/**
 * Clear chat history for a session
 *
 * @param sessionId - Session ID
 */
export function clearHistory(sessionId: string): void {
  const session = sessions.get(sessionId);

  if (!session) {
    console.error(`[QA Session] Session ${sessionId} not found`);
    return;
  }

  session.messages = [];
  session.updatedAt = Date.now();

  console.log(`[QA Session] Cleared history for session ${sessionId}`);
}

/**
 * Delete a session
 *
 * @param sessionId - Session ID
 */
export function deleteSession(sessionId: string): void {
  const deleted = sessions.delete(sessionId);

  if (deleted) {
    console.log(`[QA Session] Deleted session ${sessionId}`);
  } else {
    console.warn(`[QA Session] Session ${sessionId} not found`);
  }
}

/**
 * Get all active sessions
 *
 * @returns Array of active sessions
 */
export function getAllSessions(): QASession[] {
  return Array.from(sessions.values());
}

/**
 * Clean up old sessions (> 1 hour inactive)
 */
export function cleanupOldSessions(): void {
  const now = Date.now();
  const oneHour = 60 * 60 * 1000;
  let cleanedCount = 0;

  for (const [id, session] of sessions.entries()) {
    if (now - session.updatedAt > oneHour) {
      sessions.delete(id);
      cleanedCount++;
    }
  }

  if (cleanedCount > 0) {
    console.log(`[QA Session] Cleaned up ${cleanedCount} old sessions`);
  }
}

/**
 * Generate a unique session ID
 */
function generateSessionId(): string {
  return `qa_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// Periodic cleanup management
let cleanupIntervalId: NodeJS.Timeout | null = null;

/**
 * Start periodic cleanup of old sessions (every 10 minutes)
 * Guards against double-starting
 */
export function startPeriodicCleanup(): void {
  if (cleanupIntervalId !== null) {
    console.log("[QA Session] Periodic cleanup already running");
    return;
  }

  cleanupIntervalId = setInterval(cleanupOldSessions, 10 * 60 * 1000);
  console.log("[QA Session] Started periodic cleanup interval");
}

/**
 * Stop periodic cleanup of old sessions
 * Clears the interval and resets the ID
 */
export function stopPeriodicCleanup(): void {
  if (cleanupIntervalId !== null) {
    clearInterval(cleanupIntervalId);
    cleanupIntervalId = null;
    console.log("[QA Session] Stopped periodic cleanup interval");
  }
}
