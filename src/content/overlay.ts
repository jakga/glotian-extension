/**
 * Writing Coach Overlay Component
 * Provides grammar checking and rewriting suggestions for text input fields
 *
 * Features:
 * - Shadow DOM for style isolation
 * - Positioned next to active input field
 * - Real-time text mirroring
 * - Grammar corrections display
 * - Tone/length rewriting options
 *
 * @see specs/003-glotian-chrome-extension/contracts/ai-api.md
 */

import type { ProofreadResponse } from "../lib/ai/proofreader";
import type { RewriteResponse } from "../lib/ai/types";

export class WritingCoachOverlay {
  private overlay: HTMLDivElement | null = null;
  private shadowRoot: ShadowRoot | null = null;
  private targetInput: HTMLElement | null = null;
  private isVisible: boolean = false;
  private currentText: string = "";
  private currentCorrections: ProofreadResponse["corrections"] = [];
  private currentRewrites: string[] = [];
  private learningExpressions: RewriteResponse["learningExpressions"] = [];

  // Error toast state
  private lastError: string = "";
  private errorTimeoutId: NodeJS.Timeout | null = null;
  private errorDebouncedTimeoutId: NodeJS.Timeout | null = null;
  private readonly ERROR_AUTO_HIDE_MS: number = 5000; // 5 seconds
  private readonly ERROR_DEBOUNCE_MS: number = 500; // 500ms

  // Listener management for cleanup
  private inputListeners: Array<{
    element: HTMLElement | Window;
    event: string;
    handler: EventListener;
  }> = [];

  constructor() {
    console.log("[Writing Coach] Overlay initialized");
  }

  /**
   * Show overlay next to the specified input element
   */
  public async show(targetElement: HTMLElement): Promise<void> {
    if (this.isVisible) {
      console.log("[Writing Coach] Overlay already visible");
      return;
    }

    this.targetInput = targetElement;
    this.currentText = this.getInputText(targetElement);

    // Create overlay if not exists
    if (!this.overlay) {
      this.createOverlay();
    }

    // Position overlay
    this.positionOverlay();

    // Show overlay
    this.overlay!.style.display = "flex";
    this.isVisible = true;

    // Set up input text mirroring
    this.setupTextMirroring();

    // Set up scroll listener to follow target input
    this.setupScrollListener();

    console.log("[Writing Coach] Overlay shown");
  }

  /**
   * Hide overlay and clean up
   */
  public hide(): void {
    if (!this.isVisible) {
      return;
    }

    // Preserve input focus before hiding
    if (this.targetInput) {
      this.targetInput.focus();
    }

    if (this.overlay) {
      this.overlay.style.display = "none";
    }

    this.isVisible = false;
    this.currentCorrections = [];
    this.currentRewrites = [];
    this.learningExpressions = [];

    // Clean up all registered listeners
    this.inputListeners.forEach(({ element, event, handler }) => {
      element.removeEventListener(event, handler, true);
    });
    this.inputListeners = [];

    // Clean up error state
    this.clearError();

    console.log("[Writing Coach] Overlay hidden");
  }

  /**
   * Create overlay DOM structure with Shadow DOM
   */
  private createOverlay(): void {
    // Create container
    this.overlay = document.createElement("div");
    this.overlay.id = "glotian-writing-coach-overlay";
    this.overlay.setAttribute("role", "dialog");
    this.overlay.setAttribute("aria-modal", "true");
    this.overlay.setAttribute("aria-labelledby", "overlay-title");
    this.overlay.tabIndex = -1;
    this.overlay.style.cssText = `
      position: fixed;
      z-index: 2147483647;
      display: none;
      flex-direction: column;
      width: 400px;
      max-width: min(420px, calc(100vw - 24px));
      max-height: min(600px, calc(100vh - 32px));
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 14px;
      overflow: hidden;
    `;

    // Create Shadow DOM for style isolation
    this.shadowRoot = this.overlay.attachShadow({ mode: "open" });

    // Add styles
    const style = document.createElement("style");
    style.textContent = this.getOverlayStyles();
    this.shadowRoot.appendChild(style);

    // Create content
    const container = document.createElement("div");
    container.className = "overlay-container";
    container.innerHTML = this.getOverlayHTML();

    this.shadowRoot.appendChild(container);

    // Attach event listeners
    this.attachEventListeners();

    // Append to document body
    document.body.appendChild(this.overlay);
  }

