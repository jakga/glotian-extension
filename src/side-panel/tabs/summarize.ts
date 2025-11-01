/**
 * Summarize tab component
 *
 * Displays CEFR level selector, page summarization controls,
 * and results in a three-tab view (Original, Simplified, Translation)
 */

import type { CEFRLevel, RuntimeMessage, TranslateRequest } from "@/types";
import {
  ensureWriterModelReady,
  getCEFRDescription,
  simplifyLongText,
} from "@/lib/ai/writer";
import type { SummarizeRequest, SummarizeResponse } from "@/lib/ai/summarizer";
import { summarizeWithTimeout } from "@/lib/ai/summarize";
import { translate } from "@/lib/ai/translate";
import {
  ensureSupportedSourceLanguage,
  ensureSupportedTargetLanguage,
  getDefaultLanguagePreferences,
} from "@/lib/language";

// Tab state
let currentCEFRLevel: CEFRLevel = "B1";
let currentResultTab: "original" | "simplified" | "translation" = "original";
let currentSummary: SummarizeResponse | null = null;
let isProcessing = false;
let errorTimer: number | null = null;
let lastSummaryContext: { pageUrl: string; pageTitle: string } | null = null;

function setPrimaryButtonsEnabled(
  container: HTMLElement,
  enabled: boolean,
): void {
  ["summarize-button", "summarize-selection-button"].forEach((id) => {
    const button = container.querySelector(
      `#${id}`,
    ) as HTMLButtonElement | null;
    if (button) {
      button.disabled = !enabled;
    }
  });
}

function setSummaryActionsEnabled(
  container: HTMLElement,
  enabled: boolean,
): void {
  [
    "simplify-summary-button",
    "translate-summary-button",
    "save-note-button",
    "create-flashcards-button",
  ].forEach((id) => {
    const button = container.querySelector(
      `#${id}`,
    ) as HTMLButtonElement | null;
    if (button) {
      button.disabled = !enabled;
    }
  });
}

async function getLanguagePreferences(): Promise<{
  sourceLanguage: string;
  targetLanguage: string;
}> {
  const defaults = getDefaultLanguagePreferences();
  const stored = await chrome.storage.local.get([
    "sourceLanguage",
    "targetLanguage",
  ]);

  const rawSource = ensureSupportedSourceLanguage(
    typeof stored.sourceLanguage === "string" ? stored.sourceLanguage : null,
    defaults.sourceLanguage,
  );

  const sourceLanguage = rawSource === "auto" ? "en" : rawSource;
  const targetLanguage = ensureSupportedTargetLanguage(
    typeof stored.targetLanguage === "string" ? stored.targetLanguage : null,
    defaults.targetLanguage,
  );

  return { sourceLanguage, targetLanguage };
}

/**
 * Initialize Summarize tab
 */
export async function initSummarizeTab(container: HTMLElement): Promise<void> {
  console.log("[Glotian Summarize Tab] Initializing");

  // Load saved CEFR level from storage with error handling
  try {
    const result = await chrome.storage.local.get(["defaultCEFRLevel"]);
    if (result && isCEFRLevel(result.defaultCEFRLevel)) {
      currentCEFRLevel = result.defaultCEFRLevel;
    }
  } catch (error) {
    console.error(
      "[Glotian Summarize Tab] Failed to load CEFR level from storage:",
      error,
    );
    // Fall back to default CEFR level "B1" (already set at module level)
  }

  renderSummarizeTab(container);
  attachEventListeners(container);
}

function isCEFRLevel(value: unknown): value is CEFRLevel {
  return (
    typeof value === "string" &&
    ["A1", "A2", "B1", "B2", "C1", "C2"].includes(value)
  );
}

/**
 * Render Summarize tab HTML
 */
