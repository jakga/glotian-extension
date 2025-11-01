/**
 * Capture tab component
 *
 * Tasks: T046-T049
 * - Display recent 20 notes
 * - Search functionality with debounce
 * - Filter by tags
 * - Sync status indicators
 */

import { db } from "@/lib/db/schema";
import type { CachedNote } from "@/types";
import { getSetting } from "@/lib/storage";

// State
let allNotes: CachedNote[] = [];
let filteredNotes: CachedNote[] = [];
let searchTimeout: number | null = null;

/**
 * Initialize capture tab
 * Task: T046
 */
export async function initCaptureTab(): Promise<void> {
  console.log("[Glotian Capture] Initializing capture tab");

  // Load recent notes
  await loadRecentNotes();

  // Setup search input
  setupSearch();

  // Setup tag filters
  setupTagFilters();

  // Listen for new notes
  listenForNoteUpdates();

  console.log("[Glotian Capture] Capture tab initialized");
}

/**
 * Load recent 20 notes from IndexedDB
 * Task: T047
 */
async function loadRecentNotes(): Promise<void> {
  const userId = await getSetting("userId");

  if (!userId) {
    showEmptyState("Please log in to view your notes");
    return;
  }

  try {
    // Query notes ordered by createdAt descending
    const notes = await db.notes
      .where("userId")
      .equals(userId)
      .sortBy("createdAt");

    // Take only recent 20 (reverse to get descending order)
    allNotes = notes.reverse().slice(0, 20);

    filteredNotes = [...allNotes];

    console.log(
      `[Glotian Capture] Loaded ${allNotes.length} notes from IndexedDB`,
    );

    if (allNotes.length === 0) {
      showEmptyState(
        "No notes yet. Select text on any page and press Ctrl+Shift+F to capture!",
      );
    } else {
      renderNotes(filteredNotes);
    }
  } catch (error) {
    console.error("[Glotian Capture] Error loading notes:", error);
    showEmptyState("Error loading notes. Please try again.");
  }
}

/**
 * Setup search input with debounce
 * Task: T048
 */
function setupSearch(): void {
  const searchInput = document.getElementById(
    "capture-search",
  ) as HTMLInputElement;

  if (!searchInput) {
    // Create search input if it doesn't exist
    const container = document.getElementById("recent-notes");
    if (!container) return;

    const searchHTML = `
      <div class="search-container">
        <input
          type="text"
          id="capture-search"
          class="search-input"
          placeholder="Search notes..."
          autocomplete="off"
        />
        <svg class="search-icon" width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M7 12a5 5 0 100-10 5 5 0 000 10zM13 13l-3-3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </div>
      <div id="notes-list"></div>
    `;

    container.innerHTML = searchHTML;

    // Retry setup
    return setupSearch();
  }

  // Debounced search (300ms delay)
  searchInput.addEventListener("input", (event) => {
    const query = (event.target as HTMLInputElement).value.trim().toLowerCase();

    // Clear existing timeout
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }

    // Set new timeout
    searchTimeout = window.setTimeout(() => {
      performSearch(query);
    }, 300);
  });
}

/**
 * Perform search on notes
 */
function performSearch(query: string): void {
  console.log("[Glotian Capture] Searching for:", query);

  if (!query) {
    // Show all notes if query is empty
    filteredNotes = [...allNotes];
  } else {
    // Filter by title, content, summary, or tags
    filteredNotes = allNotes.filter((note) => {
      const searchableText = [
        note.title ?? "",
        note.content,
        note.summary ?? "",
        ...note.tags,
      ]
        .join(" ")
        .toLowerCase();

      return searchableText.includes(query);
    });
  }

  renderNotes(filteredNotes);
}

/**
 * Setup tag filters
 */