  /**
   * Get CSS styles for overlay
   */
  private getOverlayStyles(): string {
    return `
      * {
        box-sizing: border-box;
      }

      .overlay-container {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: white;
      }

      .overlay-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 16px;
        border-bottom: 1px solid #e5e7eb;
      }

      .overlay-title {
        font-size: 16px;
        font-weight: 600;
        color: #111827;
        margin: 0;
      }

      .close-button {
        background: none;
        border: none;
        font-size: 20px;
        color: #6b7280;
        cursor: pointer;
        padding: 4px;
        line-height: 1;
      }

      .close-button:hover {
        color: #111827;
      }

      .overlay-body {
        flex: 1;
        overflow-y: auto;
        padding: 16px;
        min-height: 0;
      }

      .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      }

      .text-editor {
        width: 100%;
        min-height: 120px;
        padding: 12px;
        border: 1px solid #d1d5db;
        border-radius: 6px;
        font-size: 14px;
        line-height: 1.5;
        resize: vertical;
        font-family: inherit;
        background-color: #ffffff;
        color: #111827;
      }

      .text-editor:focus {
        outline: none;
        border-color: #3b82f6;
        box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
      }

      .text-editor::placeholder {
        color: #9ca3af;
      }

      .text-editor-helper {
        margin-top: 6px;
        font-size: 12px;
        color: #6b7280;
      }

      .action-buttons {
        display: flex;
        gap: 8px;
        margin-top: 12px;
      }

      .btn {
        padding: 8px 16px;
        border: none;
        border-radius: 6px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.15s ease;
      }

      .btn-primary {
        background: #3b82f6;
        color: white;
      }

      .btn-primary:hover {
        background: #2563eb;
      }

      .btn-secondary {
        background: #f3f4f6;
        color: #374151;
      }

      .btn-secondary:hover {
        background: #e5e7eb;
      }

      .btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .loading {
        display: none;
        align-items: center;
        gap: 8px;
        color: #6b7280;
        font-size: 13px;
        margin-top: 12px;
      }

      .loading.active {
        display: flex;
      }

      .spinner {
        width: 16px;
        height: 16px;
        border: 2px solid #e5e7eb;
        border-top-color: #3b82f6;
        border-radius: 50%;
        animation: spin 0.6s linear infinite;
      }

      @keyframes spin {
        to { transform: rotate(360deg); }
      }

      .corrections-section {
        margin-top: 20px;
        display: none;
      }

      .corrections-section.active {
        display: block;
      }

      .section-title {
        font-size: 14px;
        font-weight: 600;
        color: #111827;
        margin-bottom: 12px;
      }

      .correction-item {
        padding: 12px;
        background: #fef3c7;
        border-left: 3px solid #f59e0b;
        border-radius: 4px;
        margin-bottom: 12px;
      }

      .correction-item.error {
        background: #fee2e2;
        border-left-color: #ef4444;
      }

      .correction-type {
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        color: #92400e;
        margin-bottom: 6px;
      }

      .correction-item.error .correction-type {
        color: #991b1b;
      }

      .correction-text {
        display: flex;
        gap: 8px;
        align-items: center;
        margin-bottom: 6px;
        font-size: 13px;
      }

      .correction-original {
        text-decoration: line-through;
        color: #6b7280;
      }

      .correction-arrow {
        color: #9ca3af;
      }

      .correction-suggestion {
        color: #047857;
        font-weight: 500;
      }

      .correction-explanation {
        font-size: 12px;
        color: #4b5563;
        line-height: 1.4;
      }

      .no-corrections {
        padding: 16px;
        text-align: center;
        color: #059669;
        background: #d1fae5;
        border-radius: 6px;
        font-weight: 500;
      }

      .rewrite-options {
        display: flex;
        gap: 8px;
        margin-bottom: 12px;
      }

      .rewrite-select {
        flex: 1;
        padding: 8px 12px;
        border: 1px solid #d1d5db;
        border-radius: 6px;
        font-size: 13px;
        background: #ffffff;
        color: #111827;
        cursor: pointer;
      }

      .rewrite-tabs {
        display: flex;
        gap: 4px;
        margin-bottom: 12px;
        border-bottom: 1px solid #e5e7eb;
      }

      .rewrite-tab {
        padding: 8px 16px;
        background: none;
        border: none;
        border-bottom: 2px solid transparent;
        font-size: 13px;
        font-weight: 500;
        color: #6b7280;
        cursor: pointer;
        transition: all 0.15s ease;
      }

      .rewrite-tab.active {
        color: #3b82f6;
        border-bottom-color: #3b82f6;
      }

      .rewrite-content {
        padding: 12px;
        background: #f9fafb;
        border-radius: 6px;
        line-height: 1.5;
        font-size: 14px;
        color: #111827;
        max-height: 220px;
        overflow-y: auto;
      }

      .learning-expressions {
        margin-top: 16px;
        padding: 12px;
        background: #eff6ff;
        border-radius: 6px;
      }

      .expression-item {
        margin-bottom: 12px;
        padding-bottom: 12px;
        border-bottom: 1px solid #dbeafe;
      }

      .expression-item:last-child {
        margin-bottom: 0;
        padding-bottom: 0;
        border-bottom: none;
      }

      .expression-comparison {
        display: flex;
        gap: 8px;
        align-items: center;
        margin-bottom: 6px;
        font-size: 13px;
      }

      .expression-before {
        color: #6b7280;
      }

      .expression-after {
        color: #2563eb;
        font-weight: 500;
      }

      .expression-explanation {
        font-size: 12px;
        color: #4b5563;
      }

      .add-flashcard-btn {
        font-size: 11px;
        padding: 4px 8px;
        background: #3b82f6;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        margin-top: 6px;
      }

      .add-flashcard-btn:hover {
        background: #2563eb;
      }

      .error-toast {
        display: none;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 12px 16px;
        margin-bottom: 12px;
        background: #fee2e2;
        border: 1px solid #fecaca;
        border-left: 4px solid #ef4444;
        border-radius: 6px;
        animation: slideDown 0.3s ease-out;
      }

      .error-toast.show {
        display: flex;
      }

      .error-toast[aria-hidden="true"] {
        display: none;
      }

      @keyframes slideDown {
        from {
          opacity: 0;
          transform: translateY(-8px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      .error-content {
        display: flex;
        align-items: center;
        gap: 8px;
        flex: 1;
        min-width: 0;
      }

      .error-icon {
        flex-shrink: 0;
        font-size: 16px;
      }

      .error-message {
        color: #991b1b;
        font-size: 14px;
        line-height: 1.4;
        word-break: break-word;
      }

      .error-dismiss {
        flex-shrink: 0;
        background: none;
        border: none;
        font-size: 20px;
        color: #dc2626;
        cursor: pointer;
        padding: 2px 4px;
        line-height: 1;
        transition: color 0.15s ease;
      }

      .error-dismiss:hover {
        color: #991b1b;
      }

      .error-dismiss:focus {
        outline: 2px solid #3b82f6;
        outline-offset: 1px;
        border-radius: 2px;
      }
    `;
  }