function renderSummarizeTab(container: HTMLElement): void {
  container.innerHTML = `
    <div class="summarize-tab">
      <!-- Controls Section -->
      <div class="summarize-controls">
        <div class="cefr-selector">
          <label for="cefr-level">
            <span class="label-text">Reading Level</span>
            <span class="label-description" id="cefr-description">${getCEFRDescription(currentCEFRLevel)}</span>
          </label>
          <select id="cefr-level" value="${currentCEFRLevel}">
            <option value="A1" ${currentCEFRLevel === "A1" ? "selected" : ""}>A1 - Beginner</option>
            <option value="A2" ${currentCEFRLevel === "A2" ? "selected" : ""}>A2 - Elementary</option>
            <option value="B1" ${currentCEFRLevel === "B1" ? "selected" : ""}>B1 - Intermediate</option>
            <option value="B2" ${currentCEFRLevel === "B2" ? "selected" : ""}>B2 - Upper-Intermediate</option>
            <option value="C1" ${currentCEFRLevel === "C1" ? "selected" : ""}>C1 - Advanced</option>
            <option value="C2" ${currentCEFRLevel === "C2" ? "selected" : ""}>C2 - Proficient</option>
          </select>
        </div>

        <button id="summarize-button" class="primary-button" ${isProcessing ? "disabled" : ""}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M4 6h16M4 12h16M4 18h7"/>
          </svg>
          <span>Summarize Page</span>
        </button>

        <button id="summarize-selection-button" class="secondary-button">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
          <span>Summarize Selection</span>
        </button>
      </div>

      <!-- Progress Indicator -->
      <div id="progress-section" class="progress-section hidden">
        <div class="progress-spinner"></div>
        <p id="progress-text">Extracting page content...</p>
        <div class="progress-bar">
          <div id="progress-fill" class="progress-fill"></div>
        </div>
      </div>

      <!-- Error Display -->
      <div id="error-section" class="error-section hidden">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <p id="error-text"></p>
      </div>

      <!-- Results Section -->
      <div id="results-section" class="results-section hidden">
        <!-- Result Tabs -->
        <div class="result-tabs">
          <button class="result-tab ${currentResultTab === "simplified" ? "active" : ""}" data-tab="simplified">
            Simplified
          </button>
          <button class="result-tab ${currentResultTab === "translation" ? "active" : ""}" data-tab="translation">
            Translation
          </button>
          <button class="result-tab ${currentResultTab === "original" ? "active" : ""}" data-tab="original">
            Original
          </button>
        </div>

        <!-- Result Content -->
        <div class="result-content">
          <div id="simplified-content" class="result-pane ${currentResultTab === "simplified" ? "active" : ""}">
            <div class="content-text"></div>
          </div>

          <div id="translation-content" class="result-pane ${currentResultTab === "translation" ? "active" : ""}">
            <div class="content-text"></div>
          </div>

          <div id="original-content" class="result-pane ${currentResultTab === "original" ? "active" : ""}">
            <div class="content-text"></div>
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="result-actions">
          <button id="simplify-summary-button" class="secondary-button" disabled>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M5 4h14"/>
              <path d="M5 12h8"/>
              <path d="M5 20h14"/>
            </svg>
            <span>Simplify Summary</span>
          </button>

          <button id="translate-summary-button" class="secondary-button" disabled>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 5h12"/>
              <path d="M9 3v2"/>
              <path d="M5 9h8"/>
              <path d="M5 9a7 7 0 0 0 14 0"/>
              <path d="M12 9l3 8"/>
              <path d="M9 17h6"/>
            </svg>
            <span>Translate Summary</span>
          </button>

          <button id="create-flashcards-button" class="secondary-button" disabled>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <line x1="12" y1="8" x2="12" y2="16"/>
              <line x1="8" y1="12" x2="16" y2="12"/>
            </svg>
            <span>Create Flashcards</span>
          </button>

          <button id="save-note-button" class="primary-button" disabled>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
              <polyline points="17 21 17 13 7 13 7 21"/>
              <polyline points="7 3 7 8 15 8"/>
            </svg>
            <span>Save to Notes</span>
          </button>
        </div>
      </div>

      <!-- Empty State -->
      <div id="empty-state" class="empty-state ${currentSummary ? "hidden" : ""}">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
          <line x1="10" y1="9" x2="16" y2="9"/>
          <line x1="10" y1="13" x2="16" y2="13"/>
          <line x1="10" y1="17" x2="14" y2="17"/>
        </svg>
        <h3>Summarize Web Pages</h3>
        <p>Get a concise summary of any web page, adjusted to your reading level.</p>
        <ul class="feature-list">
          <li>✓ Automatic content extraction</li>
          <li>✓ CEFR level adjustment (A1-C2)</li>
          <li>✓ Translation to your native language</li>
          <li>✓ Create flashcards from summaries</li>
        </ul>
      </div>
    </div>
  `;

  setPrimaryButtonsEnabled(container, !isProcessing);
  setSummaryActionsEnabled(container, Boolean(currentSummary));
}

/**
 * Attach event listeners
 */
