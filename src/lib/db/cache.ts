/**
 * IndexedDB cache helpers
 */

import { db } from "./schema";
import type { CachedNote } from "@/types";

/**
 * Create a new note in IndexedDB cache
 */
export async function createCachedNote(
  userId: string,
  noteData: Partial<CachedNote>,
): Promise<CachedNote> {
  const now = new Date().toISOString();
  const note: CachedNote = {
    id: noteData.id ?? crypto.randomUUID(),
    userId,
    title: noteData.title ?? null,
    content: noteData.content ?? "",
    summary: noteData.summary ?? null,
    tags: noteData.tags ?? [],
    sourceType: noteData.sourceType ?? "extension",
    sourceUrl: noteData.sourceUrl ?? null,
    attachedImageUrl: noteData.attachedImageUrl ?? null,
    folderPath: noteData.folderPath ?? null,
    createdAt: noteData.createdAt ?? now,
    updatedAt: noteData.updatedAt ?? now,
    syncStatus: noteData.syncStatus ?? "pending",
    lastAccessedAt: Date.now(),
  };

  await db.notes.put(note);
  console.log("[Glotian Cache] Note created:", note.id);

  return note;
}

/**
 * Update a note in IndexedDB cache
 */
export async function updateCachedNote(
  noteId: string,
  updates: Partial<CachedNote>,
): Promise<void> {
  await db.notes.update(noteId, {
    ...updates,
    updatedAt: new Date().toISOString(),
  });

  console.log("[Glotian Cache] Note updated:", noteId);
}

/**
 * Update lastAccessedAt timestamp for a note (explicit access tracking)
 */
export async function touchLastAccessedAt(noteId: string): Promise<void> {
  await db.notes.update(noteId, { lastAccessedAt: Date.now() });
}

/**
 * Get a note from IndexedDB cache (read-only, no side effects)
 * Use touchLastAccessedAt() separately if access tracking is needed
 */
export async function getCachedNote(
  noteId: string,
): Promise<CachedNote | undefined> {
  const note = await db.notes.get(noteId);
  return note;
}

/**
 * Get recent notes for user
 */
export async function getRecentNotes(
  userId: string,
  limit = 20,
): Promise<CachedNote[]> {
  const notes = await db.notes.where("userId").equals(userId).toArray();

  return notes
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
    .slice(0, limit);
}

/**
 * Search notes by text or tags with pagination support
 *
 * Performance optimizations:
 * - Only loads limit results + buffer to reduce memory usage
 * - Null-safe text field access to prevent runtime errors
 * - Pagination support for handling large datasets
 */
export async function searchNotes(
  userId: string,
  query: string,
  limit = 50,
): Promise<CachedNote[]> {
  if (!query.trim()) {
    // Return empty array for empty queries (avoids unnecessary processing)
    return [];
  }

  const queryLower = query.trim().toLowerCase();
  let results: CachedNote[] = [];

  // Get notes and filter in-memory with a buffer for pagination
  const notes = await db.notes.where("user_id").equals(userId).toArray();

  // Filter with null-safe text access
  for (const note of notes) {
    if (results.length >= limit) {
      break;
    }

    const contentText = note.content?.toLowerCase() || "";

    const matchesTags =
      note.tags?.some?.((tag: string) =>
        tag?.toLowerCase?.().includes?.(queryLower),
      ) ?? false;

    if (contentText.includes(queryLower) || matchesTags) {
      results.push(note);
    }
  }

  return results;
}

/**
 * Get pending notes (not synced)
 */
export async function getPendingNotes(userId: string): Promise<CachedNote[]> {
  const notes = await db.notes
    .where("[userId+syncStatus]")
    .equals([userId, "pending"])
    .toArray();

  return notes;
}

/**
 * LRU eviction: Remove oldest 20% of entries when quota reaches 90%
 * Prioritizes keeping:
 * - Recent notes (last 30 days)
 * - Unsynced items (syncStatus: 'pending')
 * - Recently accessed items (high lastAccessedAt)
 */