function setupTagFilters(): void {
  // Extract unique tags from all notes
  const allTags = new Set<string>();
  allNotes.forEach((note) => {
    note.tags.forEach((tag: string) => allTags.add(tag));
  });

  if (allTags.size === 0) return;

  // Create tag filter UI
  const container = document.getElementById("recent-notes");
  if (!container) return;

  const tagsHTML = `
    <div class="tag-filters">
      <span class="filter-label">Filter by tag:</span>
      <button class="tag-filter active" data-tag="all">All</button>
      ${Array.from(allTags)
        .map(
          (tag) =>
            `<button class="tag-filter" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)}</button>`,
        )
        .join("")}
    </div>
  `;

  // Insert before notes list
  const notesList = document.getElementById("notes-list");
  if (notesList) {
    notesList.insertAdjacentHTML("beforebegin", tagsHTML);

    // Attach event listeners
    const tagButtons = container.querySelectorAll(".tag-filter");
    tagButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const tag = btn.getAttribute("data-tag");
        if (!tag) return;

        // Update active state
        tagButtons.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");

        // Filter notes
        filterByTag(tag);
      });
    });
  }
}

/**
 * Filter notes by tag
 */
function filterByTag(tag: string): void {
  console.log("[Glotian Capture] Filtering by tag:", tag);

  if (tag === "all") {
    filteredNotes = [...allNotes];
  } else {
    filteredNotes = allNotes.filter((note) => note.tags.includes(tag));
  }

  renderNotes(filteredNotes);
}

/**
 * Render notes list with sync status indicators
 * Task: T049
 */
