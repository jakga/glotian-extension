/**
 * Network status listener
 *
 * Monitors online/offline status and triggers sync when connection is restored
 */

import { getSetting } from "@/lib/storage";
import { processSyncQueue } from "./sync";

let isOnline = navigator.onLine;

/**
 * Setup network status listener
 */
let listenersSetup = false;

export function setupNetworkListener(): void {
  if (listenersSetup) return;
  listenersSetup = true;

  // Listen to online event
  globalThis.addEventListener("online", handleOnline);

  // Listen to offline event
  globalThis.addEventListener("offline", handleOffline);

  console.log(
    "[Glotian Network] Network listener setup complete. Current status:",
    isOnline ? "online" : "offline",
  );
}

/**
 * Handle online event
 */
async function handleOnline(): Promise<void> {
  try {
    console.log("[Glotian Network] Connection restored");
    isOnline = true;

    // Broadcast status to side panel and popup
    broadcastNetworkStatus(true);

    // Trigger sync if user is authenticated
    const userId = await getSetting("userId");
    if (userId) {
      console.log("[Glotian Network] Triggering sync after reconnect");
      await processSyncQueue(userId);
    }
  } catch (error) {
    console.error("[Glotian Network] Error handling online event:", error);
  }
}

/**
 * Handle offline event
 */
function handleOffline(): void {
  console.log("[Glotian Network] Connection lost");
  isOnline = false;

  // Broadcast status to side panel and popup
  broadcastNetworkStatus(false);
}

/**
 * Broadcast network status to all listeners
 */
function broadcastNetworkStatus(online: boolean): void {
  chrome.runtime
    .sendMessage({
      type: "NETWORK_STATUS_CHANGED",
      online,
    })
    .catch(() => {
      // Ignore errors if no listeners
    });
}

/**
 * Check if currently online
 */
export function isCurrentlyOnline(): boolean {
  return isOnline;
}