function attachEventListeners(container: HTMLElement): void {
  // CEFR level selector
  const cefrSelect = container.querySelector(
    "#cefr-level",
  ) as HTMLSelectElement;
  const cefrDescription = container.querySelector("#cefr-description");

  if (cefrSelect) {
    cefrSelect.addEventListener("change", async () => {
      const nextLevel = cefrSelect.value;
      if (!isCEFRLevel(nextLevel)) {
        console.warn("[Glotian Summarize Tab] Invalid CEFR level", nextLevel);
        return;
      }

      currentCEFRLevel = nextLevel;

      // Update description
      if (cefrDescription) {
        cefrDescription.textContent = getCEFRDescription(currentCEFRLevel);
      }

      // Save to storage
      try {
        await chrome.storage.local.set({ defaultCEFRLevel: currentCEFRLevel });
      } catch (error) {
        console.error(
          "[Glotian Summarize Tab] Failed to save CEFR level:",
          error,
        );
      }
    });
  }

  // Summarize Page button
  const summarizeButton = container.querySelector("#summarize-button");
  if (summarizeButton) {
    summarizeButton.addEventListener("click", () =>
      handleSummarizePage(container),
    );
  }

  // Summarize Selection button
  const summarizeSelectionButton = container.querySelector(
    "#summarize-selection-button",
  );
  if (summarizeSelectionButton) {
    summarizeSelectionButton.addEventListener("click", () =>
      handleSummarizeSelection(container),
    );
  }

  // Result tab switching
  const resultTabs = container.querySelectorAll(".result-tab");
  resultTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const tabName = tab.getAttribute("data-tab") as
        | "original"
        | "simplified"
        | "translation";
      switchResultTab(container, tabName);
    });
  });

  // Simplify Summary button
  const simplifySummaryButton = container.querySelector(
    "#simplify-summary-button",
  );
  if (simplifySummaryButton) {
    simplifySummaryButton.addEventListener("click", () => {
      void handleSimplifySummary(container);
    });
  }

  // Translate Summary button
  const translateSummaryButton = container.querySelector(
    "#translate-summary-button",
  );
  if (translateSummaryButton) {
    translateSummaryButton.addEventListener("click", () => {
      void handleTranslateSummary(container);
    });
  }

  // Create Flashcards button
  const createFlashcardsButton = container.querySelector(
    "#create-flashcards-button",
  );
  if (createFlashcardsButton) {
    createFlashcardsButton.addEventListener("click", () =>
      handleCreateFlashcards(container),
    );
  }

  // Save Note button
  const saveNoteButton = container.querySelector("#save-note-button");
  if (saveNoteButton) {
    saveNoteButton.addEventListener("click", () => {
      void handleSaveNote(container);
    });
  }
}

async function buildSummarizeRequest(
  params: {
    pageUrl: string;
    pageTitle: string;
    pageContent: string;
  },
  cefrLevel: CEFRLevel,
): Promise<SummarizeRequest> {
  const { sourceLanguage, targetLanguage } = await chrome.storage.local.get([
    "sourceLanguage",
    "targetLanguage",
  ]);

  return {
    pageContent: params.pageContent,
    pageUrl: params.pageUrl,
    pageTitle: params.pageTitle,
    cefrLevel,
    sourceLanguage:
      typeof sourceLanguage === "string" && sourceLanguage
        ? sourceLanguage
        : "en",
    targetLanguage:
      typeof targetLanguage === "string" && targetLanguage
        ? targetLanguage
        : "ko",
  };
}

function ensureUserActivation(): void {
  const activation = navigator.userActivation;
  if (!activation || !activation.isActive) {
    throw new Error(
      "Chrome Summarizer API requires an active user gesture. Please click Summarize again.",
    );
  }
}

/**
 * Handle Summarize Page button click
 */
