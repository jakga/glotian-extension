/**
 * Snackbar component for displaying translation results
 *
 * Uses Shadow DOM to avoid CSS conflicts with host page.
 * Positioned top-right, auto-dismisses after 5 seconds.
 *
 * Tasks: T043-T045
 */

interface SnackbarOptions {
  noteId: string;
  translatedText: string;
  originalText: string;
  tags: string[];
  duration?: number; // Auto-dismiss duration in ms (default: 5000)
}

let currentSnackbar: HTMLElement | null = null;
let dismissTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Show translation overlay popup (persistent, user-dismissible)
 *
 * @param options Snackbar configuration
 */
export function showTranslationSnackbar(options: SnackbarOptions): void {
  // Remove existing snackbar if present
  hideSnackbar();

  console.log("[Glotian Content] Showing translation popup");

  // Create overlay backdrop
  const container = document.createElement("div");
  container.id = "glotian-snackbar-container";
  container.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 2147483647;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(4px);
  `;

  // Attach shadow DOM to isolate styles
  const shadow = container.attachShadow({ mode: "open" });

  // Create popup content
  const popup = document.createElement("div");
  popup.className = "glotian-popup";

  // Inject styles into shadow DOM
  const style = document.createElement("style");
  style.textContent = getPopupStyles();
  shadow.appendChild(style);

  // Build popup HTML
  popup.innerHTML = `
    <div class="popup-header">
      <div class="popup-icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15l-5-5 1.41-1.41L11 14.17l7.59-7.59L20 8l-9 9z" fill="#10b981"/>
        </svg>
      </div>
      <div class="popup-title">Translation Saved!</div>
      <button class="popup-close" aria-label="Close" data-action="close" title="Close (Esc)">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M15 5L5 15M5 5l10 10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </button>
    </div>

    <div class="popup-content">
      <div class="text-section">
        <div class="text-label">Original</div>
        <div class="text-value original">${escapeHtml(options.originalText)}</div>
      </div>

      <div class="translation-arrow">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path d="M12 4v16m0 0l-6-6m6 6l6-6" stroke="#9ca3af" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>

      <div class="text-section">
        <div class="text-label">Translation</div>
        <div class="text-value translated">${escapeHtml(options.translatedText)}</div>
      </div>

      ${
        options.tags.length > 0
          ? `
        <div class="popup-tags">
          <div class="tags-label">Tags</div>
          <div class="tags-list">
            ${options.tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}
          </div>
        </div>
      `
          : ""
      }
    </div>

    <div class="popup-actions">
      <button class="popup-button secondary" data-action="view">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M8 3C4.5 3 1.73 5.61 1 9c.73 3.39 3.5 6 7 6s6.27-2.61 7-6c-.73-3.39-3.5-6-7-6zm0 10a4 4 0 110-8 4 4 0 010 8zm0-6a2 2 0 100 4 2 2 0 000-4z" fill="currentColor"/>
        </svg>
        View in Side Panel
      </button>
      <button class="popup-button primary" data-action="close">
        Got it
      </button>
    </div>
  `;

  shadow.appendChild(popup);

  // Attach event listeners
  attachPopupListeners(shadow, container, options);

  // Add to DOM
  document.body.appendChild(container);
  currentSnackbar = container;

  // Animate in
  requestAnimationFrame(() => {
    popup.classList.add("show");
  });

  // No auto-dismiss - user must close manually
  // Clear any existing dismiss timer
  if (dismissTimer) {
    clearTimeout(dismissTimer);
    dismissTimer = null;
  }
}

/**
 * Hide and remove current popup
 */
export function hideSnackbar(): void {
  // Clear any pending dismiss timer
  if (dismissTimer) {
    clearTimeout(dismissTimer);
    dismissTimer = null;
  }

  if (!currentSnackbar) return;

  const shadow = currentSnackbar.shadowRoot;
  if (shadow) {
    const popup = shadow.querySelector(".glotian-popup");
    if (popup) {
      popup.classList.remove("show");
      popup.classList.add("hide");

      // Wait for animation to complete
      setTimeout(() => {
        currentSnackbar?.remove();
        currentSnackbar = null;
      }, 300);

      return;
    }
  }

  // Fallback: immediate removal
  currentSnackbar.remove();
  currentSnackbar = null;
}

/**
 * Attach event listeners to popup buttons
 */
function attachPopupListeners(
  shadow: ShadowRoot,
  container: HTMLElement,
  options: SnackbarOptions,
): void {
  // Close button
  const closeBtns = shadow.querySelectorAll('[data-action="close"]');
  closeBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      hideSnackbar();
    });
  });

  // View in Side Panel button
  const viewBtn = shadow.querySelector('[data-action="view"]');
  viewBtn?.addEventListener("click", () => {
    console.log("[Glotian Content] View in Side Panel clicked");
    // Open side panel - this requires user gesture so should work
    chrome.runtime.sendMessage({
      type: "OPEN_SIDE_PANEL",
      tab: "translate",
    });
    hideSnackbar();
  });

  // Click backdrop to close
  container.addEventListener("click", (e) => {
    if (e.target === container) {
      hideSnackbar();
    }
  });

  // ESC key to close
  const escHandler = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      hideSnackbar();
      document.removeEventListener("keydown", escHandler);
    }
  };
  document.addEventListener("keydown", escHandler);
}

/**
 * Get CSS styles for popup overlay
 */
function getPopupStyles(): string {
  return `
    .glotian-popup {
      background: white;
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      width: 480px;
      max-width: calc(100vw - 40px);
      max-height: calc(100vh - 80px);
      overflow: hidden;
      transform: scale(0.9);
      opacity: 0;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      display: flex;
      flex-direction: column;
    }

    .glotian-popup.show {
      transform: scale(1);
      opacity: 1;
    }

    .glotian-popup.hide {
      transform: scale(0.9);
      opacity: 0;
    }

    .popup-header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 20px 24px;
      border-bottom: 1px solid #e5e7eb;
      background: linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%);
    }

    .popup-icon {
      flex-shrink: 0;
    }

    .popup-title {
      flex: 1;
      font-size: 18px;
      font-weight: 600;
      color: #111827;
    }

    .popup-close {
      background: none;
      border: none;
      padding: 6px;
      cursor: pointer;
      color: #6b7280;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 6px;
      transition: all 0.2s;
    }

    .popup-close:hover {
      background: rgba(0, 0, 0, 0.05);
      color: #111827;
    }

    .popup-content {
      padding: 24px;
      overflow-y: auto;
      flex: 1;
    }

    .text-section {
      margin-bottom: 20px;
    }

    .text-section:last-of-type {
      margin-bottom: 0;
    }

    .text-label {
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #6b7280;
      margin-bottom: 8px;
    }

    .text-value {
      font-size: 16px;
      line-height: 1.6;
      color: #111827;
      padding: 12px;
      background: #f9fafb;
      border-radius: 8px;
      border-left: 3px solid #d1d5db;
    }

    .text-value.original {
      border-left-color: #3b82f6;
    }

    .text-value.translated {
      border-left-color: #10b981;
      font-weight: 500;
    }

    .translation-arrow {
      display: flex;
      justify-content: center;
      margin: 16px 0;
    }

    .popup-tags {
      margin-top: 20px;
      padding-top: 20px;
      border-top: 1px solid #e5e7eb;
    }

    .tags-label {
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #6b7280;
      margin-bottom: 8px;
    }

    .tags-list {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .tag {
      display: inline-block;
      padding: 4px 12px;
      background: #eff6ff;
      color: #1e40af;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 500;
    }

    .popup-actions {
      display: flex;
      gap: 12px;
      padding: 20px 24px;
      border-top: 1px solid #e5e7eb;
      background: #f9fafb;
    }

    .popup-button {
      flex: 1;
      padding: 12px 16px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      border: none;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }

    .popup-button.primary {
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      color: white;
      box-shadow: 0 2px 8px rgba(16, 185, 129, 0.3);
    }

    .popup-button.primary:hover {
      box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
      transform: translateY(-1px);
    }

    .popup-button.secondary {
      background: white;
      color: #374151;
      border: 1px solid #d1d5db;
    }

    .popup-button.secondary:hover {
      background: #f9fafb;
      border-color: #9ca3af;
    }

    /* Scrollbar styles */
    .popup-content::-webkit-scrollbar {
      width: 8px;
    }

    .popup-content::-webkit-scrollbar-track {
      background: #f3f4f6;
      border-radius: 4px;
    }

    .popup-content::-webkit-scrollbar-thumb {
      background: #d1d5db;
      border-radius: 4px;
    }

    .popup-content::-webkit-scrollbar-thumb:hover {
      background: #9ca3af;
    }
  `;
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
 * Get base CSS styles for snackbar notifications
 */
function getSnackbarStyles(): string {
  return `
    .glotian-snackbar {
      background: white;
      border-radius: 12px;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
      width: 360px;
      max-width: calc(100vw - 40px);
      overflow: hidden;
      transform: translateX(100%);
      opacity: 0;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .glotian-snackbar.show {
      transform: translateX(0);
      opacity: 1;
    }

    .snackbar-header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px;
      border-bottom: 1px solid #e5e7eb;
      background: #f9fafb;
    }

    .snackbar-icon {
      flex-shrink: 0;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .snackbar-title {
      flex: 1;
      font-size: 16px;
      font-weight: 600;
      color: #111827;
    }

    .snackbar-close {
      background: none;
      border: none;
      padding: 4px;
      cursor: pointer;
      color: #6b7280;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
      transition: background-color 0.2s;
    }

    .snackbar-close:hover {
      background: #e5e7eb;
    }

    .snackbar-content {
      padding: 16px;
    }

    .snackbar-text {
      font-size: 14px;
      line-height: 1.5;
      color: #374151;
    }
  `;
}

/**
 * Show error snackbar
 *
 * @param message Error message
 */
export function showErrorSnackbar(message: string): void {
  hideSnackbar();

  const container = document.createElement("div");
  container.id = "glotian-snackbar-container";
  container.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 2147483647;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  `;

  const shadow = container.attachShadow({ mode: "open" });

  const snackbar = document.createElement("div");
  snackbar.className = "glotian-snackbar error";

  const style = document.createElement("style");
  style.textContent = getSnackbarStyles() + getErrorStyles();
  shadow.appendChild(style);

  snackbar.innerHTML = `
    <div class="snackbar-header">
      <div class="snackbar-icon error-icon">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M10 0C4.48 0 0 4.48 0 10s4.48 10 10 10 10-4.48 10-10S15.52 0 10 0zm1 15H9v-2h2v2zm0-4H9V5h2v6z" fill="#ef4444"/>
        </svg>
      </div>
      <div class="snackbar-title">Error</div>
      <button class="snackbar-close" aria-label="Close">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </button>
    </div>

    <div class="snackbar-content">
      <div class="snackbar-text">${escapeHtml(message)}</div>
    </div>
  `;

  shadow.appendChild(snackbar);

  // Close button listener
  const closeBtn = shadow.querySelector(".snackbar-close");
  closeBtn?.addEventListener("click", () => hideSnackbar());

  document.body.appendChild(container);
  currentSnackbar = container;

  requestAnimationFrame(() => {
    snackbar.classList.add("show");
  });

  // Auto-dismiss after 5 seconds
  if (dismissTimer) {
    clearTimeout(dismissTimer);
  }
  dismissTimer = setTimeout(() => {
    hideSnackbar();
  }, 5000);
}

/**
 * Get error-specific styles
 */
function getErrorStyles(): string {
  return `
    .glotian-snackbar.error .snackbar-header {
      background: #fef2f2;
      border-bottom-color: #fecaca;
    }

    .glotian-snackbar.error .snackbar-title {
      color: #991b1b;
    }
  `;
}

/**
 * Get warning-specific styles
 */
function getWarningStyles(): string {
  return `
    .glotian-snackbar.warning .snackbar-header {
      background: #fffbeb;
      border-bottom-color: #fde68a;
    }

    .glotian-snackbar.warning .snackbar-title {
      color: #92400e;
    }
  `;
}

/**
 * Show warning snackbar
 *
 * @param message Warning message
 */
export function showWarningSnackbar(message: string): void {
  hideSnackbar();

  const container = document.createElement("div");
  container.id = "glotian-snackbar-container";
  container.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 2147483647;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  `;

  const shadow = container.attachShadow({ mode: "open" });

  const snackbar = document.createElement("div");
  snackbar.className = "glotian-snackbar warning";

  const style = document.createElement("style");
  style.textContent = getSnackbarStyles() + getWarningStyles();
  shadow.appendChild(style);

  snackbar.innerHTML = `
    <div class="snackbar-header">
      <div class="snackbar-icon warning-icon">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M10 0C4.48 0 0 4.48 0 10s4.48 10 10 10 10-4.48 10-10S15.52 0 10 0zm1 15H9v-2h2v2zm0-4H9V5h2v6z" fill="#f59e0b"/>
        </svg>
      </div>
      <div class="snackbar-title">Warning</div>
      <button class="snackbar-close" aria-label="Close">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </button>
    </div>

    <div class="snackbar-content">
      <div class="snackbar-text">${escapeHtml(message)}</div>
    </div>
  `;

  shadow.appendChild(snackbar);

  const closeBtn = shadow.querySelector(".snackbar-close");
  closeBtn?.addEventListener("click", () => hideSnackbar());

  document.body.appendChild(container);
  currentSnackbar = container;

  requestAnimationFrame(() => {
    snackbar.classList.add("show");
  });

  if (dismissTimer) {
    clearTimeout(dismissTimer);
  }
  dismissTimer = setTimeout(() => {
    hideSnackbar();
  }, 5000);
}