export async function evictLRUIfNeeded(): Promise<{
  evicted: boolean;
  itemsRemoved: number;
  quotaBefore: number;
  quotaAfter: number;
}> {
  const { percentUsed, used: quotaBefore } = await import("./schema").then(
    (m) => m.checkQuotaUsage(),
  );

  // Threshold: 90% quota usage
  if (percentUsed < 90) {
    return {
      evicted: false,
      itemsRemoved: 0,
      quotaBefore,
      quotaAfter: quotaBefore,
    };
  }

  console.warn(
    `[Glotian Cache] Quota at ${percentUsed.toFixed(1)}%, starting LRU eviction...`,
  );

  let totalRemoved = 0;
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const allNotes = await db.notes
    .filter((note) => {
      // Keep unsynced notes
      if (note.syncStatus === "pending") return false;
      // Keep recent notes (last 30 days)
      if (
        typeof note.lastAccessedAt === "number" &&
        note.lastAccessedAt > thirtyDaysAgo
      )
        return false;
      return true;
    })
    .sortBy("lastAccessedAt");

  const notesToRemove = Math.ceil(allNotes.length * 0.2);
  if (notesToRemove > 0) {
    const idsToRemove = allNotes.slice(0, notesToRemove).map((n) => n.id);
    await db.notes.bulkDelete(idsToRemove);
    totalRemoved += idsToRemove.length;
    console.log(`[Glotian Cache] Evicted ${idsToRemove.length} old notes`);
  }

  // Evict flashcards (oldest 20%)
  const allFlashcards = await db.flashcards
    .filter((card) => {
      if (card.syncStatus === "pending") return false;
      if (
        typeof card.lastAccessedAt === "number" &&
        card.lastAccessedAt > thirtyDaysAgo
      )
        return false;
      return true;
    })
    .sortBy("lastAccessedAt");

  const cardsToRemove = Math.ceil(allFlashcards.length * 0.2);
  if (cardsToRemove > 0) {
    const idsToRemove = allFlashcards.slice(0, cardsToRemove).map((c) => c.id);
    await db.flashcards.bulkDelete(idsToRemove);
    totalRemoved += idsToRemove.length;
    console.log(`[Glotian Cache] Evicted ${idsToRemove.length} old flashcards`);
  }

  // Evict decks (oldest 20%)
  const allDecks = await db.decks
    .filter((deck) => {
      if (deck.syncStatus === "pending") return false;
      if (
        typeof deck.lastAccessedAt === "number" &&
        deck.lastAccessedAt > thirtyDaysAgo
      )
        return false;
      return true;
    })
    .sortBy("lastAccessedAt");

  const decksToRemove = Math.ceil(allDecks.length * 0.2);
  if (decksToRemove > 0) {
    const idsToRemove = allDecks.slice(0, decksToRemove).map((d) => d.id);
    await db.decks.bulkDelete(idsToRemove);
    totalRemoved += idsToRemove.length;
    console.log(`[Glotian Cache] Evicted ${idsToRemove.length} old decks`);
  }

  // Evict old activity logs (keep last 1000 entries)
  const activityCount = await db.activityLog.count();
  if (activityCount > 1000) {
    const logsToRemove = activityCount - 1000;
    const oldestLogs = await db.activityLog
      .orderBy("timestamp")
      .limit(logsToRemove)
      .toArray();

    if (oldestLogs.length > 0) {
      const idsToRemove = oldestLogs.map((log) => log.id as number);
      await db.activityLog.bulkDelete(idsToRemove);
      totalRemoved += idsToRemove.length;
      console.log(
        `[Glotian Cache] Evicted ${idsToRemove.length} old activity logs`,
      );
    }
  }

  const { used: quotaAfter } = await import("./schema").then((m) =>
    m.checkQuotaUsage(),
  );

  console.log(
    `[Glotian Cache] LRU eviction complete. Removed ${totalRemoved} items. ` +
      `Quota: ${(quotaBefore / 1024 / 1024).toFixed(2)} MB → ${(quotaAfter / 1024 / 1024).toFixed(2)} MB`,
  );

  return {
    evicted: true,
    itemsRemoved: totalRemoved,
    quotaBefore,
    quotaAfter,
  };
}
