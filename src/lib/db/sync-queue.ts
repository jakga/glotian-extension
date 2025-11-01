/**
 * Sync queue helpers
 */

import { db } from "./schema";
import type { SyncQueueItem } from "@/types";

/**
 * Add item to sync queue
 */
export async function enqueueSyncItem(
  operation: SyncQueueItem["operation"],
  table: SyncQueueItem["table"],
  entityId: string,
  payload: Record<string, any>,
): Promise<void> {
  const item: Omit<SyncQueueItem, "id"> = {
    operation,
    table,
    entityId,
    payload,
    timestamp: Date.now(),
    retryCount: 0,
    lastAttempt: null,
    error: null,
  };

  await db.syncQueue.add(item);
  console.log(
    `[Glotian Sync Queue] Enqueued ${operation} for ${table}/${entityId}`,
  );
}

/**
 * Get all pending sync items
 */
export async function getAllSyncItems(): Promise<SyncQueueItem[]> {
  const items = await db.syncQueue.orderBy("timestamp").toArray();
  return items;
}

/**
 * Remove item from sync queue
 */
export async function removeSyncItem(itemId: number): Promise<void> {
  await db.syncQueue.delete(itemId);
  console.log(`[Glotian Sync Queue] Removed item ${itemId}`);
}

/**
 * Update sync item retry count
 */
export async function updateSyncItemRetry(
  itemId: number,
  retryCount: number,
  error: string,
): Promise<void> {
  await db.syncQueue.update(itemId, {
    retryCount,
    lastAttempt: Date.now(),
    error,
  });
}

/**
 * Get sync queue statistics
 */
export async function getSyncQueueStats(): Promise<{
  pending: number;
  failed: number;
  total: number;
}> {
  const total = await db.syncQueue.count();
  const failed = await db.syncQueue.where("retryCount").above(0).count();
  const pending = total - failed;

  return { pending, failed, total };
}
