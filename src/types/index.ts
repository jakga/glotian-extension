// Extension-specific TypeScript types
import type { Database } from "./supabase";

export type CEFRLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";

// Helper type to extract table types
export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];

// Core entity types
export type Note = Tables<"learning_notes">;
export type Flashcard = Tables<"flashcards">;
export type FlashcardDeck = Tables<"flashcard_decks">;
export type User = Tables<"users">;
export type UserPreferences = Tables<"user_preferences">;

// Sync status types
export type SyncStatus = "pending" | "synced" | "failed";

// Cached entity types (with sync metadata)
export interface CachedNote extends Note {
  syncStatus: SyncStatus;
  lastAccessedAt: number;
}

export interface CachedFlashcard extends Flashcard {
  syncStatus: SyncStatus;
  lastAccessedAt: number;
}

export interface CachedDeck extends FlashcardDeck {
  syncStatus: SyncStatus;
  lastAccessedAt: number;
}

export interface CachedUserPreference extends UserPreferences {
  syncStatus: SyncStatus;
  lastAccessedAt: number;
}

// Sync queue types
export interface SyncQueueItem {
  id?: number;
  operation: "create" | "update" | "delete";
  table:
    | "learning_notes"
    | "flashcards"
    | "flashcard_decks"
    | "user_preferences";
  entityId: string;
  payload: Record<string, any>;
  timestamp: number;
  retryCount: number;
  lastAttempt: number | null;
  error: string | null;
}

// Activity log types
export type ActivityAction =
  | "note_created"
  | "note_updated"
  | "page_summarized"
  | "qa_asked"
  | "flashcard_created"
  | "coach_fix_applied"
  | "media_ocr"
  | "media_transcribe"
  | "sync_conflict";

export interface ActivityLogItem {
  id?: number;
  userId: string;
  action: ActivityAction;
  entityType: "learning_note" | "flashcard" | "qa_exchange" | null;
  entityId: string | null;
  metadata: Record<string, any>;
  timestamp: number;
  syncStatus: SyncStatus;
}

// Chrome runtime message types
export type RuntimeMessage =
  | {
      type: "CAPTURE_TEXT";
      selection: string;
      pageUrl: string;
      pageTitle: string;
      noteId?: string;
    }
  | {
      type: "CAPTURE_TEXT_OFFLINE";
      selection: string;
      pageUrl: string;
      pageTitle: string;
      noteId?: string;
    }
  | { type: "TRANSLATE"; text: string; sourceLang: string; targetLang: string }
  | {
      type: "TRANSLATE_RESPONSE";
      noteId: string;
      translatedText: string;
      tags: string[];
      error?: string;
    }
  | {
      type: "SUMMARIZE_PAGE";
      pageUrl: string;
      pageContent: string;
      cefrLevel: CEFRLevel;
      pageTitle?: string;
    }
  | {
      type: "SUMMARIZE_RESPONSE";
      summary: string;
      originalText: string;
      processingTime: number;
      aiSource: "chrome" | "gemini" | "openai";
      error?: string;
    }
  | {
      type: "SAVE_SUMMARY_NOTE";
      pageUrl: string;
      pageTitle: string;
      summary: string;
      originalText: string;
      simplifiedSummary?: string;
      translation?: string;
      cefrLevel?: CEFRLevel;
    }
  | { type: "PROOFREAD_TEXT"; text: string; language: string; context?: string }
  | { type: "PROOFREAD_RESPONSE"; corrections: Correction[]; error?: string }
  | { type: "REWRITE_TEXT"; text: string; tone: string; length: string }
  | {
      type: "REWRITE_RESPONSE";
      alternatives: string[];
      learningExpressions: string[];
      error?: string;
    }
  | {
      type: "ASK_QUESTION";
      question: string;
      pageContent: string;
      pageUrl: string;
      pageTitle: string;
      previousMessages?: ChatMessage[];
    }
  | {
      type: "ANSWER_QUESTION";
      answer: string;
      sources: Source[];
      followUpQuestions: string[];
      error?: string;
    }
  | { type: "PROCESS_IMAGE"; imageData: string; action: "ocr" }
  | { type: "PROCESS_AUDIO"; audioData: string; action: "transcribe" }
  | {
      type: "MULTIMODAL_RESPONSE";
      text: string;
      confidence?: number;
      language?: string;
      error?: string;
    }
  | { type: "SYNC_NOW" }
  | {
      type: "SYNC_STATUS";
      pendingCount: number;
      syncedCount: number;
      failedCount: number;
      lastSyncTime: number | null;
    }
  | { type: "AUTH_SUCCESS"; userId: string; session: any }
  | { type: "AUTH_LOGOUT" }
  | {
      type: "OPEN_SIDE_PANEL";
      tab?: string;
      noteId?: string;
      openedBySender?: boolean;
    }
  | { type: "WEB_APP_SYNC"; syncEvent: SyncEvent };

