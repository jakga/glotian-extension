/**
 * Content script entry point
 *
 * Responsibilities:
 * - Listen to keyboard shortcuts (Ctrl+Shift+F for capture)
 * - Handle text selection and capture
 * - Inject snackbar for confirmation
 * - Handle page content extraction
 */

import {
  showTranslationSnackbar,
  showErrorSnackbar,
  showWarningSnackbar,
} from "./snackbar";
import { getOverlayInstance } from "./overlay";

console.log("[Glotian Content] Content script loaded");

type SelectionDetails = {
  text: string;
  pageUrl: string;
  pageTitle: string;
};

const selectionsMap = new Map<string, SelectionDetails>();

function generateNoteId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `note-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createCapture(
  text: string,
  options: { noteId?: string; pageUrl?: string; pageTitle?: string } = {},
): string {
  const noteId = options.noteId ?? generateNoteId();
  const details: SelectionDetails = {
    text,
    pageUrl: options.pageUrl || window.location.href,
    pageTitle: options.pageTitle || document.title,
  };

  selectionsMap.set(noteId, details);
  sendCaptureToBackground(text, noteId);
  return noteId;
}

// Listen to keyboard shortcuts
// Note: event.code is layout-independent, so shortcuts still fire on non-Latin keyboards.
document.addEventListener("keydown", (event) => {
  // Ctrl+Shift+F (or Cmd+Shift+F on Mac) for text capture
  if (
    (event.ctrlKey || event.metaKey) &&
    event.shiftKey &&
    event.code === "KeyF"
  ) {
    event.preventDefault();
    event.stopPropagation();
    handleTextCapture();
  }

  // Ctrl+Shift+K (or Cmd+Shift+K on Mac) for writing coach
  // Task: T076
  if (
    (event.ctrlKey || event.metaKey) &&
    event.shiftKey &&
    event.code === "KeyK"
  ) {
    event.preventDefault();
    event.stopPropagation();
    handleWritingCoach();
  }
});

// Listen to messages from background service worker
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "TRIGGER_CAPTURE") {
    // Triggered from context menu
    console.log("[Glotian Content] Capture triggered from context menu");
    const noteId = createCapture(message.selection, {
      noteId: message.noteId,
      pageUrl: message.pageUrl,
      pageTitle: message.pageTitle,
    });
    sendResponse({ success: true, noteId });
  } else if (message.type === "TRANSLATE_RESPONSE") {
    // Show snackbar with translation
    console.log("[Glotian Content] Received translation response");
    showSnackbar(message);
    sendResponse({ success: true });
  } else if (message.type === "EXTRACT_PAGE_CONTENT") {
    // Extract page content for summarization
    console.log("[Glotian Content] Extracting page content");
    handleExtractPageContent()
      .then((content) => {
        sendResponse(content);
      })
      .catch((error) => {
        console.error("[Glotian Content] Extract error:", error);
        sendResponse({ error: error.message });
      });
    return true; // Keep channel open for async response
  } else if (message.type === "GET_SELECTION") {
    // Get current text selection
    const selection = window.getSelection();
    const selectedText = selection ? selection.toString().trim() : "";
    sendResponse({ selection: selectedText });
  } else if (message.type === "TRIGGER_CAPTURE_SHORTCUT") {
    handleTextCapture();
    sendResponse({ success: true });
  } else if (message.type === "TRIGGER_WRITING_COACH") {
    handleWritingCoach();
    sendResponse({ success: true });
  }

  return false;
});

/**
 * Handle text capture from selection
 */
function handleTextCapture(): void {
  const selection = window.getSelection();
  let selectedText = selection ? selection.toString().trim() : "";

  if (!selectedText) {
    const activeElement = document.activeElement as HTMLElement | null;
    if (activeElement && isEditableField(activeElement)) {
      selectedText = getSelectedTextFromEditable(activeElement);
    }
  }

  if (!selectedText) {
    console.log("[Glotian Content] No text selected");
    showWarningSnackbar(
      "Nothing selected. Highlight text first, then press Ctrl/Cmd+Shift+F.",
    );
    return;
  }

  console.log(
    "[Glotian Content] Text selected:",
    selectedText.substring(0, 50) + "...",
  );

  // Check length limit (1000 chars per spec)
  // Task T050: Handle text >1000 chars with warning modal
  if (selectedText.length > 1000) {
    handleLongTextSelection(selectedText);
    return;
  }

  createCapture(selectedText);
}

/**
 * Send capture request to background service worker
 */
function sendCaptureToBackground(text: string, noteId: string): void {
  const details = selectionsMap.get(noteId);
  const pageUrl = details?.pageUrl || window.location.href;
  const pageTitle = details?.pageTitle || document.title;

  // Task T051: Check if online
  if (!navigator.onLine) {
    handleOfflineCapture(text, noteId, pageUrl, pageTitle);
    return;
  }

  chrome.runtime.sendMessage(
    {
      type: "CAPTURE_TEXT",
      noteId,
      selection: text,
      pageUrl,
      pageTitle,
    },
    (response) => {
      if (chrome.runtime.lastError) {
        console.error(
          "[Glotian Content] Error sending message:",
          chrome.runtime.lastError,
        );
        showError("Failed to capture text. Please try again.");
        selectionsMap.delete(noteId);
        return;
      }

      if (response?.error) {
        showError(response.error);
        selectionsMap.delete(noteId);
        return;
      }

      console.log(
        "[Glotian Content] Capture sent to background for note:",
        noteId,
      );
    },
  );
}

/**
 * Show snackbar with translation result
 */
function showSnackbar(response: any): void {
  console.log("[Glotian Content] Showing translation snackbar");

  const noteId: string | undefined = response.noteId;
  const selection = noteId ? selectionsMap.get(noteId) : undefined;

  if (noteId && !selection) {
    console.warn(
      "[Glotian Content] No cached selection found for note:",
      noteId,
    );
  }

  if (response.error) {
    showErrorSnackbar(response.error);
  } else {
    showTranslationSnackbar({
      noteId: response.noteId,
      translatedText: response.translatedText,
      originalText: selection?.text || response.originalText || "",
      tags: response.tags || [],
    });
  }

  if (noteId) {
    selectionsMap.delete(noteId);
  }
}

/**
 * Show warning message
 */
function showWarning(message: string): void {
  console.warn("[Glotian Content]", message);
  showWarningSnackbar(message);
}

/**
 * Show error message
 */
function showError(message: string): void {
  console.error("[Glotian Content]", message);
  showErrorSnackbar(message);
}

/**
 * Handle text selection exceeding 1000 characters
 * Task: T050
 */
function handleLongTextSelection(text: string): void {
  const charCount = text.length;
  const message = `Selected text is ${charCount} characters (max 1000).\n\nWould you like to save the first 1000 characters?`;

  if (confirm(message)) {
    // Trim to 1000 chars and save
    const trimmedText = text.substring(0, 1000);
    createCapture(trimmedText);
  } else {
    showWarningSnackbar(
      "Text not saved. Please select a shorter passage (max 1000 characters).",
    );
  }
}

/**
 * Handle offline text capture
 * Task: T051
 */
function handleOfflineCapture(
  text: string,
  noteId: string,
  pageUrl: string,
  pageTitle: string,
): void {
  console.log("[Glotian Content] Offline capture detected");

  // Send to background anyway - it will queue locally
  chrome.runtime.sendMessage(
    {
      type: "CAPTURE_TEXT_OFFLINE",
      noteId,
      selection: text,
      pageUrl,
      pageTitle,
    },
    (response) => {
      if (chrome.runtime.lastError) {
        console.error(
          "[Glotian Content] Error queueing offline capture:",
          chrome.runtime.lastError,
        );
        showError("Failed to save text offline. Please try again when online.");
        selectionsMap.delete(noteId);
        return;
      }

      // Show success message with offline indicator
      showWarningSnackbar(
        "Note saved offline. Translation will complete when you're back online. ⏳",
      );

      selectionsMap.delete(noteId);
    },
  );
}

/**
 * Handle page content extraction for summarization
 * Task: T061
 */
async function handleExtractPageContent(): Promise<{
  content: string;
  error?: string;
}> {
  try {
    // Import extraction utility
    const { extractPageContentWithRetry } = await import("./page-extract");

    // Extract content with SPA retry logic
    const extracted = await extractPageContentWithRetry();

    if (!extracted || extracted.content.length < 100) {
      return {
        content: "",
        error:
          "No content found on this page. The page might be empty or contain mostly images.",
      };
    }

    return {
      content: extracted.content,
    };
  } catch (error) {
    console.error("[Glotian Content] Content extraction error:", error);
    return {
      content: "",
      error:
        error instanceof Error
          ? error.message
          : "Failed to extract page content",
    };
  }
}

/**
 * Handle writing coach activation
 * Task: T076, T077
 */
function handleWritingCoach(): void {
  console.log("[Glotian Content] Writing coach triggered");

  // Find the currently focused input field
  const activeElement = document.activeElement as HTMLElement;

  // Check if active element is an editable field
  if (!isEditableField(activeElement)) {
    console.log("[Glotian Content] No editable field focused");
    showWarningSnackbar(
      "Writing Coach: Please focus on a text input field first (click inside a text area or input field).",
    );
    return;
  }

  // Get overlay instance and show it
  const overlay = getOverlayInstance();
  overlay.show(activeElement);

  console.log("[Glotian Content] Writing coach overlay shown");
}

/**
 * Check if element is an editable field (text input, textarea, or contentEditable)
 */
function isEditableField(element: HTMLElement | null): boolean {
  if (!element) {
    return false;
  }

  // Check for input elements
  if (element instanceof HTMLInputElement) {
    const type = element.type.toLowerCase();
    return (
      type === "text" ||
      type === "email" ||
      type === "search" ||
      type === "url" ||
      type === "tel"
    );
  }

  // Check for textarea
  if (element instanceof HTMLTextAreaElement) {
    return true;
  }

  // Check for contentEditable
  if (element.isContentEditable) {
    return true;
  }

  return false;
}

/**
 * Get selected text from editable fields (input, textarea, contentEditable)
 */
function getSelectedTextFromEditable(element: HTMLElement): string {
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement
  ) {
    const start = element.selectionStart ?? element.selectionEnd ?? 0;
    const end = element.selectionEnd ?? element.selectionStart ?? start;
    if (typeof start === "number" && typeof end === "number" && end > start) {
      return element.value.substring(start, end).trim();
    }
    return "";
  }

  if (element.isContentEditable) {
    const selection = window.getSelection();
    return selection ? selection.toString().trim() : "";
  }

  return "";
}

// Initialize
console.log(
  "[Glotian Content] Content script initialized. Press Ctrl+Shift+F to capture selected text, Ctrl+Shift+K to open writing coach.",
);