async function handleSummarizePage(container: HTMLElement): Promise<void> {
  if (isProcessing) return;

  console.log("[Glotian Summarize Tab] Summarizing page");

  // Get active tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id || !tab.url) {
    showError(container, "Cannot summarize this page");
    return;
  }

  // Show progress
  showProgress(container, "Preparing Chrome AI models...");
  updateProgress(container, "Preparing Chrome AI models...", 5);
  isProcessing = true;
  setPrimaryButtonsEnabled(container, false);
  setSummaryActionsEnabled(container, false);

  try {
    ensureUserActivation();

    updateProgress(container, "Extracting page content...", 25);

    const extractResponse = await chrome.tabs.sendMessage(tab.id, {
      type: "EXTRACT_PAGE_CONTENT",
    });

    if (!extractResponse || !extractResponse.content) {
      throw new Error("Failed to extract page content");
    }

    if (extractResponse.content.length < 100) {
      throw new Error(
        "Content too short for summarization. Try 'Summarize Selection' instead.",
      );
    }

    const pageTitle = tab.title || "Untitled";
    const summarizeRequest = await buildSummarizeRequest(
      {
        pageUrl: tab.url,
        pageTitle,
        pageContent: extractResponse.content,
      },
      currentCEFRLevel,
    );

    updateProgress(container, "Summarizing with Chrome AI...", 60);

    const summaryResult = await summarizeWithTimeout(summarizeRequest);
    lastSummaryContext = { pageUrl: tab.url, pageTitle };

    updateProgress(container, "Complete!", 100);

    hideProgress(container);
    displayResults(container, {
      ...summaryResult,
      simplifiedSummary: undefined,
      translation: undefined,
      cefrLevel: undefined,
    });
    switchResultTab(container, "original");
  } catch (error) {
    console.error("[Glotian Summarize Tab] Error:", error);
    showError(
      container,
      error instanceof Error ? error.message : "Failed to summarize page",
    );
    currentSummary = null;
    lastSummaryContext = null;
  } finally {
    isProcessing = false;
    hideProgress(container);
    setPrimaryButtonsEnabled(container, true);
    setSummaryActionsEnabled(container, Boolean(currentSummary));
  }
}

/**
 * Handle Summarize Selection button click
 */
async function handleSummarizeSelection(container: HTMLElement): Promise<void> {
  if (isProcessing) return;

  // Get selected text from active tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) {
    showError(container, "No active tab");
    return;
  }

  try {
    showProgress(container, "Preparing Chrome AI models...");
    updateProgress(container, "Preparing Chrome AI models...", 5);
    isProcessing = true;
    setPrimaryButtonsEnabled(container, false);
    setSummaryActionsEnabled(container, false);

    ensureUserActivation();

    updateProgress(container, "Fetching selected text...", 25);

    const response = await chrome.tabs.sendMessage(tab.id, {
      type: "GET_SELECTION",
    });

    if (!response || !response.selection) {
      showError(
        container,
        "No text selected. Please select text on the page first.",
      );
      return;
    }

    const pageUrl = tab.url || window.location.href;
    const pageTitle = tab.title || "Untitled";
    const summarizeRequest = await buildSummarizeRequest(
      {
        pageUrl,
        pageTitle,
        pageContent: response.selection,
      },
      currentCEFRLevel,
    );

    updateProgress(container, "Summarizing with Chrome AI...", 60);

    const summaryResult = await summarizeWithTimeout(summarizeRequest);

    lastSummaryContext = { pageUrl, pageTitle };

    updateProgress(container, "Complete!", 100);
    hideProgress(container);
    displayResults(container, {
      ...summaryResult,
      simplifiedSummary: undefined,
      translation: undefined,
      cefrLevel: undefined,
    });
    switchResultTab(container, "original");
  } catch (error) {
    console.error("[Glotian Summarize Tab] Selection error:", error);
    currentSummary = null;
    lastSummaryContext = null;
    showError(
      container,
      error instanceof Error ? error.message : "Failed to summarize selection",
    );
  } finally {
    isProcessing = false;
    hideProgress(container);
    setPrimaryButtonsEnabled(container, true);
    setSummaryActionsEnabled(container, Boolean(currentSummary));
  }
}

/**
 * Simplify current summary using Writer API
 */
async function handleSimplifySummary(container: HTMLElement): Promise<void> {
  if (isProcessing) return;
  if (!currentSummary) {
    showError(
      container,
      "Summarize a page before requesting level adjustment.",
    );
    return;
  }

  try {
    showProgress(container, "Simplifying summary...");
    updateProgress(container, "Preparing Writer model...", 30);
    isProcessing = true;
    setPrimaryButtonsEnabled(container, false);
    setSummaryActionsEnabled(container, false);

    const { sourceLanguage } = await getLanguagePreferences();

    await ensureWriterModelReady({
      tone: "neutral",
      format: "plain-text",
      length: "as-is",
      outputLanguage: sourceLanguage,
      monitorDownload: (percentage) => {
        const progress = 30 + Math.round((percentage / 100) * 40);
        updateProgress(
          container,
          percentage < 100
            ? `Downloading Writer model... (${percentage}%)`
            : "Simplifying summary...",
          Math.min(progress, 70),
        );
      },
    });

    updateProgress(container, "Simplifying summary...", 80);

    const simplified = await simplifyLongText(
      currentSummary.summary,
      currentCEFRLevel,
      {
        tone: "neutral",
        format: "plain-text",
        length: "as-is",
        outputLanguage: sourceLanguage,
      },
    );

    currentSummary = {
      ...currentSummary,
      simplifiedSummary: simplified,
      cefrLevel: currentCEFRLevel,
    };

    hideProgress(container);
    displayResults(container);
    switchResultTab(container, "simplified");
  } catch (error) {
    console.error("[Glotian Summarize Tab] Simplify error:", error);
    showError(
      container,
      error instanceof Error
        ? error.message
        : "Failed to simplify summary. Please try again.",
    );
  } finally {
    isProcessing = false;
    hideProgress(container);
    setPrimaryButtonsEnabled(container, true);
    setSummaryActionsEnabled(container, Boolean(currentSummary));
  }
}

