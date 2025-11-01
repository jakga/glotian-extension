import Dexie, { Table } from "dexie";
import type {
  CachedNote,
  CachedFlashcard,
  CachedDeck,
  CachedUserPreference,
  SyncQueueItem,
  ActivityLogItem,
} from "@/types";

/**
 * IndexedDB schema for Glotian Chrome Extension
 *
 * Tables:
 * - notes: Cached learning notes with sync status
 * - flashcards: Cached flashcards with sync status
 * - decks: Cached flashcard decks with sync status
 * - userPreferences: Cached user preferences with sync status
 * - syncQueue: Queue for offline changes waiting to sync
 * - activityLog: Local activity history
 */
export class GlotianExtensionDB extends Dexie {
  notes!: Table<CachedNote, string>;
  flashcards!: Table<CachedFlashcard, string>;
  decks!: Table<CachedDeck, string>;
  userPreferences!: Table<CachedUserPreference, string>;
  syncQueue!: Table<SyncQueueItem, number>;
  activityLog!: Table<ActivityLogItem, number>;

  constructor() {
    super("GlotianExtensionDB");

    // Version 1 schema
    this.version(1).stores({
      // Notes: indexed by id (primary), user_id, composite user_id+created_at,
      // composite user_id+tags for filtering, lastAccessedAt for LRU, syncStatus for sync filtering
      notes:
        "id, user_id, [user_id+created_at], [user_id+tags], lastAccessedAt, syncStatus",

      // Flashcards: indexed by id, user_id, deck_id, source_note_id,
      // composite user_id+deck_id for deck filtering, lastAccessedAt, syncStatus
      flashcards:
        "id, user_id, deck_id, source_note_id, [user_id+deck_id], lastAccessedAt, syncStatus",

      // Decks: indexed by id, user_id, composite user_id+created_at, lastAccessedAt, syncStatus
      decks: "id, user_id, [user_id+created_at], lastAccessedAt, syncStatus",

      // User preferences: indexed by id (primary), user_id, lastAccessedAt, syncStatus
      userPreferences: "id, user_id, lastAccessedAt, syncStatus",

      // Sync queue: auto-increment id, indexed by timestamp, operation, table, and retryCount for retry logic
      syncQueue: "++id, timestamp, operation, table, retryCount",

      // Activity log: auto-increment id, indexed by userId, timestamp, action, syncStatus
      activityLog: "++id, userId, timestamp, action, syncStatus",
    });

    // Version 2: Add missing composite indexes for better query performance
    this.version(2).stores({
      // Notes: add user_id+syncStatus composite for getPendingNotes query
      notes:
        "id, user_id, [user_id+created_at], [user_id+tags], [user_id+syncStatus], lastAccessedAt, syncStatus",

      // Flashcards: add user_id+syncStatus composite
      flashcards:
        "id, user_id, deck_id, source_note_id, [user_id+deck_id], [user_id+syncStatus], lastAccessedAt, syncStatus",

      // Decks: add user_id+syncStatus composite
      decks:
        "id, user_id, [user_id+created_at], [user_id+syncStatus], lastAccessedAt, syncStatus",

      // User preferences: add user_id+syncStatus composite
      userPreferences:
        "id, user_id, [user_id+syncStatus], lastAccessedAt, syncStatus",

      // Sync queue: add composite index for efficient retry queries
      syncQueue:
        "++id, timestamp, operation, table, retryCount, [table+operation]",

      // Activity log: add composite indexes for filtering by user+action, user+syncStatus
      activityLog:
        "++id, userId, timestamp, action, syncStatus, [userId+action], [userId+syncStatus], [userId+timestamp]",
    });

    // Version 3: Migrate notes to shared domain structure (content, summary, etc.)
    this.version(3)
      .stores({
        notes:
          "id, userId, [userId+createdAt], [userId+tags], [userId+syncStatus], lastAccessedAt, syncStatus",
        flashcards:
          "id, user_id, deck_id, source_note_id, [user_id+deck_id], [user_id+syncStatus], lastAccessedAt, syncStatus",
        decks:
          "id, user_id, [user_id+created_at], [user_id+syncStatus], lastAccessedAt, syncStatus",
        userPreferences:
          "id, user_id, [user_id+syncStatus], lastAccessedAt, syncStatus",
        syncQueue:
          "++id, timestamp, operation, table, retryCount, [table+operation]",
        activityLog:
          "++id, userId, timestamp, action, syncStatus, [userId+action], [userId+syncStatus], [userId+timestamp]",
      })
      .upgrade(async (tx) => {
        const notesStore = tx.table("notes");
        await notesStore.toCollection().modify((note: any) => {
          const fallbackTimestamp =
            typeof note.created_at === "string"
              ? note.created_at
              : new Date().toISOString();

          note.userId = note.userId ?? note.user_id ?? "";
          note.content =
            typeof note.content === "string"
              ? note.content
              : (note.original_text ?? "");
          note.summary =
            typeof note.summary === "string" || note.summary === null
              ? note.summary
              : (note.grammar_explanation ?? null);
          note.tags = Array.isArray(note.tags) ? note.tags : [];
          note.sourceType = note.sourceType ?? note.source_type ?? "extension";
          note.sourceUrl = note.sourceUrl ?? note.source_url ?? null;
          note.attachedImageUrl =
            note.attachedImageUrl ?? note.attached_image_url ?? null;
          note.createdAt =
            note.createdAt ?? note.created_at ?? fallbackTimestamp;
          note.updatedAt =
            note.updatedAt ??
            note.updated_at ??
            note.createdAt ??
            fallbackTimestamp;
          note.syncStatus = note.syncStatus ?? "pending";
          note.lastAccessedAt =
            typeof note.lastAccessedAt === "number"
              ? note.lastAccessedAt
              : Date.now();

          // Cleanup legacy fields
          delete note.user_id;
          delete note.original_text;
          delete note.translated_text;
          delete note.source_language;
          delete note.target_language;
          delete note.grammar_explanation;
          delete note.alternative_expressions;
          delete note.source_type;
          delete note.source_url;
          delete note.attached_image_url;
          delete note.created_at;
          delete note.updated_at;
          delete note.deleted_at;
        });
      });
  }
}

