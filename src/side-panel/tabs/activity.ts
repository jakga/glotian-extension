/**
 * Activity Tab Component
 *
 * Displays:
 * - Activity log (last 100 items)
 * - Sync status (pending, synced, failed counts)
 * - Sync controls (Sync Now, Retry Failed)
 * - Filters (action type, date range, sync status)
 * - Deep links to web app
 * - Conflict warnings
 *
 * Tasks: T152-T176
 */

import { db } from "@/lib/db/schema";
import {
  getRecentActivity,
  getFilteredActivity,
  getActivityCounts,
} from "@/lib/db/activity-log";
import type { ActivityLogItem } from "@/types";

// Global state
let currentUserId: string | null = null;
let activityItems: ActivityLogItem[] = [];
let syncStatusListener: ((message: any) => void) | null = null;
let actionFilterListener: ((event: Event) => void) | null = null;
let dateFilterListener: ((event: Event) => void) | null = null;
let statusFilterListener: ((event: Event) => void) | null = null;

// Map for storing conflict metadata by item ID to avoid XSS vulnerability
const conflictMetadataMap = new Map<string, any>();

// Type guards for filter validation
function isValidActionType(
  value: string,
): value is ActivityLogItem["action"] | "all" {
  return [
    "all",
    "note_created",
    "note_updated",
    "page_summarized",
    "qa_asked",
    "flashcard_created",
    "coach_fix_applied",
    "media_ocr",
    "media_transcribe",
  ].includes(value);
}

function isValidDateRange(
  value: string,
): value is "today" | "week" | "month" | "all" {
  return ["all", "today", "week", "month"].includes(value);
}

function isValidSyncStatus(
  value: string,
): value is ActivityLogItem["syncStatus"] | "all" {
  return ["all", "pending", "synced", "failed"].includes(value);
}

// Filters
let currentFilters = {
  actionType: "all" as ActivityLogItem["action"] | "all",
  dateRange: "all" as "today" | "week" | "month" | "all",
  syncStatus: "all" as ActivityLogItem["syncStatus"] | "all",
};

/**
 * Initialize Activity tab
 */
export async function initActivityTab(): Promise<void> {
  console.log("[Glotian Activity] Initializing Activity tab");

  // Get user ID from storage
  const result = await chrome.storage.local.get(["userId"]);
  currentUserId = result.userId || null;

  if (!currentUserId) {
    showAuthRequired();
    return;
  }

  // Render the UI
  renderActivityTab();

  // Load initial data
  await Promise.all([loadActivityItems(), updateSyncStatus()]);

  // Setup real-time sync status updates (T161)
  setupSyncStatusListener();

  console.log("[Glotian Activity] Activity tab initialized");
}

/**
 * Render Activity tab UI
 */