/**
 * Translate current summary using Translator API
 */
async function handleTranslateSummary(container: HTMLElement): Promise<void> {
  if (isProcessing) return;
  if (!currentSummary) {
    showError(container, "Summarize a page before requesting translation.");
    return;
  }

  try {
    showProgress(container, "Translating summary...");
    updateProgress(container, "Translating summary...", 60);
    isProcessing = true;
    setPrimaryButtonsEnabled(container, false);
    setSummaryActionsEnabled(container, false);

    const { sourceLanguage, targetLanguage } = await getLanguagePreferences();
    const textToTranslate =
      currentSummary.simplifiedSummary?.trim() || currentSummary.summary;

    const translationRequest: TranslateRequest = {
      text: textToTranslate,
      sourceLang: sourceLanguage,
      targetLang: targetLanguage,
      cefrLevel: currentSummary.cefrLevel ?? currentCEFRLevel,
    };

    const translationResult = await translate(translationRequest);

    currentSummary = {
      ...currentSummary,
      translation: translationResult.translatedText,
    };

    hideProgress(container);
    displayResults(container);
    switchResultTab(container, "translation");
  } catch (error) {
    console.error("[Glotian Summarize Tab] Translation error:", error);
    showError(
      container,
      error instanceof Error
        ? error.message
        : "Failed to translate summary. Please try again.",
    );
  } finally {
    isProcessing = false;
    hideProgress(container);
    setPrimaryButtonsEnabled(container, true);
    setSummaryActionsEnabled(container, Boolean(currentSummary));
  }
}

/**
 * Display summarization results
 */
function displayResults(
  container: HTMLElement,
  response?: SummarizeResponse,
): void {
  if (response) {
    currentSummary = {
      originalText: response.originalText,
      summary: response.summary,
      simplifiedSummary: response.simplifiedSummary,
      translation: response.translation,
      cefrLevel: response.cefrLevel,
      processingTime: response.processingTime,
      aiSource: response.aiSource,
    };
  }

  if (!currentSummary) {
    setSummaryActionsEnabled(container, false);
    return;
  }

  const emptyState = container.querySelector("#empty-state");
  if (emptyState) {
    emptyState.classList.add("hidden");
  }

  const resultsSection = container.querySelector("#results-section");
  if (resultsSection) {
    resultsSection.classList.remove("hidden");

    const simplifiedPane = container.querySelector(
      "#simplified-content .content-text",
    );
    if (simplifiedPane) {
      simplifiedPane.textContent =
        currentSummary.simplifiedSummary ??
        'Run "Simplify Summary" to generate a CEFR-adjusted version.';
    }

    const translationPane = container.querySelector(
      "#translation-content .content-text",
    );
    if (translationPane) {
      translationPane.textContent =
        currentSummary.translation ??
        'Run "Translate Summary" to view the summary in your target language.';
    }

    const originalPane = container.querySelector(
      "#original-content .content-text",
    );
    if (originalPane) {
      originalPane.textContent = currentSummary.summary;
    }
  }

  setSummaryActionsEnabled(container, true);
}

/**
 * Switch between result tabs
 */
function switchResultTab(
  container: HTMLElement,
  tabName: "original" | "simplified" | "translation",
): void {
  currentResultTab = tabName;

  // Update tab buttons
  const tabs = container.querySelectorAll(".result-tab");
  tabs.forEach((tab) => {
    if (tab.getAttribute("data-tab") === tabName) {
      tab.classList.add("active");
    } else {
      tab.classList.remove("active");
    }
  });

  // Update content panes
  const panes = container.querySelectorAll(".result-pane");
  panes.forEach((pane) => {
    if (pane.id === `${tabName}-content`) {
      pane.classList.add("active");
    } else {
      pane.classList.remove("active");
    }
  });
}