  /**
   * Get HTML structure for overlay
   */
  private getOverlayHTML(): string {
    return `
      <div class="overlay-header">
        <h3 class="overlay-title" id="overlay-title">✍️ Writing Coach</h3>
        <button class="close-button" id="close-btn" type="button" aria-label="Close writing coach">×</button>
      </div>

      <div class="overlay-body">
        <div class="error-toast" id="error-toast" role="alert" aria-live="polite" aria-hidden="true">
          <div class="error-content">
            <span class="error-icon">⚠️</span>
            <span class="error-message" id="error-message"></span>
          </div>
          <button class="error-dismiss" id="error-dismiss" type="button" aria-label="Dismiss error">×</button>
        </div>

        <label class="sr-only" for="text-editor" id="text-editor-label">Text to improve</label>
        <textarea
          class="text-editor"
          id="text-editor"
          placeholder="Enter text to check and improve..."
          aria-labelledby="text-editor-label"
          aria-describedby="text-editor-helper"
        ></textarea>
        <div class="text-editor-helper" id="text-editor-helper">Enter text to check and improve.</div>

        <div class="action-buttons">
          <button
            class="btn btn-primary"
            id="check-btn"
            type="button"
            data-controls="corrections-section"
            aria-controls="corrections-section"
            aria-expanded="false"
          >
            ✓ Check Grammar
          </button>
          <button
            class="btn btn-secondary"
            id="rewrite-btn"
            type="button"
            data-controls="rewrite-section"
            aria-controls="rewrite-section"
            aria-expanded="false"
          >
            ↻ Rewrite
          </button>
        </div>

        <div class="loading" id="loading" role="status" aria-live="polite" aria-hidden="true">
          <div class="spinner"></div>
          <span>Processing...</span>
        </div>

        <div
          class="corrections-section"
          id="corrections-section"
          role="region"
          aria-hidden="true"
          aria-labelledby="corrections-title"
        >
          <h4 class="section-title" id="corrections-title">Grammar Suggestions</h4>
          <div id="corrections-list"></div>
        </div>

        <div
          id="rewrite-section"
          class="corrections-section"
          role="region"
          aria-hidden="true"
          aria-labelledby="rewrite-title"
        >
          <h4 class="section-title" id="rewrite-title">Rewrite Options</h4>
          <div class="rewrite-options">
            <label class="sr-only" id="tone-select-label" for="tone-select">Tone</label>
            <select class="rewrite-select" id="tone-select" aria-labelledby="tone-select-label">
              <option value="neutral">Neutral Tone</option>
              <option value="formal">Formal</option>
              <option value="casual">Casual</option>
              <option value="friendly">Friendly</option>
            </select>
            <label class="sr-only" id="length-select-label" for="length-select">Length</label>
            <select class="rewrite-select" id="length-select" aria-labelledby="length-select-label">
              <option value="as-is">Keep Length</option>
              <option value="shorter">Shorter</option>
              <option value="longer">Longer</option>
            </select>
          </div>
          <div class="rewrite-tabs" id="rewrite-tabs" role="tablist" aria-label="Rewrite versions"></div>
          <div
            class="rewrite-content"
            id="rewrite-content"
            role="tabpanel"
            aria-live="polite"
            tabindex="0"
          ></div>
          <div class="learning-expressions" id="learning-expressions"></div>
        </div>
      </div>
    `;
  }