function renderActivityTab(): void {
  const container = document.getElementById("activity-content");
  if (!container) return;

  container.innerHTML = `
    <div class="activity-container">
      <!-- Sync Status Header (T157-T160) -->
      <div class="sync-status-header">
        <div class="sync-status-indicator">
          <span class="status-dot" id="sync-status-dot"></span>
          <span class="status-text" id="sync-status-text">Checking...</span>
        </div>
        <div class="sync-counts">
          <span class="count-badge" id="pending-count" data-status="pending">
            <span class="badge-icon">⏳</span>
            <span class="badge-text">0 pending</span>
          </span>
          <span class="count-badge" id="synced-count" data-status="synced">
            <span class="badge-icon">✓</span>
            <span class="badge-text">0 synced</span>
          </span>
          <span class="count-badge" id="failed-count" data-status="failed">
            <span class="badge-icon">✗</span>
            <span class="badge-text">0 failed</span>
          </span>
        </div>
        <div class="sync-time" id="sync-time">Last sync: Never</div>
      </div>

      <!-- Sync Controls (T162-T165) -->
      <div class="sync-controls">
        <button class="sync-button primary" id="sync-now-btn">
          <span class="btn-icon">🔄</span>
          <span class="btn-text">Sync Now</span>
        </button>
        <button class="sync-button secondary" id="retry-failed-btn" disabled>
          <span class="btn-icon">↻</span>
          <span class="btn-text">Retry Failed</span>
        </button>
      </div>

      <!-- Sync Progress (T166-T167) -->
      <div class="sync-progress hidden" id="sync-progress">
        <div class="progress-bar">
          <div class="progress-fill" id="progress-fill"></div>
        </div>
        <div class="progress-text" id="progress-text">Syncing 0/0 items...</div>
      </div>

      <!-- Sync Result Toast (T167) -->
      <div class="sync-toast hidden" id="sync-toast"></div>

      <!-- Filters (T169-T171) -->
      <div class="activity-filters">
        <select class="filter-select" id="action-filter">
          <option value="all">All Actions</option>
          <option value="note_created">Notes Created</option>
          <option value="note_updated">Notes Updated</option>
          <option value="page_summarized">Page Summaries</option>
          <option value="qa_asked">Q&A Exchanges</option>
          <option value="flashcard_created">Flashcards Created</option>
          <option value="coach_fix_applied">Writing Coach</option>
          <option value="media_ocr">Image OCR</option>
          <option value="media_transcribe">Audio Transcription</option>
        </select>

        <select class="filter-select" id="date-filter">
          <option value="all">All Time</option>
          <option value="today">Today</option>
          <option value="week">Last 7 Days</option>
          <option value="month">Last 30 Days</option>
        </select>

        <select class="filter-select" id="status-filter">
          <option value="all">All Status</option>
          <option value="pending">Pending</option>
          <option value="synced">Synced</option>
          <option value="failed">Failed</option>
        </select>
      </div>

      <!-- Activity List (T153-T156) -->
      <div class="activity-list" id="activity-list">
        <div class="loading-spinner">Loading activity...</div>
      </div>
    </div>
  `;

  // Setup event listeners
  setupEventListeners();
}

/**
 * Setup event listeners
 */
function setupEventListeners(): void {
  cleanupDomEventListeners();

  // Sync Now button (T163)
  const syncNowBtn = document.getElementById("sync-now-btn");
  syncNowBtn?.addEventListener("click", handleSyncNow);

  // Retry Failed button (T164)
  const retryFailedBtn = document.getElementById("retry-failed-btn");
  retryFailedBtn?.addEventListener("click", handleRetryFailed);

  // Filter changes with type validation
  const actionFilter = document.getElementById("action-filter");
  if (actionFilter) {
    actionFilterListener = (event) => {
      const value = (event.target as HTMLSelectElement).value;
      if (isValidActionType(value)) {
        currentFilters.actionType = value;
        loadActivityItems();
      }
    };
    actionFilter.addEventListener("change", actionFilterListener);
  }

  const dateFilter = document.getElementById("date-filter");
  if (dateFilter) {
    dateFilterListener = (event) => {
      const value = (event.target as HTMLSelectElement).value;
      if (isValidDateRange(value)) {
        currentFilters.dateRange = value;
        loadActivityItems();
      }
    };
    dateFilter.addEventListener("change", dateFilterListener);
  }

  const statusFilter = document.getElementById("status-filter");
  if (statusFilter) {
    statusFilterListener = (event) => {
      const value = (event.target as HTMLSelectElement).value;
      if (isValidSyncStatus(value)) {
        currentFilters.syncStatus = value;
        loadActivityItems();
      }
    };
    statusFilter.addEventListener("change", statusFilterListener);
  }
}