/**
 * Show progress indicator
 */
function showProgress(container: HTMLElement, message: string): void {
  const progressSection = container.querySelector("#progress-section");
  const errorSection = container.querySelector("#error-section");
  const resultsSection = container.querySelector("#results-section");
  const progressText = container.querySelector("#progress-text");

  if (progressSection) progressSection.classList.remove("hidden");
  if (errorSection) errorSection.classList.add("hidden");
  if (resultsSection) resultsSection.classList.add("hidden");
  if (progressText) progressText.textContent = message;

  // Reset progress bar
  const progressFill = container.querySelector("#progress-fill") as HTMLElement;
  if (progressFill) {
    progressFill.style.width = "0%";
  }
}

/**
 * Update progress
 */
function updateProgress(
  container: HTMLElement,
  message: string,
  percent: number,
): void {
  const progressText = container.querySelector("#progress-text");
  const progressFill = container.querySelector("#progress-fill") as HTMLElement;

  if (progressText) progressText.textContent = message;
  if (progressFill) progressFill.style.width = `${percent}%`;
}

/**
 * Hide progress indicator
 */
function hideProgress(container: HTMLElement): void {
  const progressSection = container.querySelector("#progress-section");
  if (progressSection) progressSection.classList.add("hidden");
}

/**
 * Show error message with debounced auto-hide
 */
function showError(container: HTMLElement, message: string): void {
  const errorSection = container.querySelector("#error-section");
  const progressSection = container.querySelector("#progress-section");
  const errorText = container.querySelector("#error-text");

  // Clear any existing error timer to prevent hiding newer errors
  if (errorTimer !== null) {
    clearTimeout(errorTimer);
  }

  if (errorSection) errorSection.classList.remove("hidden");
  if (progressSection) progressSection.classList.add("hidden");
  if (errorText) errorText.textContent = message;

  // Auto-hide after 10 seconds (and reset timer)
  errorTimer = window.setTimeout(() => {
    if (errorSection) errorSection.classList.add("hidden");
    errorTimer = null;
  }, 10000);
}

/**
 * Handle Create Flashcards button
 */
function handleCreateFlashcards(container: HTMLElement): void {
  if (!currentSummary) {
    showError(container, "Summarize a page before creating flashcards.");
    return;
  }

  const textForFlashcards =
    currentSummary.simplifiedSummary?.trim() || currentSummary.summary;

  if (!textForFlashcards.trim()) {
    showError(container, "Summary content is empty.");
    return;
  }

  chrome.runtime.sendMessage({
    type: "CREATE_FLASHCARDS_FROM_TEXT",
    text: textForFlashcards,
    sourceNoteId: null,
  });

  alert("Flashcards will be created in the background!");
}

/**
 * Handle Save Note button
 */
async function handleSaveNote(container: HTMLElement): Promise<void> {
  if (isProcessing) return;
  if (!currentSummary || !lastSummaryContext) {
    showError(container, "Summarize a page before saving to notes.");
    return;
  }

  try {
    showProgress(container, "Saving summary to notes...");
    updateProgress(container, "Saving summary to notes...", 70);
    isProcessing = true;
    setPrimaryButtonsEnabled(container, false);
    setSummaryActionsEnabled(container, false);

    const response = await chrome.runtime.sendMessage({
      type: "SAVE_SUMMARY_NOTE",
      pageUrl: lastSummaryContext.pageUrl,
      pageTitle: lastSummaryContext.pageTitle,
      summary: currentSummary.summary,
      originalText: currentSummary.originalText,
      simplifiedSummary: currentSummary.simplifiedSummary,
      translation: currentSummary.translation,
      cefrLevel: currentSummary.cefrLevel ?? currentCEFRLevel,
    } as RuntimeMessage);

    if (!response?.success) {
      throw new Error(response?.error || "Unable to save summary.");
    }

    hideProgress(container);
    alert("Summary saved to your notes!");
  } catch (error) {
    console.error("[Glotian Summarize Tab] Save note error:", error);
    showError(
      container,
      error instanceof Error ? error.message : "Failed to save summary.",
    );
  } finally {
    isProcessing = false;
    hideProgress(container);
    setPrimaryButtonsEnabled(container, true);
    setSummaryActionsEnabled(container, Boolean(currentSummary));
  }
}
