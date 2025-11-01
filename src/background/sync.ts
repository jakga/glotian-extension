/**
 * Sync queue processor
 *
 * Handles offline changes and syncs them to Supabase when online
 * Implements Last-Write-Wins conflict resolution
 */

import { supabase } from "@/lib/supabase";
import { db } from "@/lib/db/schema";
import { updateLastSyncTime, logError } from "@/lib/storage";
import type {
  CachedDeck,
  CachedFlashcard,
  CachedNote,
  CachedUserPreference,
  SyncQueueItem,
  Tables,
} from "@/types";
import type { Database, Json } from "@/types/supabase";
import type { SupabaseClient, PostgrestError } from "@supabase/supabase-js";
import type { Table, UpdateSpec } from "dexie";
import {
  fromSupabaseNote,
  type NoteRecord,
  type SupabaseLearningNote,
  type NoteSourceType,
} from "@repo/domain/notes";

type SyncTable = Extract<
  keyof Database["public"]["Tables"],
  SyncQueueItem["table"]
>;
type TableRow<T extends SyncTable> = Tables<T>;

type ValidationResult<T> = { ok: true; data: T } | { ok: false; issue: string };

const SOURCE_TYPES: ReadonlySet<NoteSourceType> = new Set([
  "manual",
  "image",
  "voice",
  "web",
  "extension",
  null,
]);

const FLASHCARD_DIFFICULTIES = new Set(["easy", "medium", "hard"]);

const SRS_ALGORITHMS = new Set(["sm2", "fsrs-lite"]);