function cleanupDomEventListeners(): void {
  document
    .getElementById("sync-now-btn")
    ?.removeEventListener("click", handleSyncNow);

  document
    .getElementById("retry-failed-btn")
    ?.removeEventListener("click", handleRetryFailed);

  const actionFilter = document.getElementById("action-filter");
  if (actionFilter && actionFilterListener) {
    actionFilter.removeEventListener("change", actionFilterListener);
  }
  actionFilterListener = null;

  const dateFilter = document.getElementById("date-filter");
  if (dateFilter && dateFilterListener) {
    dateFilter.removeEventListener("change", dateFilterListener);
  }
  dateFilterListener = null;

  const statusFilter = document.getElementById("status-filter");
  if (statusFilter && statusFilterListener) {
    statusFilter.removeEventListener("change", statusFilterListener);
  }
  statusFilterListener = null;
}

/**
 * Load activity items from IndexedDB (T153)
 */
async function loadActivityItems(): Promise<void> {
  if (!currentUserId) return;

  try {
    const listContainer = document.getElementById("activity-list");
    if (!listContainer) return;

    // Show loading
    listContainer.innerHTML =
      '<div class="loading-spinner">Loading activity...</div>';

    // Build filter object
    const filters: any = {};

    if (currentFilters.actionType !== "all") {
      filters.actionType = currentFilters.actionType;
    }

    if (currentFilters.syncStatus !== "all") {
      filters.syncStatus = currentFilters.syncStatus;
    }

    // Date range filter
    if (currentFilters.dateRange !== "all") {
      const now = Date.now();
      const dayMs = 24 * 60 * 60 * 1000;

      switch (currentFilters.dateRange) {
        case "today":
          filters.startDate = now - dayMs;
          break;
        case "week":
          filters.startDate = now - 7 * dayMs;
          break;
        case "month":
          filters.startDate = now - 30 * dayMs;
          break;
      }
    }

    // Load filtered items
    activityItems = await getFilteredActivity(currentUserId, filters, 100);

    // Render items
    if (activityItems.length === 0) {
      listContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📭</div>
          <div class="empty-text">No activity found</div>
          <div class="empty-hint">Try adjusting your filters</div>
        </div>
      `;
      return;
    }

    // Render activity items (T154-T156)
    listContainer.innerHTML = activityItems
      .map((item) => renderActivityItem(item))
      .join("");

    // Add event listeners for "Open in Web App" buttons (T172-T174)
    listContainer.querySelectorAll(".open-web-app-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const entityId = (e.currentTarget as HTMLElement).dataset.entityId;
        const entityType = (e.currentTarget as HTMLElement).dataset.entityType;
        if (entityId && entityType) {
          openInWebApp(entityId, entityType);
        }
      });
    });

    // Add event listeners for conflict items (T175-T176)
    listContainer.querySelectorAll(".conflict-item").forEach((item) => {
      item.addEventListener("click", (e) => {
        const itemId = (e.currentTarget as HTMLElement).dataset.itemId;
        if (itemId) {
          const conflictData = conflictMetadataMap.get(itemId);
          if (conflictData) {
            showConflictModal(conflictData);
          }
        }
      });
    });
  } catch (error) {
    console.error("[Glotian Activity] Error loading activity:", error);
    const listContainer = document.getElementById("activity-list");
    if (listContainer) {
      listContainer.innerHTML = `
        <div class="error-state">
          <div class="error-icon">⚠️</div>
          <div class="error-text">Failed to load activity</div>
          <div class="error-hint">${(error as Error).message}</div>
        </div>
      `;
    }
  }
}

/**
 * Render a single activity item (T154-T156)
 */
function renderActivityItem(item: ActivityLogItem): string {
  const icon = getActionIcon(item.action);
  const actionText = getActionText(item.action);
  const relativeTime = getRelativeTime(item.timestamp);
  const syncBadge = getSyncBadge(item.syncStatus);
  const isConflict = item.action === "note_updated" && item.metadata?.conflict;

  // Check if this is a conflict warning (T175)
  if (isConflict) {
    // Store metadata in map using item ID as key (safe from XSS)
    const itemId = String(item.id) || `conflict-${Date.now()}-${Math.random()}`;
    if (item.metadata) {
      conflictMetadataMap.set(itemId, item.metadata);
    }

    return `
      <div class="activity-item conflict-item" data-item-id="${itemId}">
        <div class="activity-icon conflict">⚠️</div>
        <div class="activity-content">
          <div class="activity-header">
            <span class="activity-action">Sync Conflict Detected</span>
            ${syncBadge}
          </div>
          <div class="activity-details">
            <span class="activity-time">${relativeTime}</span>
          </div>
          <div class="conflict-warning">
            Click to view conflict details and resolve
          </div>
        </div>
      </div>
    `;
  }

  // Standard activity item
  return `
    <div class="activity-item" data-item-id="${item.id}">
      <div class="activity-icon">${icon}</div>
      <div class="activity-content">
        <div class="activity-header">
          <span class="activity-action">${actionText}</span>
          ${syncBadge}
        </div>
        <div class="activity-details">
          <span class="activity-time">${relativeTime}</span>
          ${renderMetadata(item)}
        </div>
        ${item.entityId && item.entityType ? renderWebAppButton(item) : ""}
      </div>
    </div>
  `;
}

/**
 * Get icon for action type (T154)
 */
function getActionIcon(action: ActivityLogItem["action"]): string {
  const icons: Record<string, string> = {
    note_created: "📝",
    note_updated: "✏️",
    page_summarized: "📄",
    qa_asked: "💬",
    flashcard_created: "🎴",
    coach_fix_applied: "✍️",
    media_ocr: "📷",
    media_transcribe: "🎤",
  };
  return icons[action] || "📋";
}

/**
 * Get human-readable text for action (T154)
 */
function getActionText(action: ActivityLogItem["action"]): string {
  const texts: Record<string, string> = {
    note_created: "Note Created",
    note_updated: "Note Updated",
    page_summarized: "Page Summarized",
    qa_asked: "Question Asked",
    flashcard_created: "Flashcard Created",
    coach_fix_applied: "Writing Coach Used",
    media_ocr: "Image Text Extracted",
    media_transcribe: "Audio Transcribed",
  };
  return texts[action] || action;
}

/**
 * Get relative time string (T155)
 */
function getRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return "Just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  if (days < 30)
    return `${Math.floor(days / 7)} week${Math.floor(days / 7) === 1 ? "" : "s"} ago`;
  return `${Math.floor(days / 30)} month${Math.floor(days / 30) === 1 ? "" : "s"} ago`;
}

/**
 * Get sync status badge (T156)
 */
function getSyncBadge(status: ActivityLogItem["syncStatus"]): string {
  const badges: Record<string, string> = {
    pending: '<span class="sync-badge pending">⏳ Pending</span>',
    synced: '<span class="sync-badge synced">✓ Synced</span>',
    failed: '<span class="sync-badge failed">✗ Failed</span>',
  };
  return badges[status] || "";
}

/**
 * Render metadata details
 */
function renderMetadata(item: ActivityLogItem): string {
  if (!item.metadata || Object.keys(item.metadata).length === 0) {
    return "";
  }

  const details: string[] = [];

  // Page URL for summaries and Q&A
  if (item.metadata.pageUrl) {
    try {
      const url = new URL(item.metadata.pageUrl);
      details.push(`<span class="meta-item">🌐 ${url.hostname}</span>`);
    } catch {
      // Skip invalid URLs
    }
  }

  // Text length
  if (item.metadata.textLength) {
    details.push(
      `<span class="meta-item">📏 ${item.metadata.textLength} chars</span>`,
    );
  }

  // Processing time
  if (item.metadata.processingTime) {
    details.push(
      `<span class="meta-item">⏱️ ${Math.round(item.metadata.processingTime)}ms</span>`,
    );
  }

  // AI source
  if (item.metadata.aiSource) {
    details.push(`<span class="meta-item">🤖 ${item.metadata.aiSource}</span>`);
  }

  return details.length > 0
    ? `<div class="activity-meta">${details.join("")}</div>`
    : "";
}

/**
 * Render "Open in Web App" button (T172)
 */
function renderWebAppButton(item: ActivityLogItem): string {
  if (!item.entityId || !item.entityType) return "";

  return `
    <button
      class="open-web-app-btn"
      data-entity-id="${item.entityId}"
      data-entity-type="${item.entityType}"
    >
      <span class="btn-icon">🌐</span>
      <span class="btn-text">Open in Web App</span>
    </button>
  `;
}

/**
 * Update sync status display (T157-T160)
 */
async function updateSyncStatus(): Promise<void> {
  if (!currentUserId) return;

  try {
    // Get counts
    const counts = await getActivityCounts(currentUserId);
    const syncQueueCount = await db.syncQueue.count();
    const failedSyncCount = await db.syncQueue
      .where("retryCount")
      .above(0)
      .count();

    // Update status dot and text (T157)
    const statusDot = document.getElementById("sync-status-dot");
    const statusText = document.getElementById("sync-status-text");

    if (failedSyncCount > 0) {
      statusDot?.setAttribute("data-status", "failed");
      if (statusText) statusText.textContent = "Sync Failed";
    } else if (syncQueueCount > 0) {
      statusDot?.setAttribute("data-status", "pending");
      if (statusText) statusText.textContent = "Sync Pending";
    } else {
      statusDot?.setAttribute("data-status", "synced");
      if (statusText) statusText.textContent = "All Synced";
    }

    // Update count badges (T158-T159)
    const pendingBadge = document.getElementById("pending-count");
    if (pendingBadge) {
      const badgeText = pendingBadge.querySelector(".badge-text");
      if (badgeText) {
        badgeText.textContent = `${syncQueueCount} pending`;
      }
    }

    const syncedBadge = document.getElementById("synced-count");
    if (syncedBadge) {
      const badgeText = syncedBadge.querySelector(".badge-text");
      if (badgeText) {
        badgeText.textContent = `${counts.synced} synced`;
      }
    }

    const failedBadge = document.getElementById("failed-count");
    if (failedBadge) {
      const badgeText = failedBadge.querySelector(".badge-text");
      if (badgeText) {
        badgeText.textContent = `${failedSyncCount} failed`;
      }
    }

    // Update last sync time (T160)
    const result = await chrome.storage.local.get(["lastSyncTime"]);
    const lastSyncTime = result.lastSyncTime;
    const syncTimeEl = document.getElementById("sync-time");
    if (syncTimeEl) {
      if (lastSyncTime) {
        syncTimeEl.textContent = `Last sync: ${getRelativeTime(lastSyncTime)}`;
      } else {
        syncTimeEl.textContent = "Last sync: Never";
      }
    }

    // Enable/disable Retry Failed button (T164)
    const retryBtn = document.getElementById(
      "retry-failed-btn",
    ) as HTMLButtonElement;
    if (retryBtn) {
      retryBtn.disabled = failedSyncCount === 0;
    }
  } catch (error) {
    console.error("[Glotian Activity] Error updating sync status:", error);
  }
}

/**
 * Handle Sync Now button click (T163)
 */
async function handleSyncNow(): Promise<void> {
  console.log("[Glotian Activity] Sync Now clicked");

  // Show progress (T166)
  showSyncProgress();

  try {
    // Send SYNC_NOW message to background
    const response = await chrome.runtime.sendMessage({ type: "SYNC_NOW" });

    console.log("[Glotian Activity] Sync response:", response);

    // Update sync status
    await updateSyncStatus();

    // Show success toast (T167)
    showSyncToast(
      `✓ Synced successfully! ${response.syncedCount || 0} items synced, ${response.failedCount || 0} errors.`,
      "success",
    );

    // Reload activity items
    await loadActivityItems();
  } catch (error) {
    console.error("[Glotian Activity] Sync failed:", error);
    showSyncToast(`✗ Sync failed: ${(error as Error).message}`, "error");
  } finally {
    hideSyncProgress();
  }
}

/**
 * Handle Retry Failed button click (T165)
 */
async function handleRetryFailed(): Promise<void> {
  console.log("[Glotian Activity] Retry Failed clicked");

  if (!currentUserId) return;

  showSyncProgress();

  try {
    // Reset retry count for all failed items in sync queue
    const failedItems = await db.syncQueue
      .where("retryCount")
      .above(0)
      .toArray();

    for (const item of failedItems) {
      await db.syncQueue.update(item.id!, {
        retryCount: 0,
        lastAttempt: null,
        error: null,
      });
    }

    console.log(`[Glotian Activity] Reset ${failedItems.length} failed items`);

    // Trigger sync
    await chrome.runtime.sendMessage({ type: "SYNC_NOW" });

    // Update UI
    await updateSyncStatus();
    await loadActivityItems();

    showSyncToast(
      `✓ Retrying ${failedItems.length} failed items...`,
      "success",
    );
  } catch (error) {
    console.error("[Glotian Activity] Retry failed:", error);
    showSyncToast(`✗ Retry failed: ${(error as Error).message}`, "error");
  } finally {
    hideSyncProgress();
  }
}

/**
 * Show sync progress indicator (T166)
 */
function showSyncProgress(): void {
  const progressEl = document.getElementById("sync-progress");
  if (progressEl) {
    progressEl.classList.remove("hidden");
  }

  // Animate progress bar
  const progressFill = document.getElementById("progress-fill");
  if (progressFill) {
    progressFill.style.width = "0%";
    setTimeout(() => {
      progressFill.style.width = "100%";
    }, 100);
  }
}

/**
 * Hide sync progress indicator
 */
function hideSyncProgress(): void {
  const progressEl = document.getElementById("sync-progress");
  if (progressEl) {
    progressEl.classList.add("hidden");
  }
}

/**
 * Show sync result toast (T167)
 */
function showSyncToast(message: string, type: "success" | "error"): void {
  const toastEl = document.getElementById("sync-toast");
  if (!toastEl) return;

  toastEl.textContent = message;
  toastEl.setAttribute("data-type", type);
  toastEl.classList.remove("hidden");

  // Auto-hide after 3 seconds
  setTimeout(() => {
    toastEl.classList.add("hidden");
  }, 3000);
}

/**
 * Setup real-time sync status listener (T161, T168)
 */
function setupSyncStatusListener(): void {
  // Remove existing listener if any
  if (syncStatusListener) {
    chrome.runtime.onMessage.removeListener(syncStatusListener);
  }

  // Create new listener
  syncStatusListener = (message: any) => {
    if (message.type === "SYNC_STATUS") {
      console.log("[Glotian Activity] Received SYNC_STATUS message:", message);
      updateSyncStatus();
    }
  };

  chrome.runtime.onMessage.addListener(syncStatusListener);
}

/**
 * Open entity in web app (T173-T174)
 */
function openInWebApp(entityId: string, entityType: string): void {
  // Generate deep link URL (T173)
  let deepLinkUrl = "https://glotian.app";

  switch (entityType) {
    case "learning_note":
      deepLinkUrl = `https://glotian.app/notes/${entityId}`;
      break;
    case "flashcard":
      deepLinkUrl = `https://glotian.app/flashcards/${entityId}`;
      break;
    case "qa_exchange":
      // Q&A exchanges aren't stored in the database, so just open the Q&A page
      deepLinkUrl = "https://glotian.app/qa";
      break;
    default:
      deepLinkUrl = "https://glotian.app";
  }

  console.log("[Glotian Activity] Opening deep link:", deepLinkUrl);

  // Open new tab (T174)
  chrome.tabs.create({ url: deepLinkUrl });
}
function escapeHtml(str: string): string {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function showConflictModal(conflictData: any): void {
  const modal = document.createElement("div");
  modal.className = "conflict-modal";

  const previewText = (note: any): string => {
    if (!note) return "";
    const content = note.content ?? note.translated_text ?? note.original_text;
    if (!content || typeof content !== "string") return "";
    return content.substring(0, 100);
  };

  const localText = previewText(conflictData.localVersion);
  const serverText = previewText(conflictData.serverVersion);

  const toDisplayDate = (value?: string): string =>
    value ? new Date(value).toLocaleString() : "Unknown";

  const localUpdated =
    conflictData.localVersion?.updatedAt ??
    conflictData.localVersion?.updated_at;
  const serverUpdated =
    conflictData.serverVersion?.updatedAt ??
    conflictData.serverVersion?.updated_at;

  const localDate = localUpdated ? toDisplayDate(localUpdated) : "Unknown";
  const serverDate = serverUpdated ? toDisplayDate(serverUpdated) : "Unknown";

  modal.innerHTML = `
    <div class="modal-backdrop"></div>
    <div class="modal-content">
      <div class="modal-header">
        <h3>Sync Conflict Detected</h3>
        <button class="modal-close">&times;</button>
      </div>
      <div class="modal-body">
        <p class="conflict-explanation">
          This note was modified on both the server and locally. Please choose which version to keep:
        </p>
        <div class="conflict-versions">
          <div class="version-card">
            <h4>Local Version</h4>
            <div class="version-details">
              <p><strong>Modified:</strong> ${escapeHtml(localDate)}</p>
              <p><strong>Content:</strong> ${escapeHtml(localText)}...</p>
            </div>
            <button class="version-button" data-choice="local">Keep Local</button>
          </div>
          <div class="version-card">
            <h4>Server Version</h4>
            <div class="version-details">
              <p><strong>Modified:</strong> ${escapeHtml(serverDate)}</p>
              <p><strong>Content:</strong> ${escapeHtml(serverText)}...</p>
            </div>
            <button class="version-button" data-choice="server">Keep Server</button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Setup event listeners
  modal.querySelector(".modal-close")?.addEventListener("click", () => {
    modal.remove();
  });

  modal.querySelector(".modal-backdrop")?.addEventListener("click", () => {
    modal.remove();
  });

  modal.querySelectorAll(".version-button").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const choice = (e.target as HTMLElement).dataset.choice;
      await resolveConflict(
        conflictData.entityId,
        choice as "local" | "server",
      );
      modal.remove();
    });
  });
}

/**
 * Resolve sync conflict
 */
async function resolveConflict(
  entityId: string,
  choice: "local" | "server",
): Promise<void> {
  try {
    console.log(
      `[Glotian Activity] Resolving conflict for ${entityId}: ${choice}`,
    );

    // TODO: Implement conflict resolution logic
    // This should update the sync queue and trigger a sync

    showSyncToast(`✓ Conflict resolved. Keeping ${choice} version.`, "success");
    await loadActivityItems();
  } catch (error) {
    console.error("[Glotian Activity] Error resolving conflict:", error);
    showSyncToast(
      `✗ Failed to resolve conflict: ${(error as Error).message}`,
      "error",
    );
  }
}

/**
 * Show auth required message
 */
function showAuthRequired(): void {
  const container = document.getElementById("activity-content");
  if (!container) return;

  container.innerHTML = `
    <div class="auth-required">
      <div class="auth-icon">🔒</div>
      <div class="auth-text">Please login to view activity</div>
      <div class="auth-hint">Your activity log will appear here after logging in</div>
    </div>
  `;
}

/**
 * Cleanup
 */
export function cleanupActivityTab(): void {
  cleanupDomEventListeners();
  if (syncStatusListener) {
    chrome.runtime.onMessage.removeListener(syncStatusListener);
    syncStatusListener = null;
  }
}