function renderNotes(notes: CachedNote[]): void {
  const notesList = document.getElementById("notes-list");
  if (!notesList) return;

  if (notes.length === 0) {
    notesList.innerHTML = '<p class="placeholder">No matching notes found.</p>';
    return;
  }

  const notesHTML = notes
    .map(
      (note) => `
    <div class="note-card" data-note-id="${note.id}">
      <div class="note-header">
        <div class="note-meta">
          <span class="note-date">${formatDate(note.createdAt)}</span>
          ${getSyncStatusBadge(note.syncStatus)}
        </div>
        <button class="note-action" data-action="view" data-note-id="${note.id}" title="View details">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M8 3C4.5 3 1.73 5.61 1 9c.73 3.39 3.5 6 7 6s6.27-2.61 7-6c-.73-3.39-3.5-6-7-6zm0 10a4 4 0 110-8 4 4 0 010 8zm0-6a2 2 0 100 4 2 2 0 000-4z" fill="currentColor"/>
          </svg>
        </button>
      </div>

      <div class="note-content">
        <div class="note-original">${escapeHtml(
          note.content.substring(0, 120),
        )}${note.content.length > 120 ? "..." : ""}</div>
        ${
          note.summary
            ? `<div class="note-summary">${escapeHtml(
                note.summary.substring(0, 120),
              )}${note.summary.length > 120 ? "..." : ""}</div>`
            : ""
        }
      </div>

      ${note.tags.length > 0 ? `<div class="note-tags">${note.tags.map((tag: string) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>` : ""}

      <div class="note-actions">
        <button class="btn-secondary" data-action="flashcards" data-note-id="${note.id}">
          Create Flashcards
        </button>
        <button class="btn-secondary" data-action="open-web" data-note-id="${note.id}">
          Open in Web App
        </button>
      </div>
    </div>
  `,
    )
    .join("");

  notesList.innerHTML = notesHTML;

  // Attach event listeners to action buttons
  attachNoteActionListeners();
}

/**
 * Get sync status badge HTML
 * Task: T049
 */
function getSyncStatusBadge(status: "pending" | "synced" | "failed"): string {
  const badges = {
    pending:
      '<span class="sync-badge pending" title="Waiting to sync">⏳ Pending</span>',
    synced:
      '<span class="sync-badge synced" title="Synced to server">✓ Synced</span>',
    failed:
      '<span class="sync-badge failed" title="Sync failed - will retry">⚠ Failed</span>',
  };

  return badges[status];
}

/**
 * Format date for display
 */
function formatDate(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Show empty state message
 */
function showEmptyState(message: string): void {
  const notesList = document.getElementById("notes-list");
  if (!notesList) return;

  notesList.innerHTML = `<p class="placeholder">${escapeHtml(message)}</p>`;
}

/**
 * Attach event listeners to note action buttons
 */
function attachNoteActionListeners(): void {
  const actionButtons = document.querySelectorAll(
    ".note-card button[data-action]",
  );

  actionButtons.forEach((btn) => {
    btn.addEventListener("click", async (event) => {
      const action = (event.currentTarget as HTMLElement).getAttribute(
        "data-action",
      );
      const noteId = (event.currentTarget as HTMLElement).getAttribute(
        "data-note-id",
      );

      if (!action || !noteId) return;

      console.log(
        `[Glotian Capture] Note action: ${action} for note ${noteId}`,
      );

      if (action === "view") {
        await showNoteDetails(noteId);
      } else if (action === "flashcards") {
        await createFlashcardsFromNote(noteId);
      } else if (action === "open-web") {
        await openNoteInWebApp(noteId);
      }
    });
  });
}

/**
 * Show note details modal
 */
async function showNoteDetails(noteId: string): Promise<void> {
  const note = await db.notes.get(noteId);
  if (!note) {
    alert("Note not found");
    return;
  }

  // TODO: Implement proper modal in Phase 9
  const details = `
Title: ${note.title ?? "Untitled"}

Content:
${note.content}

${note.summary ? `Summary: ${note.summary}` : ""}

Tags: ${note.tags.join(", ")}

Source: ${note.sourceUrl || "Unknown"}

Created: ${new Date(note.createdAt).toLocaleString()}
Status: ${note.syncStatus}
  `.trim();

  alert(details);
}

/**
 * Create flashcards from note
 */
async function createFlashcardsFromNote(noteId: string): Promise<void> {
  const note = await db.notes.get(noteId);
  if (!note) {
    alert("Note not found");
    return;
  }

  // Send message to background to extract flashcards
  try {
    const response = await chrome.runtime.sendMessage({
      type: "EXTRACT_FLASHCARDS",
      noteId,
    });

    if (response.success) {
      alert(`Created ${response.count} flashcards from this note!`);
    } else {
      alert("Failed to create flashcards: " + response.error);
    }
  } catch (error) {
    console.error("[Glotian Capture] Error creating flashcards:", error);
    alert("Failed to create flashcards. Please try again.");
  }
}

/**
 * Open note in web app
 */
async function openNoteInWebApp(noteId: string): Promise<void> {
  // Check if note is synced first
  const note = await db.notes.get(noteId);
  if (!note) {
    alert("Note not found");
    return;
  }

  if (note.syncStatus === "pending") {
    const proceed = confirm(
      "This note hasn't been synced yet. Sync now and open in web app?",
    );
    if (!proceed) return;

    // Trigger sync
    await chrome.runtime.sendMessage({ type: "SYNC_NOW" });
    alert("Note is syncing. Please wait a moment and try again.");
    return;
  }

  // Open in web app
  const webAppUrl = `https://glotian.app/notes/${noteId}`;
  chrome.tabs.create({ url: webAppUrl });
}

/**
 * Listen for note updates from background
 */
function listenForNoteUpdates(): void {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    (async () => {
      try {
        if (
          message.type === "NOTE_CREATED" ||
          message.type === "NOTE_UPDATED"
        ) {
          console.log("[Glotian Capture] Note updated, reloading...");
          await loadRecentNotes();
        } else if (message.type === "SYNC_STATUS_CHANGED") {
          // Update sync badges without full reload
          await updateSyncStatuses();
        }
        sendResponse({ success: true });
      } catch (error) {
        console.error("[Glotian Capture] Error handling message:", error);
        sendResponse({ success: false, error: String(error) });
      }
    })();
    return true; // Async response - keeps message channel open
  });
}

/**
 * Update sync status badges for all visible notes
 */
async function updateSyncStatuses(): Promise<void> {
  const userId = await getSetting("userId");
  if (!userId) return;

  // Refresh notes from IndexedDB
  const updatedNotes = await db.notes
    .where("userId")
    .equals(userId)
    .reverse()
    .sortBy("createdAt");

  // Update each note card's sync badge
  updatedNotes.slice(0, 20).forEach((note) => {
    const noteCard = document.querySelector(`[data-note-id="${note.id}"]`);
    if (noteCard) {
      const syncBadge = noteCard.querySelector(".sync-badge");
      if (syncBadge) {
        const newBadge = getSyncStatusBadge(note.syncStatus);
        syncBadge.outerHTML = newBadge;
      }
    }
  });
}

/**
 * Refresh capture tab (called when tab becomes active)
 */
export async function refreshCaptureTab(): Promise<void> {
  console.log("[Glotian Capture] Refreshing capture tab");
  await loadRecentNotes();
}