  /**
   * Attach event listeners to overlay elements
   */
  private attachEventListeners(): void {
    if (!this.shadowRoot) return;

    // Close button
    const closeBtn = this.shadowRoot.getElementById("close-btn");
    closeBtn?.addEventListener("click", () => this.hide());

    // Check grammar button
    const checkBtn = this.shadowRoot.getElementById("check-btn");
    checkBtn?.addEventListener("click", () => this.handleCheckGrammar());

    // Rewrite button
    const rewriteBtn = this.shadowRoot.getElementById("rewrite-btn");
    rewriteBtn?.addEventListener("click", () => this.handleRewrite());

    // Error dismiss button
    const errorDismiss = this.shadowRoot.getElementById("error-dismiss");
    errorDismiss?.addEventListener("click", () => this.hideError());

    // Text editor input
    const textEditor = this.shadowRoot.getElementById(
      "text-editor",
    ) as HTMLTextAreaElement;
    textEditor?.addEventListener("input", (e) => {
      this.currentText = (e.target as HTMLTextAreaElement).value;
      // Update original input field
      if (this.targetInput) {
        this.setInputText(this.targetInput, this.currentText);
      }
    });
  }

  /**
   * Set up text mirroring between original input and overlay editor
   */
  private setupTextMirroring(): void {
    if (!this.shadowRoot || !this.targetInput) return;

    const textEditor = this.shadowRoot.getElementById(
      "text-editor",
    ) as HTMLTextAreaElement;

    if (textEditor) {
      textEditor.value = this.currentText;
    }

    // Listen to changes on original input
    const updateFromInput = () => {
      if (!this.targetInput) return;
      const newText = this.getInputText(this.targetInput);
      if (newText !== this.currentText) {
        this.currentText = newText;
        if (textEditor) {
          textEditor.value = newText;
        }
      }
    };

    this.targetInput.addEventListener("input", updateFromInput);
    this.targetInput.addEventListener("change", updateFromInput);

    // Track listeners for cleanup to prevent memory leaks
    this.inputListeners.push(
      {
        element: this.targetInput,
        event: "input",
        handler: updateFromInput,
      },
      {
        element: this.targetInput,
        event: "change",
        handler: updateFromInput,
      },
    );
  }

  /**
   * Set up scroll listener to reposition overlay when page scrolls
   * Uses capture phase to ensure repositioning happens before other handlers
   */
  private setupScrollListener(): void {
    // Create scroll handler that repositions the overlay
    const scrollHandler = () => {
      if (this.isVisible) {
        this.positionOverlay();
      }
    };

    // Add scroll listener with capture: true for earlier event handling
    window.addEventListener("scroll", scrollHandler, true);

    // Store listener reference for cleanup
    this.inputListeners.push({
      element: window,
      event: "scroll",
      handler: scrollHandler,
    });

    console.log("[Writing Coach] Scroll listener registered");
  }

