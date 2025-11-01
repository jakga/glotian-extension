/**
 * Web App Listener (Content Script for glotian.app)
 *
 * Task: T202
 * Listens for sync events from the web app via window.postMessage
 * and forwards them to the background worker to update the extension cache
 */

console.log("[Glotian Web App Listener] Content script loaded");

// Only run on glotian.app domain
if (
  window.location.hostname === "glotian.app" ||
  window.location.hostname === "www.glotian.app" ||
  window.location.hostname.endsWith(".glotian.app")
) {
  console.log("[Glotian Web App Listener] Running on Glotian web app");

  // Listen for sync events from web app
  window.addEventListener("message", async (event) => {
    // Security check: only accept messages from same origin
    if (event.origin !== window.location.origin) {
      return;
    }

    const message = event.data;

    // Check if this is a Glotian sync event
    if (
      !message ||
      typeof message !== "object" ||
      !message.type ||
      !message.type.startsWith("GLOTIAN_SYNC_")
    ) {
      return;
    }

    console.log(
      "[Glotian Web App Listener] Received sync event:",
      message.type,
    );

    // Forward to background worker
    try {
      chrome.runtime.sendMessage({
        type: "WEB_APP_SYNC",
        syncEvent: message,
      });

      console.log(
        "[Glotian Web App Listener] Forwarded sync event to background worker",
      );
    } catch (error) {
      // Silently ignore extension context invalidated errors (happens during reload/unload)
      const errorMessage = String(error);
      if (errorMessage.includes("Extension context invalidated")) {
        return; // Silently ignore
      }

      console.error(
        "[Glotian Web App Listener] Failed to forward sync event:",
        error,
      );
    }
  });

  // Notify web app that extension is available
  window.postMessage(
    {
      type: "GLOTIAN_EXTENSION_READY",
      version: chrome.runtime.getManifest().version,
    },
    window.location.origin,
  );

  console.log(
    "[Glotian Web App Listener] Extension ready message sent to web app",
  );
}

/**
 * Expected sync event types from web app:
 *
 * - GLOTIAN_SYNC_NOTE_CREATED: { type, noteId, note }
 * - GLOTIAN_SYNC_NOTE_UPDATED: { type, noteId, note }
 * - GLOTIAN_SYNC_NOTE_DELETED: { type, noteId }
 * - GLOTIAN_SYNC_DECK_CREATED: { type, deckId, deck }
 * - GLOTIAN_SYNC_DECK_UPDATED: { type, deckId, deck }
 * - GLOTIAN_SYNC_DECK_DELETED: { type, deckId }
 * - GLOTIAN_SYNC_FLASHCARD_CREATED: { type, flashcardId, flashcard }
 * - GLOTIAN_SYNC_FLASHCARD_UPDATED: { type, flashcardId, flashcard }
 * - GLOTIAN_SYNC_FLASHCARD_DELETED: { type, flashcardId }
 * - GLOTIAN_SYNC_BULK_SYNC: { type, entity, action }
 */
