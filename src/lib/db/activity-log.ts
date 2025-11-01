import { db } from "./schema";
import type { ActivityLogItem } from "@/types";

/**
 * Activity Log Writer
 *
 * Records user actions in the extension for display in the Activity tab.
 * All logs are stored locally in IndexedDB and marked for sync to Supabase.
 */

/**
 * Log a user action to the activity log
 */
export async function logActivity(
  userId: string,
  action: ActivityLogItem["action"],
  options: {
    entityType?: ActivityLogItem["entityType"];
    entityId?: string;
    metadata?: Record<string, any>;
  } = {},
): Promise<void> {
  try {
    const activityItem: ActivityLogItem = {
      userId,
      action,
      entityType: options.entityType ?? null,
      entityId: options.entityId ?? null,
      metadata: options.metadata ?? {},
      timestamp: Date.now(),
      syncStatus: "pending",
    };

    await db.activityLog.add(activityItem);
    console.log("[Activity Log] Logged action:", action, {
      action,
      entityType: activityItem.entityType,
    });
  } catch (error) {
    console.error("[Activity Log] Failed to log activity:", error);
  }
}

/**
 * Get recent activity items
 */
export async function getRecentActivity(
  userId: string,
  limit: number = 100,
): Promise<ActivityLogItem[]> {
  try {
    const items = await db.activityLog
      .where("userId")
      .equals(userId)
      .sortBy("timestamp");

    return items.reverse().slice(0, limit); // Most recent first
  } catch (error) {
    console.error("[Activity Log] Failed to get recent activity:", error);
    return [];
  }
}

/**
 * Get activity items with filters
 */
export async function getFilteredActivity(
  userId: string,
  filters: {
    actionType?: ActivityLogItem["action"];
    syncStatus?: ActivityLogItem["syncStatus"];
    startDate?: number; // Unix timestamp
    endDate?: number; // Unix timestamp
  } = {},
  limit: number = 100,
): Promise<ActivityLogItem[]> {
  try {
    let query = db.activityLog.where("userId").equals(userId);

    // Filter by action type
    if (filters.actionType) {
      query = query.and((item) => item.action === filters.actionType);
    }

    // Filter by sync status
    if (filters.syncStatus) {
      query = query.and((item) => item.syncStatus === filters.syncStatus);
    }

    // Filter by date range
    if (filters.startDate) {
      query = query.and((item) => item.timestamp >= filters.startDate!);
    }
    if (filters.endDate) {
      query = query.and((item) => item.timestamp <= filters.endDate!);
    }

    const items = await query.sortBy("timestamp");
    return items.reverse().slice(0, limit);
  } catch (error) {
    console.error("[Activity Log] Failed to get filtered activity:", error);
    return [];
  }
}

/**
 * Count activity items by sync status
 */
export async function getActivityCounts(userId: string): Promise<{
  total: number;
  pending: number;
  synced: number;
  failed: number;
}> {
  try {
    const allItems = await db.activityLog
      .where("userId")
      .equals(userId)
      .toArray();

    return {
      total: allItems.length,
      pending: allItems.filter((item) => item.syncStatus === "pending").length,
      synced: allItems.filter((item) => item.syncStatus === "synced").length,
      failed: allItems.filter((item) => item.syncStatus === "failed").length,
    };
  } catch (error) {
    console.error("[Activity Log] Failed to get activity counts:", error);
    return { total: 0, pending: 0, synced: 0, failed: 0 };
  }
}

/**
 * Update sync status for activity items
 */
export async function updateActivitySyncStatus(
  itemId: number,
  syncStatus: ActivityLogItem["syncStatus"],
): Promise<void> {
  try {
    await db.activityLog.update(itemId, { syncStatus });
  } catch (error) {
    console.error("[Activity Log] Failed to update sync status:", error);
  }
}

/**
 * Clear old activity logs (keep last 1000 items)
 */
export async function pruneActivityLog(userId: string): Promise<void> {
  try {
    const allItems = await db.activityLog
      .where("userId")
      .equals(userId)
      .sortBy("timestamp");

    if (allItems.length > 1000) {
      const itemsToDelete = allItems.slice(0, -1000); // Delete oldest, keep newest 1000
      const idsToDelete = itemsToDelete
        .map((item) => item.id)
        .filter((id): id is number => id !== undefined);

      await db.activityLog.bulkDelete(idsToDelete);
      console.log(
        `[Activity Log] Pruned ${idsToDelete.length} old activity items`,
      );
    }
  } catch (error) {
    console.error("[Activity Log] Failed to prune activity log:", error);
  }
}