  /**
   * Handle grammar check button click
   */
  private async handleCheckGrammar(): Promise<void> {
    if (!this.currentText.trim()) {
      return;
    }

    this.showLoading(true);
    this.hideSection("corrections-section");
    this.hideSection("rewrite-section");

    try {
      // Send message to background script
      const response = await chrome.runtime.sendMessage({
        type: "PROOFREAD_TEXT",
        text: this.currentText,
        language: "en", // Note: Language detection can be added via Chrome's language detection API in future iterations
      });

      if (response.error) {
        throw new Error(response.error);
      }

      this.currentCorrections = response.corrections || [];
      this.displayCorrections();
    } catch (error) {
      console.error("[Writing Coach] Grammar check failed:", error);
      this.showError("Failed to check grammar. Please try again.");
    } finally {
      this.showLoading(false);
    }
  }

  /**
   * Handle rewrite button click
   */
  private async handleRewrite(): Promise<void> {
    if (!this.currentText.trim()) {
      return;
    }

    if (!this.shadowRoot) return;

    const toneSelect = this.shadowRoot.getElementById(
      "tone-select",
    ) as HTMLSelectElement;
    const lengthSelect = this.shadowRoot.getElementById(
      "length-select",
    ) as HTMLSelectElement;

    const tone = toneSelect?.value || "neutral";
    const length = lengthSelect?.value || "as-is";

    this.showLoading(true);
    this.hideSection("corrections-section");
    this.hideSection("rewrite-section");

    try {
      // Send message to background script
      const response = await chrome.runtime.sendMessage({
        type: "REWRITE_TEXT",
        text: this.currentText,
        tone,
        length,
        language: "en", // Note: Language detection can be added via Chrome's language detection API in future iterations
      });

      if (!response) {
        throw new Error("No response received from background script");
      }

      if (response.error) {
        throw new Error(response.error);
      }

      // Validate response shape
      if (typeof response !== "object") {
        throw new Error("Invalid response format: expected object");
      }

      // Validate and extract rewrittenText (required)
      if (
        typeof response.rewrittenText !== "string" ||
        response.rewrittenText.trim().length === 0
      ) {
        throw new Error(
          "Invalid response: rewrittenText must be a non-empty string",
        );
      }

      // Validate and extract alternatives (optional array, default to [])
      const alternatives = Array.isArray(response.alternatives)
        ? response.alternatives.filter(
            (alt: unknown) => typeof alt === "string",
          )
        : [];

      // Validate and extract learningExpressions (optional array, default to [])
      const learningExpressions = Array.isArray(response.learningExpressions)
        ? response.learningExpressions.filter(
            (expr: unknown) =>
              typeof expr === "object" &&
              expr !== null &&
              typeof (expr as Record<string, unknown>).original === "string" &&
              typeof (expr as Record<string, unknown>).rewritten === "string",
          )
        : [];

      this.currentRewrites = [response.rewrittenText, ...alternatives];
      this.learningExpressions = learningExpressions;
      this.displayRewrites();
    } catch (error) {
      console.error("[Writing Coach] Rewrite failed:", error);
      this.showError("Failed to rewrite text. Please try again.");
    } finally {
      this.showLoading(false);
    }
  }

  /**
   * Display corrections in the UI
   */
  private displayCorrections(): void {
    if (!this.shadowRoot) return;

    const correctionsSection = this.shadowRoot.getElementById(
      "corrections-section",
    );
    const correctionsList = this.shadowRoot.getElementById("corrections-list");

    if (!correctionsSection || !correctionsList) return;

    if (this.currentCorrections.length === 0) {
      correctionsList.innerHTML = `
        <div class="no-corrections">
          ✓ No issues detected! Your text looks good.
        </div>
      `;
    } else {
      correctionsList.innerHTML = this.currentCorrections
        .map(
          (correction) => `
        <div class="correction-item ${correction.type === "spelling" || correction.type === "grammar" ? "error" : ""}">
          <div class="correction-type">${correction.type}</div>
          <div class="correction-text">
            <span class="correction-original">${this.escapeHtml(correction.original)}</span>
            <span class="correction-arrow">→</span>
            <span class="correction-suggestion">${this.escapeHtml(correction.suggestion)}</span>
          </div>
          <div class="correction-explanation">${this.escapeHtml(correction.explanation)}</div>
        </div>
      `,
        )
        .join("");
    }

    this.showSection("corrections-section");
  }