// Export singleton instance
export const db = new GlotianExtensionDB();

// Helper function to check IndexedDB quota usage
export async function checkQuotaUsage(): Promise<{
  used: number;
  quota: number;
  percentUsed: number;
}> {
  if (navigator.storage && navigator.storage.estimate) {
    const estimate = await navigator.storage.estimate();
    const used = estimate.usage || 0;
    const quota = estimate.quota || 0;
    const percentUsed = quota > 0 ? (used / quota) * 100 : 0;

    return { used, quota, percentUsed };
  }

  // Fallback if Storage API not available
  return { used: 0, quota: 0, percentUsed: 0 };
}

// Helper function to log database stats
export async function logDatabaseStats(): Promise<void> {
  try {
    const notesCount = await db.notes.count();
    const flashcardsCount = await db.flashcards.count();
    const decksCount = await db.decks.count();
    const syncQueueCount = await db.syncQueue.count();
    const activityLogCount = await db.activityLog.count();
    const quotaInfo = await checkQuotaUsage();

    console.log("[Glotian DB] Database stats:", {
      notes: notesCount,
      flashcards: flashcardsCount,
      decks: decksCount,
      syncQueue: syncQueueCount,
      activityLog: activityLogCount,
      quota: {
        used: `${(quotaInfo.used / 1024 / 1024).toFixed(2)} MB`,
        quota: `${(quotaInfo.quota / 1024 / 1024).toFixed(2)} MB`,
        percentUsed: `${quotaInfo.percentUsed.toFixed(1)}%`,
      },
    });
  } catch (error) {
    console.error("[Glotian DB] Error logging stats:", error);
  }
}