const CEFR_LEVELS = new Set(["A1", "A2", "B1", "B2", "C1", "C2"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function ensureString(
  record: Record<string, unknown>,
  key: string,
): ValidationResult<string> {
  const value = record[key];
  if (typeof value === "string") {
    return { ok: true, data: value };
  }

  return { ok: false, issue: `${key} must be a string` };
}

function ensureNullableString(
  record: Record<string, unknown>,
  key: string,
): ValidationResult<string | null> {
  const value = record[key];
  if (typeof value === "string" || value === null || value === undefined) {
    return { ok: true, data: value ?? null };
  }

  return { ok: false, issue: `${key} must be a string or null` };
}

function ensureNumber(
  record: Record<string, unknown>,
  key: string,
): ValidationResult<number> {
  const value = record[key];
  if (typeof value === "number") {
    return { ok: true, data: value };
  }

  return { ok: false, issue: `${key} must be a number` };
}

function ensureStringArray(
  record: Record<string, unknown>,
  key: string,
): ValidationResult<string[]> {
  const value = record[key];
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
    return { ok: true, data: value };
  }

  return { ok: false, issue: `${key} must be an array of strings` };
}

function validateSupabaseLearningNoteData(
  data: unknown,
): ValidationResult<SupabaseLearningNote> {
  if (!isRecord(data)) {
    return { ok: false, issue: "expected object" };
  }

  const requiredStrings: Array<keyof SupabaseLearningNote> = [
    "id",
    "user_id",
    "original_text",
    "translated_text",
    "source_language",
    "target_language",
    "created_at",
    "updated_at",
  ];

  for (const key of requiredStrings) {
    const result = ensureString(data, key as string);
    if (!result.ok) {
      return result;
    }
  }

  const titleResult = ensureNullableString(data, "title");
  if (!titleResult.ok) return titleResult;
  const grammarResult = ensureNullableString(data, "grammar_explanation");
  if (!grammarResult.ok) return grammarResult;
  const sourceUrlResult = ensureNullableString(data, "source_url");
  if (!sourceUrlResult.ok) return sourceUrlResult;
  const attachedImageUrlResult = ensureNullableString(
    data,
    "attached_image_url",
  );
  if (!attachedImageUrlResult.ok) return attachedImageUrlResult;
  const folderPathResult = ensureNullableString(data, "folder_path");
  if (!folderPathResult.ok) return folderPathResult;
  const deletedAtResult = ensureNullableString(data, "deleted_at");
  if (!deletedAtResult.ok) return deletedAtResult;

  const tagsResult = ensureStringArray(data, "tags");
  if (!tagsResult.ok) return tagsResult;

  const altExpressions = data["alternative_expressions"];
  if (!Array.isArray(altExpressions)) {
    return {
      ok: false,
      issue: "alternative_expressions must be an array",
    };
  }

  const sourceType = data["source_type"] as NoteSourceType;
  if (!SOURCE_TYPES.has(sourceType ?? null)) {
    return {
      ok: false,
      issue: `source_type is invalid: ${String(sourceType)}`,
    };
  }

  return {
    ok: true,
    data: {
      id: data.id as string,
      user_id: data.user_id as string,
      title: titleResult.data,
      original_text: data.original_text as string,
      translated_text: data.translated_text as string,
      source_language: data.source_language as string,
      target_language: data.target_language as string,
      grammar_explanation: grammarResult.data,
      alternative_expressions:
        altExpressions as SupabaseLearningNote["alternative_expressions"],
      source_type: sourceType,
      source_url: sourceUrlResult.data,
      attached_image_url: attachedImageUrlResult.data,
      tags: tagsResult.data,
      folder_path: folderPathResult.data,
      created_at: data.created_at as string,
      updated_at: data.updated_at as string,
      deleted_at: deletedAtResult.data,
    },
  };
}

type FlashcardRow = Database["public"]["Tables"]["flashcards"]["Row"];
type FlashcardDeckRow = Database["public"]["Tables"]["flashcard_decks"]["Row"];
type UserPreferenceRow =
  Database["public"]["Tables"]["user_preferences"]["Row"];

function validateFlashcardRow(data: unknown): ValidationResult<FlashcardRow> {
  if (!isRecord(data)) {
    return { ok: false, issue: "expected object" };
  }

  const requiredStrings: Array<keyof FlashcardRow> = [
    "id",
    "user_id",
    "deck_id",
    "term",
    "definition",
    "language",
    "created_at",
    "updated_at",
  ];

  for (const key of requiredStrings) {
    const result = ensureString(data, key as string);
    if (!result.ok) return result;
  }

  const optionalSourceNote = ensureNullableString(data, "source_note_id");
  if (!optionalSourceNote.ok) return optionalSourceNote;
  const partOfSpeech = ensureNullableString(data, "part_of_speech");
  if (!partOfSpeech.ok) return partOfSpeech;
  const deletedAt = ensureNullableString(data, "deleted_at");
  if (!deletedAt.ok) return deletedAt;

  const exampleSentences = ensureStringArray(data, "example_sentences");
  if (!exampleSentences.ok) return exampleSentences;

  const difficulty = data["difficulty_level"];
  if (!FLASHCARD_DIFFICULTIES.has(difficulty as string)) {
    return {
      ok: false,
      issue: `difficulty_level must be one of ${Array.from(
        FLASHCARD_DIFFICULTIES,
      ).join(", ")}`,
    };
  }

  return {
    ok: true,
    data: {
      id: data.id as string,
      user_id: data.user_id as string,
      deck_id: data.deck_id as string,
      source_note_id: optionalSourceNote.data,
      term: data.term as string,
      definition: data.definition as string,
      part_of_speech: partOfSpeech.data,
      example_sentences: exampleSentences.data,
      language: data.language as string,
      difficulty_level: difficulty as FlashcardRow["difficulty_level"],
      created_at: data.created_at as string,
      updated_at: data.updated_at as string,
      deleted_at: deletedAt.data,
    },
  };
}

function validateDeckRow(data: unknown): ValidationResult<FlashcardDeckRow> {
  if (!isRecord(data)) {
    return { ok: false, issue: "expected object" };
  }

  const requiredStrings: Array<keyof FlashcardDeckRow> = [
    "id",
    "user_id",
    "name",
    "language",
    "created_at",
    "updated_at",
  ];

  for (const key of requiredStrings) {
    const result = ensureString(data, key as string);
    if (!result.ok) return result;
  }

  const optionalDescription = ensureNullableString(data, "description");
  if (!optionalDescription.ok) return optionalDescription;
  const deletedAt = ensureNullableString(data, "deleted_at");
  if (!deletedAt.ok) return deletedAt;

  const cardCount = ensureNumber(data, "card_count");
  if (!cardCount.ok) return cardCount;
  const totalStudyTime = ensureNumber(data, "total_study_time_seconds");
  if (!totalStudyTime.ok) return totalStudyTime;

  return {
    ok: true,
    data: {
      id: data.id as string,
      user_id: data.user_id as string,
      name: data.name as string,
      description: optionalDescription.data,
      language: data.language as string,
      card_count: cardCount.data,
      total_study_time_seconds: totalStudyTime.data,
      created_at: data.created_at as string,
      updated_at: data.updated_at as string,
      deleted_at: deletedAt.data,
    },
  };
}

function validateUserPreferenceRow(
  data: unknown,
): ValidationResult<UserPreferenceRow> {
  if (!isRecord(data)) {
    return { ok: false, issue: "expected object" };
  }

  const requiredStrings: Array<keyof UserPreferenceRow> = [
    "id",
    "user_id",
    "ui_language",
    "updated_at",
  ];

  for (const key of requiredStrings) {
    const result = ensureString(data, key as string);
    if (!result.ok) return result;
  }

  const learningLanguages = ensureStringArray(data, "learning_languages");
  if (!learningLanguages.ok) return learningLanguages;

  const dailyGoal = ensureNumber(data, "daily_goal_minutes");
  if (!dailyGoal.ok) return dailyGoal;

  const algorithm = data["srs_algorithm"];
  if (!SRS_ALGORITHMS.has(algorithm as string)) {
    return {
      ok: false,
      issue: `srs_algorithm must be one of ${Array.from(SRS_ALGORITHMS).join(
        ", ",
      )}`,
    };
  }

  const cefrLevel = data["target_cefr_level"];
  if (!CEFR_LEVELS.has(cefrLevel as string)) {
    return {
      ok: false,
      issue: `target_cefr_level must be one of ${Array.from(CEFR_LEVELS).join(
        ", ",
      )}`,
    };
  }

  return {
    ok: true,
    data: {
      id: data.id as string,
      user_id: data.user_id as string,
      ui_language: data.ui_language as string,
      learning_languages: learningLanguages.data,
      daily_goal_minutes: dailyGoal.data,
      srs_algorithm: algorithm as UserPreferenceRow["srs_algorithm"],
      target_cefr_level: cefrLevel as UserPreferenceRow["target_cefr_level"],
      updated_at: data.updated_at as string,
    },
  };
}

function logValidationFailure(
  scope: "remote" | "payload",
  table: SyncTable,
  entityId: string,
  issue: string,
): void {
  console.error(
    `[Glotian Sync] ${scope} validation failed for ${table} (${entityId}): ${issue}`,
  );
}

type TableInsertMap = {
  learning_notes: Database["public"]["Tables"]["learning_notes"]["Insert"];
  flashcards: Database["public"]["Tables"]["flashcards"]["Insert"];
  flashcard_decks: Database["public"]["Tables"]["flashcard_decks"]["Insert"];
  user_preferences: Database["public"]["Tables"]["user_preferences"]["Insert"];
};

type TableUpdateMap = {
  learning_notes: Database["public"]["Tables"]["learning_notes"]["Update"];
  flashcards: Database["public"]["Tables"]["flashcards"]["Update"];
  flashcard_decks: Database["public"]["Tables"]["flashcard_decks"]["Update"];
  user_preferences: Database["public"]["Tables"]["user_preferences"]["Update"];
};

function ensureObjectPayload(
  payload: unknown,
): payload is Record<string, unknown> {
  return isRecord(payload);
}

/**
 * Map sync table names to their corresponding IndexedDB store objects
 */
type CacheTableMap = {
  learning_notes: CachedNote;
  flashcards: CachedFlashcard;
  flashcard_decks: CachedDeck;
  user_preferences: CachedUserPreference;
};

type CacheUpdateSpec =
  | UpdateSpec<CachedNote>
  | UpdateSpec<CachedFlashcard>
  | UpdateSpec<CachedDeck>
  | UpdateSpec<CachedUserPreference>;

const DB_TABLE_MAP: { [K in SyncTable]: Table<CacheTableMap[K], string> } = {
  learning_notes: db.notes,
  flashcards: db.flashcards,
  flashcard_decks: db.decks,
  user_preferences: db.userPreferences,
};

/**
 * Update local cache for a specific table with type safety
 */
async function updateCacheTable<T extends SyncTable>(
  table: T,
  entityId: string,
  updates: CacheUpdateSpec,
): Promise<void> {
  const store = DB_TABLE_MAP[table];
  if (store) {
    await store.update(entityId, updates as UpdateSpec<CacheTableMap[T]>);
  }
}

/**
 * Handle sync conflict by fetching latest server data and updating local cache
 */
async function handleConflict(
  tableName: SyncTable,
  entityId: string,
): Promise<void> {
  try {
    const { data: latestData } = await supabase
      .from(tableName)
      .select("*")
      .eq("id", entityId)
      .maybeSingle();

    if (latestData) {
      await updateLocalCacheFromServer(
        tableName,
        entityId,
        latestData as TableRow<typeof tableName>,
      );
    }
  } catch (err) {
    console.error(
      `[Glotian Sync] Error handling conflict for ${entityId}:`,
      err,
    );
  }
}

/**
 * Process all pending items in the sync queue for a specific user
 */
export async function processSyncQueue(userId: string): Promise<{
  synced: number;
  failed: number;
  conflicts: number;
}> {
  console.log("[Glotian Sync] Processing sync queue for user:", userId);

  const stats = {
    synced: 0,
    failed: 0,
    conflicts: 0,
  };

  try {
    // Get all pending sync items for this user, ordered by timestamp
    // Note: The sync queue doesn't have user_id directly, but we process only items
    // that belong to this user's entities. However, for proper multi-user support,
    // entities should have user_id fields. This implementation assumes per-user filtering
    // happens at the entity level when items are enqueued.
    const queue = await db.syncQueue.orderBy("timestamp").toArray();

    if (queue.length === 0) {
      console.log("[Glotian Sync] No items in sync queue");
      await updateLastSyncTime(Date.now());
      return stats;
    }

    console.log(`[Glotian Sync] Processing ${queue.length} items`);

    // Process each item sequentially
    for (const item of queue) {
      try {
        const result = await syncItem(item);

        if (result === "success") {
          stats.synced++;
          if (item.id !== undefined) {
            await db.syncQueue.delete(item.id);
          }
        } else if (result === "conflict") {
          stats.conflicts++;
          if (item.id !== undefined) {
            await db.syncQueue.delete(item.id);
          }
        } else if (result === "retry") {
          stats.failed++;
          await updateRetryCount(item);
        }
      } catch (error) {
        console.error(`[Glotian Sync] Error syncing item ${item.id}:`, error);
        stats.failed++;
        await updateRetryCount(item);
        await logError("syncItem", error as Error, { item });
      }
    }

    await updateLastSyncTime(Date.now());
    console.log("[Glotian Sync] Sync complete:", stats);

    // Broadcast sync status to side panel and popup
    broadcastSyncStatus(stats);
  } catch (error) {
    console.error("[Glotian Sync] Error processing sync queue:", error);
    await logError("processSyncQueue", error as Error, { userId });
  }

  return stats;
}

/**
 * Sync a single item to Supabase
 */
async function syncItem(
  item: SyncQueueItem,
): Promise<"success" | "conflict" | "retry"> {
  console.log(
    `[Glotian Sync] Syncing ${item.operation} on ${item.table} (${item.entityId})`,
  );

  try {
    const tableName: SyncTable = item.table;
    const client = supabase;

    // Check for conflicts (Last-Write-Wins)
    if (item.operation === "update" || item.operation === "delete") {
      const { data: serverData, error: fetchError } = await client
        .from(tableName)
        .select("updated_at")
        .eq("id", item.entityId)
        .maybeSingle();

      if (fetchError && fetchError.code !== "PGRST116") {
        // PGRST116 = not found (OK for delete)
        throw fetchError;
      }

      const localUpdatedRaw = (item.payload as { updated_at?: string })
        .updated_at;
      const serverUpdatedAt = (serverData as { updated_at?: string } | null)
        ?.updated_at;

      if (serverUpdatedAt) {
        if (!localUpdatedRaw) {
          console.warn(
            `[Glotian Sync] Local payload missing updated_at for ${item.entityId}, using server version`,
          );
          await handleConflict(tableName, item.entityId);
          return "conflict";
        }

        const serverUpdated = new Date(serverUpdatedAt).getTime();
        const localUpdated = new Date(localUpdatedRaw).getTime();

        if (serverUpdated > localUpdated) {
          console.warn(
            `[Glotian Sync] Conflict detected for ${item.entityId}: server is newer`,
          );
          await handleConflict(tableName, item.entityId);
          return "conflict";
        }
      } else if (!serverData && item.operation === "delete") {
        // Nothing to delete on server
        return "success";
      } else if (!serverData && item.operation === "update") {
        console.warn(
          `[Glotian Sync] No server record found for ${item.entityId}, treating as new`,
        );
      }
    }

    if (item.operation === "create") {
      let insertError: PostgrestError | null = null;

      switch (tableName) {
        case "learning_notes": {
          if (!ensureObjectPayload(item.payload)) {
            logValidationFailure(
              "payload",
              tableName,
              item.entityId,
              "payload must be an object",
            );
            await updateCacheTable(tableName, item.entityId, {
              syncStatus: "failed",
            });
            throw new Error(
              "Invalid payload for create: payload must be an object",
            );
          }
          const { error } = await client
            .from("learning_notes")
            .insert<
              TableInsertMap["learning_notes"]
            >(item.payload as TableInsertMap["learning_notes"]);
          insertError = error ?? null;
          break;
        }
        case "flashcards": {
          if (!ensureObjectPayload(item.payload)) {
            logValidationFailure(
              "payload",
              tableName,
              item.entityId,
              "payload must be an object",
            );
            await updateCacheTable(tableName, item.entityId, {
              syncStatus: "failed",
            });
            throw new Error(
              "Invalid payload for create: payload must be an object",
            );
          }
          const { error } = await client
            .from("flashcards")
            .insert<
              TableInsertMap["flashcards"]
            >(item.payload as TableInsertMap["flashcards"]);
          insertError = error ?? null;
          break;
        }
        case "flashcard_decks": {
          if (!ensureObjectPayload(item.payload)) {
            logValidationFailure(
              "payload",
              tableName,
              item.entityId,
              "payload must be an object",
            );
            await updateCacheTable(tableName, item.entityId, {
              syncStatus: "failed",
            });
            throw new Error(
              "Invalid payload for create: payload must be an object",
            );
          }
          const { error } = await client
            .from("flashcard_decks")
            .insert<
              TableInsertMap["flashcard_decks"]
            >(item.payload as TableInsertMap["flashcard_decks"]);
          insertError = error ?? null;
          break;
        }
        case "user_preferences": {
          if (!ensureObjectPayload(item.payload)) {
            logValidationFailure(
              "payload",
              tableName,
              item.entityId,
              "payload must be an object",
            );
            await updateCacheTable(tableName, item.entityId, {
              syncStatus: "failed",
            });
            throw new Error(
              "Invalid payload for create: payload must be an object",
            );
          }
          const { error } = await client
            .from("user_preferences")
            .insert<
              TableInsertMap["user_preferences"]
            >(item.payload as TableInsertMap["user_preferences"]);
          insertError = error ?? null;
          break;
        }
      }

      if (insertError) throw insertError;
    } else if (item.operation === "update") {
      let updateError: PostgrestError | null = null;

      switch (tableName) {
        case "learning_notes": {
          if (!ensureObjectPayload(item.payload)) {
            logValidationFailure(
              "payload",
              tableName,
              item.entityId,
              "payload must be an object",
            );
            await updateCacheTable(tableName, item.entityId, {
              syncStatus: "failed",
            });
            throw new Error(
              "Invalid payload for update: payload must be an object",
            );
          }
          const { error } = await client
            .from("learning_notes")
            .update<TableUpdateMap["learning_notes"]>(
              item.payload as TableUpdateMap["learning_notes"],
            )
            .eq("id", item.entityId);
          updateError = error ?? null;
          break;
        }
        case "flashcards": {
          if (!ensureObjectPayload(item.payload)) {
            logValidationFailure(
              "payload",
              tableName,
              item.entityId,
              "payload must be an object",
            );
            await updateCacheTable(tableName, item.entityId, {
              syncStatus: "failed",
            });
            throw new Error(
              "Invalid payload for update: payload must be an object",
            );
          }
          const { error } = await client
            .from("flashcards")
            .update<TableUpdateMap["flashcards"]>(
              item.payload as TableUpdateMap["flashcards"],
            )
            .eq("id", item.entityId);
          updateError = error ?? null;
          break;
        }
        case "flashcard_decks": {
          if (!ensureObjectPayload(item.payload)) {
            logValidationFailure(
              "payload",
              tableName,
              item.entityId,
              "payload must be an object",
            );
            await updateCacheTable(tableName, item.entityId, {
              syncStatus: "failed",
            });
            throw new Error(
              "Invalid payload for update: payload must be an object",
            );
          }
          const { error } = await client
            .from("flashcard_decks")
            .update<TableUpdateMap["flashcard_decks"]>(
              item.payload as TableUpdateMap["flashcard_decks"],
            )
            .eq("id", item.entityId);
          updateError = error ?? null;
          break;
        }
        case "user_preferences": {
          if (!ensureObjectPayload(item.payload)) {
            logValidationFailure(
              "payload",
              tableName,
              item.entityId,
              "payload must be an object",
            );
            await updateCacheTable(tableName, item.entityId, {
              syncStatus: "failed",
            });
            throw new Error(
              "Invalid payload for update: payload must be an object",
            );
          }
          const { error } = await client
            .from("user_preferences")
            .update<TableUpdateMap["user_preferences"]>(
              item.payload as TableUpdateMap["user_preferences"],
            )
            .eq("id", item.entityId);
          updateError = error ?? null;
          break;
        }
      }

      if (updateError) throw updateError;
    } else if (item.operation === "delete") {
      const { error } = await client
        .from(tableName)
        .delete()
        .eq("id", item.entityId);
      if (error) throw error;
    }

    // Update local cache sync status
    await updateCacheTable(item.table, item.entityId, { syncStatus: "synced" });

    console.log(`[Glotian Sync] Successfully synced ${item.entityId}`);
    return "success";
  } catch (error) {
    console.error(`[Glotian Sync] Error syncing ${item.entityId}:`, error);
    return "retry";
  }
}

async function updateLocalCacheFromServer<T extends SyncTable>(
  table: T,
  entityId: string,
  latestData: TableRow<T>,
): Promise<void> {
  if (table === "learning_notes") {
    const validation = validateSupabaseLearningNoteData(latestData);
    if (!validation.ok) {
      logValidationFailure("remote", table, entityId, validation.issue);
      await updateCacheTable(table, entityId, { syncStatus: "failed" });
      return;
    }

    const mapped: NoteRecord = fromSupabaseNote(validation.data);
    const cached: CachedNote = {
      ...mapped,
      syncStatus: "synced",
      lastAccessedAt: Date.now(),
    };

    await db.notes.put(cached);
  } else if (table === "flashcards") {
    const validation = validateFlashcardRow(latestData);
    if (!validation.ok) {
      logValidationFailure("remote", table, entityId, validation.issue);
      await updateCacheTable(table, entityId, { syncStatus: "failed" });
      return;
    }

    const cached: CachedFlashcard = {
      ...validation.data,
      syncStatus: "synced",
      lastAccessedAt: Date.now(),
    };

    await db.flashcards.put(cached);
  } else if (table === "flashcard_decks") {
    const validation = validateDeckRow(latestData);
    if (!validation.ok) {
      logValidationFailure("remote", table, entityId, validation.issue);
      await updateCacheTable(table, entityId, { syncStatus: "failed" });
      return;
    }

    const cached: CachedDeck = {
      ...validation.data,
      syncStatus: "synced",
      lastAccessedAt: Date.now(),
    };

    await db.decks.put(cached);
  } else if (table === "user_preferences") {
    const validation = validateUserPreferenceRow(latestData);
    if (!validation.ok) {
      logValidationFailure("remote", table, entityId, validation.issue);
      await updateCacheTable(table, entityId, { syncStatus: "failed" });
      return;
    }

    const cached: CachedUserPreference = {
      ...validation.data,
      syncStatus: "synced",
      lastAccessedAt: Date.now(),
    };

    await db.userPreferences.put(cached);
  }
}

/**
 * Update retry count for failed sync item
 */
async function updateRetryCount(item: SyncQueueItem): Promise<void> {
  const newRetryCount = item.retryCount + 1;

  if (newRetryCount >= 5) {
    console.warn(
      `[Glotian Sync] Giving up on ${item.entityId} after 5 retries`,
    );

    // Mark as failed in local cache
    await updateCacheTable(item.table, item.entityId, { syncStatus: "failed" });

    // Remove from queue
    if (item.id !== undefined) {
      await db.syncQueue.delete(item.id);
    }
  } else {
    // Update retry count
    if (item.id !== undefined) {
      await db.syncQueue.update(item.id, {
        retryCount: newRetryCount,
        lastAttempt: Date.now(),
      });
    }
  }
}

/**
 * Broadcast sync status to all listeners
 */
function broadcastSyncStatus(stats: {
  synced: number;
  failed: number;
  conflicts: number;
}): void {
  // Send message to side panel and popup
  chrome.runtime
    .sendMessage({
      type: "SYNC_COMPLETE",
      stats,
    })
    .catch(() => {
      // Ignore errors if no listeners
    });
}

/**
 * Enqueue a sync operation with type-safe payload
 */
export async function enqueueSyncOperation<T extends SyncQueueItem["table"]>(
  operation: "create" | "update" | "delete",
  table: T,
  entityId: string,
  payload: Record<string, any>,
): Promise<void> {
  try {
    await db.syncQueue.add({
      operation,
      table,
      entityId,
      payload: payload as Record<string, any>,
      timestamp: Date.now(),
      retryCount: 0,
      lastAttempt: null,
      error: null,
    });

    console.log(
      `[Glotian Sync] Enqueued ${operation} for ${table}/${entityId}`,
    );
  } catch (error) {
    console.error("[Glotian Sync] Error enqueuing sync operation:", error);
    await logError("enqueueSyncOperation", error as Error, {
      operation,
      table,
      entityId,
    });
    throw error;
  }
}