  /**
   * Display rewrites in the UI
   */
  private displayRewrites(): void {
    if (!this.shadowRoot) return;

    const rewriteSection = this.shadowRoot.getElementById("rewrite-section");
    const rewriteTabs = this.shadowRoot.getElementById("rewrite-tabs");
    const rewriteContent = this.shadowRoot.getElementById("rewrite-content");
    const learningExpressionsDiv = this.shadowRoot.getElementById(
      "learning-expressions",
    );

    if (!rewriteSection || !rewriteTabs || !rewriteContent) return;

    // Clear tabs container
    rewriteTabs.innerHTML = "";

    // Helper function to activate a specific tab
    const activateTab = (tabToActivate: HTMLButtonElement) => {
      const tabIndex = parseInt(tabToActivate.dataset.index || "0");
      const tabId = `rewrite-tab-${tabIndex}`;

      // Deactivate all tabs
      Array.from(rewriteTabs.querySelectorAll(".rewrite-tab")).forEach((t) => {
        const button = t as HTMLButtonElement;
        button.classList.remove("active");
        button.setAttribute("aria-selected", "false");
        button.setAttribute("tabindex", "-1");
      });

      // Activate selected tab
      tabToActivate.classList.add("active");
      tabToActivate.setAttribute("aria-selected", "true");
      tabToActivate.setAttribute("tabindex", "0");
      tabToActivate.focus();

      // Update content
      rewriteContent.textContent = this.currentRewrites[tabIndex] || "";
      rewriteContent.setAttribute("aria-labelledby", tabId);
    };

    // Create tabs for each rewrite version using safe DOM construction
    this.currentRewrites.forEach((_, index) => {
      const tab = document.createElement("button");
      const tabId = `rewrite-tab-${index}`;
      const isActive = index === 0;
      tab.type = "button";
      tab.className = `rewrite-tab ${isActive ? "active" : ""}`;
      tab.id = tabId;
      tab.textContent = `Version ${index + 1}`;
      tab.dataset.index = String(index);
      tab.setAttribute("role", "tab");
      tab.setAttribute("aria-controls", "rewrite-content");
      tab.setAttribute("aria-selected", isActive ? "true" : "false");
      tab.setAttribute("tabindex", isActive ? "0" : "-1");

      // Handle mouse clicks
      tab.addEventListener("click", () => {
        activateTab(tab);
      });

      // Handle keyboard navigation
      tab.addEventListener("keydown", (e: KeyboardEvent) => {
        const allTabs = Array.from(
          rewriteTabs.querySelectorAll(".rewrite-tab"),
        ) as HTMLButtonElement[];
        const currentIndex = allTabs.indexOf(tab);

        if (e.key === "ArrowRight") {
          e.preventDefault();
          const nextIndex = (currentIndex + 1) % allTabs.length;
          const nextTab = allTabs[nextIndex];
          if (nextTab) {
            activateTab(nextTab);
          }
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          const nextIndex =
            (currentIndex - 1 + allTabs.length) % allTabs.length;
          const nextTab = allTabs[nextIndex];
          if (nextTab) {
            activateTab(nextTab);
          }
        } else if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          activateTab(tab);
        }
      });

      rewriteTabs.appendChild(tab);
    });

    // Display first version
    if (this.currentRewrites.length > 0) {
      rewriteContent.textContent = this.currentRewrites[0] || "";
      const firstTab =
        rewriteTabs.querySelector<HTMLButtonElement>(".rewrite-tab");
      if (firstTab) {
        rewriteContent.setAttribute("aria-labelledby", firstTab.id);
      }
    } else {
      rewriteContent.textContent = "";
      rewriteContent.removeAttribute("aria-labelledby");
    }

