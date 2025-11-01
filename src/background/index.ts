/**
 * Background Service Worker (Manifest V3)
 *
 * Responsibilities:
 * - Message routing between content scripts, side panel, and popup
 * - AI API orchestration (translation, summarization, etc.)
 * - Sync queue processing
 * - Network status monitoring
 * - Authentication state management
 * - Periodic tasks (alarms)
 */

import { restoreSession } from "@/lib/supabase";
import { db, logDatabaseStats } from "@/lib/db/schema";
import { getSetting, setSetting, updateAISupport } from "@/lib/storage";
import { detectAISupport } from "@/lib/ai/detect";
import { setupMessageHandlers } from "./messaging";
import { setupNetworkListener } from "./network";
import { processSyncQueue } from "./sync";
import { logError } from "@/lib/logger";

console.log("[Glotian Background] Service worker starting...");

/**
 * Global error handler (Task: T185)
 * Catches unhandled errors and promise rejections
 */
self.addEventListener("error", (event: ErrorEvent) => {
  console.error("[Glotian Background] Unhandled error:", event.error);
  logError(
    event.error || event.message,
    "background-unhandled-error",
    event.filename,
  );
});

self.addEventListener("unhandledrejection", (event: PromiseRejectionEvent) => {
  console.error(
    "[Glotian Background] Unhandled promise rejection:",
    event.reason,
  );
  logError(
    event.reason instanceof Error
      ? event.reason
      : new Error(String(event.reason)),
    "background-unhandled-rejection",
  );
});

// Service worker install event
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log("[Glotian Background] Extension installed:", details.reason);

  if (details.reason === "install") {
    // First-time installation
    console.log("[Glotian Background] First-time installation detected");

    // Initialize default settings (already handled by storage.ts defaults)
    // Create context menu
    await setupContextMenu();

    // Detect AI support
    await detectAndUpdateAISupport();

    // Open welcome page (optional)
    // chrome.tabs.create({ url: 'https://glotian.app/welcome' });
  } else if (details.reason === "update") {
    // Extension updated
    const previousVersion = details.previousVersion;
    console.log(
      `[Glotian Background] Updated from version ${previousVersion} to ${chrome.runtime.getManifest().version}`,
    );

    // Re-create context menu after update
    await setupContextMenu();

    // Re-detect AI support after update
    await detectAndUpdateAISupport();
  }

  // Log database stats
  await logDatabaseStats();
});

// Service worker startup event
chrome.runtime.onStartup.addListener(async () => {
  console.log("[Glotian Background] Browser started, service worker activated");

  // Restore authentication session
  await restoreAuthSession();

  // Detect AI support
  await detectAndUpdateAISupport();

  // Setup periodic sync alarm
  await setupPeriodicSync();

  // Log database stats
  await logDatabaseStats();
});

// Setup message handlers
setupMessageHandlers();

// Setup network status listener
setupNetworkListener();

// Listen for keyboard shortcut commands (Manifest commands API)
chrome.commands.onCommand.addListener((command) => {
  console.log("[Glotian Background] Command triggered:", command);

  chrome.tabs.query(
    {
      active: true,
      currentWindow: true,
    },
    async (tabs) => {
      try {
        const activeTab = tabs[0];

        if (!activeTab?.id) {
          console.warn(
            "[Glotian Background] No active tab found for command:",
            command,
          );
          return;
        }

        const sendCommandMessage = async (
          message: Record<string, unknown>,
        ): Promise<void> => {
          try {
            await chrome.tabs.sendMessage(activeTab.id!, message);
          } catch (error) {
            const messageText =
              error instanceof Error ? error.message : String(error);
            if (
              messageText.includes("Receiving end does not exist") ||
              messageText.includes("Could not establish connection")
            ) {
              console.warn(
                "[Glotian Background] Content script unavailable for command:",
                command,
              );
              return;
            }
            throw error;
          }
        };

        if (command === "open-side-panel") {
          if (!chrome.sidePanel?.open) {
            console.warn(
              "[Glotian Background] sidePanel.open API unavailable in this browser.",
            );
            return;
          }

          chrome.sidePanel.open({ tabId: activeTab.id }, () => {
            if (chrome.runtime.lastError) {
              console.error(
                "[Glotian Background] Error opening side panel:",
                chrome.runtime.lastError,
              );
              return;
            }

            chrome.runtime
              .sendMessage({
                type: "OPEN_SIDE_PANEL",
                openedBySender: true,
              })
              .catch(() => {
                // No-op if message not handled
              });
          });
        } else if (command === "capture-text") {
          await sendCommandMessage({
            type: "TRIGGER_CAPTURE_SHORTCUT",
          });
        } else if (command === "summarize-page") {
          // Open side panel and switch to Summarize tab
          if (!chrome.sidePanel?.open) {
            console.warn(
              "[Glotian Background] sidePanel.open API unavailable in this browser.",
            );
            return;
          }

          chrome.sidePanel.open({ tabId: activeTab.id }, () => {
            if (chrome.runtime.lastError) {
              console.error(
                "[Glotian Background] Error opening side panel:",
                chrome.runtime.lastError,
              );
              return;
            }

            // Notify side panel to switch to Summarize tab
            chrome.runtime
              .sendMessage({
                type: "SWITCH_TO_TAB",
                tab: "summarize",
              })
              .catch(() => {
                // No-op if message not handled
              });
          });
        } else if (command === "open-writing-coach") {
          await sendCommandMessage({
            type: "TRIGGER_WRITING_COACH",
          });
        }
      } catch (error) {
        console.error("[Glotian Background] Error handling command:", error);
      }
    },
  );
});