// AI-related types
export interface Correction {
  type: "grammar" | "spelling" | "style" | "punctuation";
  original: string;
  suggestion: string;
  explanation: string;
  startIndex: number;
  endIndex: number;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export interface Source {
  text: string;
  relevance: number;
  startIndex?: number;
  endIndex?: number;
}

export interface SyncEvent {
  type: "glotian:sync";
  action:
    | "note_created"
    | "note_updated"
    | "note_deleted"
    | "deck_created"
    | "deck_updated"
    | "card_created"
    | "review_completed";
  entityId: string;
  userId: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

// AI support detection
export interface AISupport {
  translator: boolean;
  summarizer: boolean;
  prompt: boolean;
  writer: boolean;
  rewriter: boolean;
  proofreader: boolean;
}

// Extension settings
export interface ExtensionSettings {
  // Authentication
  supabaseSession: any | null;
  userId: string | null;

  // User preferences
  sourceLanguage: string;
  targetLanguage: string;
  defaultCEFRLevel: CEFRLevel;
  autoSaveEnabled: boolean;

  // AI settings
  chromeAIEnabled: boolean;
  serverFallbackEnabled: boolean;
  aiSupport: AISupport;

  // UI preferences
  uiLanguage: "en" | "ko";
  sidePanelLastTab: "capture" | "summarize" | "qa" | "media" | "activity";

  // Telemetry
  telemetryEnabled: boolean;

  // Error logs
  errorLogs: Array<{
    timestamp: number;
    context: string;
    message: string;
    stack?: string;
    metadata?: Record<string, any>;
  }>;

  // Last sync time
  lastSyncTime: number | null;
}

// Translation request/response
export interface TranslateRequest {
  text: string;
  sourceLang: string;
  targetLang: string;
  cefrLevel?: CEFRLevel;
}

export interface TranslateResponse {
  translatedText: string;
  grammarExplanation?: string;
  alternativeExpressions?: Array<{ text: string; context: string }>;
  detectedLanguage?: string;
  confidence?: number;
}

// Auto-tagging types
export interface AutoTagRequest {
  text: string;
  language: string;
  context?: string;
}

export interface AutoTagResponse {
  tags: string[];
  keywords: string[];
  cefrLevel: CEFRLevel;
  domain?: string;
}

// Q&A types
export interface QARequest {
  question: string; // User's question (max 500 chars)
  pageContent: string; // Page content for context (max 10,000 chars)
  pageUrl: string;
  pageTitle: string;
  previousMessages?: Array<{ role: "user" | "assistant"; content: string }>; // Chat history
}

export interface QAResponse {
  answer: string; // AI-generated answer
  sources: Array<{
    quote: string; // Direct quote from page content
    relevance: number; // 0.0-1.0 (how relevant to question)
    position?: { start: number; end: number }; // Character indices in page content
  }>;
  followUpQuestions: string[]; // Suggested follow-up questions (max 3)
  processingTime: number;
  aiSource: "chrome" | "gemini" | "openai";
}

// Export Database type
export type { Database };