    // Display learning expressions using safe DOM construction
    if (learningExpressionsDiv && this.learningExpressions.length > 0) {
      learningExpressionsDiv.innerHTML = "";

      // Create title
      const title = document.createElement("h5");
      title.className = "section-title";
      title.textContent = "📚 Learning Expressions";
      learningExpressionsDiv.appendChild(title);

      // Create expression items using safe DOM construction
      this.learningExpressions.forEach((expr) => {
        const itemDiv = document.createElement("div");
        itemDiv.className = "expression-item";

        // Comparison section
        const comparisonDiv = document.createElement("div");
        comparisonDiv.className = "expression-comparison";

        const beforeSpan = document.createElement("span");
        beforeSpan.className = "expression-before";
        beforeSpan.textContent = expr.original;

        const arrowSpan = document.createElement("span");
        arrowSpan.className = "expression-arrow";
        arrowSpan.textContent = "→";

        const afterSpan = document.createElement("span");
        afterSpan.className = "expression-after";
        afterSpan.textContent = expr.rewritten;

        comparisonDiv.appendChild(beforeSpan);
        comparisonDiv.appendChild(arrowSpan);
        comparisonDiv.appendChild(afterSpan);

        // Explanation section
        const explanationDiv = document.createElement("div");
        explanationDiv.className = "expression-explanation";
        explanationDiv.textContent = expr.explanation || "";

        // Flashcard button with safely stored data
        const button = document.createElement("button");
        button.className = "add-flashcard-btn";
        button.textContent = "+ Add to Flashcards";

        // Store data safely in data attributes using JSON encoding
        button.dataset.expressionOriginal = expr.original;
        button.dataset.expressionRewritten = expr.rewritten;

        button.addEventListener("click", () => {
          const original = button.dataset.expressionOriginal || "";
          const rewritten = button.dataset.expressionRewritten || "";
          this.addToFlashcards(original, rewritten);
        });

        itemDiv.appendChild(comparisonDiv);
        itemDiv.appendChild(explanationDiv);
        itemDiv.appendChild(button);

        learningExpressionsDiv.appendChild(itemDiv);
      });
    } else if (learningExpressionsDiv) {
      learningExpressionsDiv.innerHTML = "";
    }