// Setup context menu
async function setupContextMenu(): Promise<void> {
  try {
    // Remove existing menu items
    await chrome.contextMenus.removeAll();

    // Create "Save to Glotian" context menu item
    chrome.contextMenus.create({
      id: "glotian-capture-text",
      title: chrome.i18n.getMessage("contextMenuCapture"),
      contexts: ["selection"],
    });

    console.log("[Glotian Background] Context menu created");
  } catch (error) {
    console.error("[Glotian Background] Error creating context menu:", error);
  }
}

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (
    info.menuItemId === "glotian-capture-text" &&
    info.selectionText &&
    tab?.id
  ) {
    console.log(
      "[Glotian Background] Context menu clicked, capturing text:",
      info.selectionText,
    );

    const noteId = crypto.randomUUID();

    // Send message to content script to trigger capture
    try {
      await chrome.tabs.sendMessage(tab.id, {
        type: "TRIGGER_CAPTURE",
        noteId,
        selection: info.selectionText,
        pageUrl: info.pageUrl || tab.url || "",
        pageTitle: tab.title || "",
      });
    } catch (error) {
      console.error(
        "[Glotian Background] Error sending message to content script:",
        error,
      );
    }
  }
});

// Detect and update AI support
async function detectAndUpdateAISupport(): Promise<void> {
  try {
    const aiSupport = await detectAISupport();
    await updateAISupport(aiSupport);

    const supportedAPIs = Object.entries(aiSupport)
      .filter(([_, supported]) => supported)
      .map(([api]) => api);

    console.log(
      "[Glotian Background] AI support detected:",
      supportedAPIs.join(", ") || "none",
    );
  } catch (error) {
    console.error("[Glotian Background] Error detecting AI support:", error);
  }
}

// Restore authentication session
async function restoreAuthSession(): Promise<void> {
  try {
    const session = await restoreSession();
    if (session) {
      await setSetting("userId", session.user.id);
      console.log(
        "[Glotian Background] Session restored for user:",
        session.user.id,
      );
    } else {
      console.log("[Glotian Background] No session to restore");
    }
  } catch (error) {
    console.error("[Glotian Background] Error restoring session:", error);
  }
}

// Setup periodic sync alarm
async function setupPeriodicSync(): Promise<void> {
  try {
    // Create alarm for periodic sync (every 5 minutes)
    chrome.alarms.create("periodic-sync", {
      periodInMinutes: 5,
    });

    console.log(
      "[Glotian Background] Periodic sync alarm created (5 min interval)",
    );
  } catch (error) {
    console.error(
      "[Glotian Background] Error creating periodic sync alarm:",
      error,
    );
  }
}

// Handle alarm events
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "periodic-sync") {
    console.log("[Glotian Background] Periodic sync alarm triggered");

    // Check if online
    if (navigator.onLine) {
      const userId = await getSetting("userId");
      if (userId) {
        await processSyncQueue(userId);
      } else {
        console.log(
          "[Glotian Background] Skipping sync - user not authenticated",
        );
      }
    } else {
      console.log("[Glotian Background] Skipping sync - offline");
    }
  }
});

/**
 * Memory optimization strategy (Manifest V3):
 *
 * Service workers are designed to be ephemeral and terminate after 30 seconds
 * of inactivity to conserve memory. This is by design in MV3.
 *
 * To minimize memory footprint:
 * 1. Heavy processing (AI operations, large data) should be offloaded to side panel
 * 2. Background worker acts as a thin message router and coordinator
 * 3. IndexedDB operations use streaming where possible (no bulk reads)
 * 4. LRU eviction keeps cache size under control
 * 5. No global state - all state persisted to chrome.storage or IndexedDB
 *
 * Message handlers are registered via setupMessageHandlers() above,
 * and the worker will terminate during idle periods (as designed).
 */

console.log("[Glotian Background] Service worker initialized successfully");