    this.showSection("rewrite-section");
  }

  /**
   * Add expression to flashcards with input validation
   * Validates and sanitizes inputs before sending to background script
   */
  private async addToFlashcards(
    original: string,
    rewritten: string,
  ): Promise<void> {
    try {
      // Input validation: ensure both are strings
      if (typeof original !== "string" || typeof rewritten !== "string") {
        console.error(
          "[Writing Coach] Invalid flashcard inputs: must be strings",
        );
        this.showError("Failed to add flashcard: invalid data.");
        return;
      }

      // Trim and validate non-empty
      const sanitizedOriginal = original.trim();
      const sanitizedRewritten = rewritten.trim();

      if (!sanitizedOriginal || !sanitizedRewritten) {
        console.error("[Writing Coach] Empty flashcard content");
        this.showError("Failed to add flashcard: content cannot be empty.");
        return;
      }

      // Validate reasonable length (prevent abuse)
      const MAX_LENGTH = 5000;
      if (
        sanitizedOriginal.length > MAX_LENGTH ||
        sanitizedRewritten.length > MAX_LENGTH
      ) {
        console.error("[Writing Coach] Flashcard content exceeds max length");
        this.showError("Failed to add flashcard: content too long.");
        return;
      }

      // Send to background script with validated data
      await chrome.runtime.sendMessage({
        type: "CREATE_FLASHCARD",
        term: sanitizedOriginal,
        definition: sanitizedRewritten,
        sourceType: "writing_coach",
      });

      console.log("[Writing Coach] Expression added to flashcards");
    } catch (error) {
      console.error("[Writing Coach] Failed to add flashcard:", error);
      this.showError("Failed to add flashcard. Please try again.");
    }
  }

  /**
   * Position overlay next to target input field
   */
  private positionOverlay(): void {
    if (!this.overlay || !this.targetInput) return;

    const rect = this.targetInput.getBoundingClientRect();
    const overlayWidth = 400;
    const overlayMaxHeight = 600;

    // Try to position to the right of input
    let left = rect.right + 10;
    let top = rect.top;

    // If not enough space on right, position on left
    if (left + overlayWidth > window.innerWidth) {
      left = rect.left - overlayWidth - 10;
    }

    // If still not enough space, center it
    if (left < 0) {
      left = Math.max(10, (window.innerWidth - overlayWidth) / 2);
    }

    // Ensure overlay doesn't go off bottom of screen
    if (top + overlayMaxHeight > window.innerHeight) {
      top = Math.max(10, window.innerHeight - overlayMaxHeight - 10);
    }

    this.overlay.style.left = `${left}px`;
    this.overlay.style.top = `${top}px`;
  }

  /**
   * Show/hide loading indicator
   */
  private showLoading(show: boolean): void {
    if (!this.shadowRoot) return;
    const loading = this.shadowRoot.getElementById("loading");
    if (loading) {
      loading.classList.toggle("active", show);
      loading.setAttribute("aria-hidden", show ? "false" : "true");
      loading.setAttribute("aria-busy", show ? "true" : "false");
    }
  }

  /**
   * Show section
   */
  private showSection(sectionId: string): void {
    if (!this.shadowRoot) return;
    const section = this.shadowRoot.getElementById(sectionId);
    if (section) {
      section.classList.add("active");
      section.setAttribute("aria-hidden", "false");
    }
    const controller = this.shadowRoot.querySelector<HTMLElement>(
      `[data-controls="${sectionId}"]`,
    );
    if (controller) {
      controller.setAttribute("aria-expanded", "true");
    }
  }

  /**
   * Hide section
   */
  private hideSection(sectionId: string): void {
    if (!this.shadowRoot) return;
    const section = this.shadowRoot.getElementById(sectionId);
    if (section) {
      section.classList.remove("active");
      section.setAttribute("aria-hidden", "true");
    }
    const controller = this.shadowRoot.querySelector<HTMLElement>(
      `[data-controls="${sectionId}"]`,
    );
    if (controller) {
      controller.setAttribute("aria-expanded", "false");
    }
  }

  /**
   * Show error message with debouncing and auto-hide
   * Debounces duplicate messages to prevent toast stacking
   */
  private showError(message: string): void {
    if (!this.shadowRoot) return;

    console.error("[Writing Coach]", message);

    // Clear existing debounce timer to restart debounce countdown
    if (this.errorDebouncedTimeoutId) {
      clearTimeout(this.errorDebouncedTimeoutId);
    }

    // Debounce: only show if message is different or debounce period has passed
    const isDifferentMessage = message !== this.lastError;
    if (!isDifferentMessage) {
      console.log("[Writing Coach] Duplicate error suppressed:", message);
      return;
    }

    // Update last error
    this.lastError = message;

    // Get error toast elements
    const errorToast = this.shadowRoot.getElementById("error-toast");
    const errorMessage = this.shadowRoot.getElementById("error-message");

    if (!errorToast || !errorMessage) return;

    // Set error message and make visible
    errorMessage.textContent = message;
    errorToast.classList.add("show");
    errorToast.setAttribute("aria-hidden", "false");

    // Clear existing auto-hide timeout
    if (this.errorTimeoutId) {
      clearTimeout(this.errorTimeoutId);
    }

    // Auto-hide after timeout
    this.errorTimeoutId = setTimeout(() => {
      this.hideError();
      this.errorTimeoutId = null;
    }, this.ERROR_AUTO_HIDE_MS);

    // Set debounce timer to allow different errors after debounce period
    this.errorDebouncedTimeoutId = setTimeout(() => {
      this.lastError = "";
      this.errorDebouncedTimeoutId = null;
    }, this.ERROR_DEBOUNCE_MS);
  }

  /**
   * Hide error toast (public for tests and callers)
   */
  public hideError(): void {
    if (!this.shadowRoot) return;

    const errorToast = this.shadowRoot.getElementById("error-toast");
    if (!errorToast) return;

    errorToast.classList.remove("show");
    errorToast.setAttribute("aria-hidden", "true");

    // Clear timers when manually dismissed
    if (this.errorTimeoutId) {
      clearTimeout(this.errorTimeoutId);
      this.errorTimeoutId = null;
    }
  }

  /**
   * Clear all error state (public for tests)
   */
  public clearError(): void {
    this.hideError();
    this.lastError = "";

    if (this.errorTimeoutId) {
      clearTimeout(this.errorTimeoutId);
      this.errorTimeoutId = null;
    }

    if (this.errorDebouncedTimeoutId) {
      clearTimeout(this.errorDebouncedTimeoutId);
      this.errorDebouncedTimeoutId = null;
    }

    if (this.shadowRoot) {
      const errorMessage = this.shadowRoot.getElementById("error-message");
      if (errorMessage) {
        errorMessage.textContent = "";
      }
    }
  }

  /**
   * Get text from input element
   */
  private getInputText(element: HTMLElement): string {
    if (
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement
    ) {
      return element.value;
    }
    if (element.isContentEditable) {
      return element.textContent || "";
    }
    return "";
  }

  /**
   * Set text to input element
   */
  private setInputText(element: HTMLElement, text: string): void {
    if (
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement
    ) {
      element.value = text;
      // Trigger input event
      element.dispatchEvent(new Event("input", { bubbles: true }));
    } else if (element.isContentEditable) {
      element.textContent = text;
      element.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  /**
   * Escape HTML special characters
   */
  private escapeHtml(text: string): string {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }
}

// Singleton instance
let overlayInstance: WritingCoachOverlay | null = null;

/**
 * Get or create overlay instance
 */
export function getOverlayInstance(): WritingCoachOverlay {
  if (!overlayInstance) {
    overlayInstance = new WritingCoachOverlay();
  }
  return overlayInstance;
}
