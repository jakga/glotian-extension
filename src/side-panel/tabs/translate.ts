/**
 * Translate Tab component
 *
 * Tasks: T041-T048
 * - Display translation of selected text from webpage
 * - Language selector with source/target and swap button
 * - Show grammar, CEFR level, and alternatives
 * - "Save to Notes" button triggers auto-tagging
 * - Recently translated list for quick re-access
 * - Error handling (timeout, offline, language not supported)
 */

import { db } from "@/lib/db/schema";
import { getSetting, setSetting } from "@/lib/storage";
import { translate } from "@/lib/ai/translate";
import { autoTag } from "@/lib/ai/auto-tag";
import type { CachedNote, TranslateResponse } from "@/types";
import { createCachedNote } from "@/lib/db/cache";
import { logActivity } from "@/lib/db/activity-log";
import {
  ensureSupportedSourceLanguage,
  ensureSupportedTargetLanguage,
  getDefaultLanguagePreferences,
} from "@/lib/language";

/**
 * Translation state
 */
interface TranslateState {
  originalText: string;
  sourceLanguage: string;
  targetLanguage: string;
  translationResult:
    | (TranslateResponse & { cefrLevel: string; alternatives: string[] })
    | null;
  isLoading: boolean;
  error: string | null;
  pageUrl: string;
  pageTitle: string;
}

const DEFAULT_LANGUAGE_PREFERENCES = getDefaultLanguagePreferences();

let state: TranslateState = {
  originalText: "",
  sourceLanguage: DEFAULT_LANGUAGE_PREFERENCES.sourceLanguage,
  targetLanguage: DEFAULT_LANGUAGE_PREFERENCES.targetLanguage,
  translationResult: null,
  isLoading: false,
  error: null,
  pageUrl: "",
  pageTitle: "",
};

let recentTranslationsCache: Array<{
  sourceLanguage: string;
  targetLanguage: string;
  originalText: string;
  translatedText: string;
  timestamp: number;
  detectedLanguage?: string;
}> = [];

function showElement(element: HTMLElement | null): void {
  if (!element) return;
  element.hidden = false;
  element.classList.remove("hidden");
}

function hideElement(element: HTMLElement | null): void {
  if (!element) return;
  element.hidden = true;
  element.classList.add("hidden");
}

/**
 * Initialize translate tab
 * Task: T041
 */
export async function initTranslateTab(): Promise<void> {
  console.log("[Glotian Translate] Initializing translate tab");

  // Create tab UI
  createTranslateTabUI();

  // Load user preferences
  await loadUserLanguagePreferences();

  // Load recently translated cache
  await loadRecentTranslations();

  // Setup event listeners
  setupEventListeners();

  // Ensure translation result section is hidden on initial load
  const section = document.getElementById("translation-result-section");
  if (section) {
    section.hidden = true;
  }

  console.log("[Glotian Translate] Translate tab initialized");
}

/**
 * Create the Translate Tab UI structure
 * Task: T041
 */
function createTranslateTabUI(): void {
  const container = document.getElementById("tab-translate");
  if (!container) {
    console.error("[Glotian Translate] tab-translate container not found");
    return;
  }

  const html = `
    <div class="translate-tab flex flex-col gap-5 text-glotian-text-primary">
      <section class="space-y-3">
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-semibold text-glotian-text-primary">Translate</h2>
          <span class="flex items-center gap-1 text-xs text-glotian-text-tertiary">
            <span class="hidden sm:inline">Shortcut</span>
            <span class="inline-flex items-center gap-1 rounded-full border border-glotian-border bg-glotian-bg-light px-2 py-0.5 font-mono">
              Ctrl+Shift+F
            </span>
          </span>
        </div>
        <div class="flex items-center gap-2 rounded-full border border-white bg-white p-1 shadow-glotian">
          <select
            id="source-language"
            class="flex-1 rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-glotian-text-primary outline-none transition focus:ring-2 focus:ring-glotian-primary/20"
            aria-label="Source language"
          >
            <option value="auto">Auto Detect</option>
            <option value="en">English</option>
            <option value="es">Spanish</option>
            <option value="fr">French</option>
            <option value="de">German</option>
            <option value="zh-hans">Chinese (Simplified)</option>
            <option value="zh-hant">Chinese (Traditional)</option>
            <option value="ja">Japanese</option>
            <option value="ko">Korean</option>
            <option value="it">Italian</option>
            <option value="pt">Portuguese</option>
            <option value="ru">Russian</option>
            <option value="ar">Arabic</option>
            <option value="hi">Hindi</option>
          </select>
          <button
            id="swap-languages"
            class="inline-flex h-11 w-11 items-center justify-center rounded-full bg-glotian-gradient text-white shadow-glotian transition-all hover:shadow-glotian-lg focus:outline-none focus:ring-2 focus:ring-glotian-primary/40"
            aria-label="Swap source and target languages"
            title="Swap languages"
          >
            <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M7 7h11l-3-3" stroke-linecap="round" stroke-linejoin="round"></path>
              <path d="M17 17H6l3 3" stroke-linecap="round" stroke-linejoin="round"></path>
            </svg>
          </button>
          <select
            id="target-language"
            class="flex-1 rounded-full bg-glotian-primary/10 px-4 py-2.5 text-sm font-semibold text-glotian-primary outline-none transition focus:ring-2 focus:ring-glotian-primary/20"
            aria-label="Target language"
          >
            <option value="en">English</option>
            <option value="es">Spanish</option>
            <option value="fr">French</option>
            <option value="de">German</option>
            <option value="zh-hans">Chinese (Simplified)</option>
            <option value="zh-hant">Chinese (Traditional)</option>
            <option value="ja">Japanese</option>
            <option value="ko">Korean</option>
            <option value="it">Italian</option>
            <option value="pt">Portuguese</option>
            <option value="ru">Russian</option>
            <option value="ar">Arabic</option>
            <option value="hi">Hindi</option>
          </select>
        </div>
      </section>

      <section class="rounded-3xl border border-white bg-white px-4 py-4 shadow-glotian space-y-3">
        <label for="original-text" class="text-xs font-semibold uppercase tracking-[0.3em] text-glotian-text-tertiary">
          Original Text
        </label>
        <textarea
          id="original-text"
          class="min-h-[160px] w-full resize-y rounded-2xl border border-glotian-border bg-glotian-bg-light px-4 py-3 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-glotian-primary/25 custom-scrollbar"
          aria-label="Original text to translate"
          placeholder="Paste text or capture with Ctrl+Shift+F"
          maxlength="1000"
        ></textarea>
        <div class="flex flex-wrap items-center justify-between gap-2 text-xs text-glotian-text-tertiary">
          <span id="char-count">0 / 1000</span>
          <div class="flex gap-2">
            <button id="copy-original-btn" class="btn-secondary px-3 py-2" title="Copy original text">Copy</button>
            <button id="translate-btn" class="btn-primary px-4 py-2" disabled title="Translate text">Translate</button>
          </div>
        </div>
      </section>

      <section class="space-y-3" id="translation-result-section" hidden>
        <div id="translation-loading" class="flex items-center gap-3 rounded-2xl border border-white bg-white px-4 py-3 text-sm text-glotian-text-secondary shadow-glotian" hidden>
          <svg class="spinner" viewBox="0 0 50 50">
            <circle cx="25" cy="25" r="20" fill="none" stroke="currentColor" stroke-width="4"></circle>
          </svg>
          <span>Translating...</span>
        </div>

        <div id="translation-result" class="space-y-4 rounded-3xl border border-white bg-white px-4 py-4 shadow-glotian" hidden>
          <div class="space-y-2">
            <div id="translated-text" class="text-base font-medium leading-relaxed text-glotian-text-primary whitespace-pre-wrap"></div>
            <div id="transliteration" class="text-sm text-glotian-text-secondary" hidden></div>
          </div>

          <div id="translation-details" class="grid gap-2">
            <div class="flex items-center justify-between rounded-2xl bg-glotian-bg-light px-3 py-2 text-sm">
              <span class="font-medium text-glotian-text-secondary">Grammar</span>
              <span id="grammar-info" class="text-glotian-text-primary"></span>
            </div>
            <div class="flex items-center justify-between rounded-2xl bg-glotian-bg-light px-3 py-2 text-sm">
              <span class="font-medium text-glotian-text-secondary">CEFR Level</span>
              <span id="cefr-badge" class="badge badge-primary"></span>
            </div>
          </div>

          <div id="alternatives-section" class="space-y-2" hidden>
            <h4 class="text-sm font-semibold text-glotian-text-secondary">Alternatives</h4>
            <ul id="alternatives-list" class="space-y-2"></ul>
          </div>

          <div class="flex flex-wrap justify-end gap-2">
            <button id="save-to-notes-btn" class="btn-primary" aria-label="Save translation to notes">Save to Notes</button>
            <button id="retry-translation-btn" class="btn-secondary" aria-label="Retry translation">Retry</button>
            <button id="copy-translation-btn" class="btn-secondary" aria-label="Copy translated text">Copy</button>
          </div>
        </div>

        <div id="translation-error" class="space-y-3 rounded-3xl border border-white bg-white px-4 py-4 text-sm text-glotian-text-secondary shadow-glotian" hidden>
          <div class="flex items-center gap-2 text-glotian-error">
            <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <h4 id="error-title" class="font-semibold">Translation failed</h4>
          </div>
          <p id="error-message" class="leading-relaxed text-glotian-text-secondary"></p>
          <div class="flex flex-wrap justify-end gap-2">
            <button id="retry-error-btn" class="btn-primary" aria-label="Retry translation">Retry</button>
            <button id="manual-translation-btn" class="btn-secondary" aria-label="Enter manual translation">Manual Translation</button>
            <button id="save-without-translation-btn" class="btn-secondary" aria-label="Save without translation">Save Without Translation</button>
          </div>
        </div>

        <div id="offline-state" class="space-y-2 rounded-3xl border border-white bg-white px-4 py-4 text-center shadow-glotian" hidden>
          <div class="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-glotian-primary/10 text-glotian-primary">
            <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="1 1 23 23"></polyline>
              <path d="M16.5 5a16 16 0 0 1 7.5 4"></path>
              <path d="M5 9a16 16 0 0 0-4 4"></path>
              <path d="M8.53 8.53a11 11 0 0 1 6.95 4.52"></path>
              <path d="M11.29 11.29a6 6 0 0 1 4.24 4.24"></path>
              <path d="M2 12a10 10 0 0 1 13.61-9.25"></path>
            </svg>
          </div>
          <h4 class="font-semibold">Offline</h4>
          <p class="text-sm text-glotian-text-secondary">
            Save the original copy now and sync when you’re back online.
          </p>
          <button id="save-original-only-btn" class="btn-primary" aria-label="Save original text only">Save Original Only</button>
        </div>
      </section>

      <section id="recently-translated-section" class="space-y-3 rounded-3xl border border-white bg-white px-4 py-4 shadow-glotian" hidden>
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-semibold text-glotian-text-primary">Recently translated</h3>
          <button id="clear-history-btn" class="btn-ghost text-xs" aria-label="Clear translation history">Clear</button>
        </div>
        <div id="recently-translated-list" class="space-y-2"></div>
      </section>
    </div>
  `;

  container.innerHTML = html;
}

/**
 * Load user's language preferences
 * Task: T042
 */
async function loadUserLanguagePreferences(): Promise<void> {
  try {
    const storedSourceLanguage = await getSetting("sourceLanguage");
    const storedTargetLanguage = await getSetting("targetLanguage");

    state.sourceLanguage = ensureSupportedSourceLanguage(
      storedSourceLanguage,
      DEFAULT_LANGUAGE_PREFERENCES.sourceLanguage,
    );
    state.targetLanguage = ensureSupportedTargetLanguage(
      storedTargetLanguage,
      DEFAULT_LANGUAGE_PREFERENCES.targetLanguage,
    );

    const sourceSelect = document.getElementById(
      "source-language",
    ) as HTMLSelectElement;
    if (sourceSelect) sourceSelect.value = state.sourceLanguage;

    const targetSelect = document.getElementById(
      "target-language",
    ) as HTMLSelectElement;
    if (targetSelect) targetSelect.value = state.targetLanguage;
  } catch (error) {
    console.error(
      "[Glotian Translate] Error loading language preferences:",
      error,
    );
  }
}

/**
 * Load recently translated items from cache (currently not persisted, would need to implement)
 */
async function loadRecentTranslations(): Promise<void> {
  // TODO: Implement persistence for recent translations if needed
  // For now, recentTranslationsCache is managed in memory during the session
}

/**
 * Setup event listeners for all interactive elements
 */
function setupEventListeners(): void {
  // Language dropdowns
  const sourceLanguage = document.getElementById(
    "source-language",
  ) as HTMLSelectElement;
  const targetLanguage = document.getElementById(
    "target-language",
  ) as HTMLSelectElement;

  if (sourceLanguage) {
    sourceLanguage.addEventListener("change", (e) => {
      state.sourceLanguage = (e.target as HTMLSelectElement).value;
      setSetting("sourceLanguage", state.sourceLanguage);
      if (state.originalText) {
        performTranslation();
      }
    });
  }

  if (targetLanguage) {
    targetLanguage.addEventListener("change", (e) => {
      state.targetLanguage = (e.target as HTMLSelectElement).value;
      setSetting("targetLanguage", state.targetLanguage);
      if (state.originalText) {
        performTranslation();
      }
    });
  }

  // Swap languages button
  const swapBtn = document.getElementById("swap-languages");
  if (swapBtn) {
    swapBtn.addEventListener("click", () => {
      const originalSource = state.sourceLanguage;
      const swappedSource = ensureSupportedSourceLanguage(
        state.targetLanguage,
        DEFAULT_LANGUAGE_PREFERENCES.sourceLanguage,
      );
      const swappedTarget = ensureSupportedTargetLanguage(
        originalSource === "auto"
          ? DEFAULT_LANGUAGE_PREFERENCES.targetLanguage
          : originalSource,
        DEFAULT_LANGUAGE_PREFERENCES.targetLanguage,
      );

      state.sourceLanguage = swappedSource;
      state.targetLanguage = swappedTarget;

      if (sourceLanguage) sourceLanguage.value = state.sourceLanguage;
      if (targetLanguage) targetLanguage.value = state.targetLanguage;

      setSetting("sourceLanguage", state.sourceLanguage);
      setSetting("targetLanguage", state.targetLanguage);

      if (state.originalText) {
        performTranslation();
      }
    });
  }

  // Original text input - update character count and button state
  const originalTextarea = document.getElementById(
    "original-text",
  ) as HTMLTextAreaElement;
  const charCountSpan = document.getElementById("char-count");
  const translateBtn = document.getElementById("translate-btn");

  if (originalTextarea && charCountSpan && translateBtn) {
    originalTextarea.addEventListener("input", () => {
      const count = originalTextarea.value.length;
      charCountSpan.textContent = `${count} / 1000`;

      // Update translate button state
      if (count === 0) {
        translateBtn.setAttribute("disabled", "true");
      } else {
        translateBtn.removeAttribute("disabled");
      }
    });

    // Translate button click
    translateBtn.addEventListener("click", () => {
      const text = originalTextarea.value.trim();
      if (text) {
        state.originalText = text;
        performTranslation();
      }
    });

    // Allow Enter key to trigger translation (Ctrl+Enter for multiline)
    originalTextarea.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        const text = originalTextarea.value.trim();
        if (text) {
          state.originalText = text;
          performTranslation();
        }
      }
    });
  }

  // Copy original button
  const copyOriginalBtn = document.getElementById("copy-original-btn");
  if (copyOriginalBtn) {
    copyOriginalBtn.addEventListener("click", () => {
      const textarea = document.getElementById(
        "original-text",
      ) as HTMLTextAreaElement;
      if (textarea && textarea.value) {
        navigator.clipboard.writeText(textarea.value);
        showToast("Original text copied!");
      }
    });
  }

  // Save to notes button
  const saveToNotesBtn = document.getElementById("save-to-notes-btn");
  if (saveToNotesBtn) {
    saveToNotesBtn.addEventListener("click", saveTranslationToNotes);
  }

  // Retry button
  const retryBtn = document.getElementById("retry-translation-btn");
  if (retryBtn) {
    retryBtn.addEventListener("click", performTranslation);
  }

  // Copy translation button
  const copyTranslationBtn = document.getElementById("copy-translation-btn");
  if (copyTranslationBtn) {
    copyTranslationBtn.addEventListener("click", () => {
      if (state.translationResult?.translatedText) {
        navigator.clipboard.writeText(state.translationResult.translatedText);
        showToast("Translation copied!");
      }
    });
  }

  // Clear history button
  const clearHistoryBtn = document.getElementById("clear-history-btn");
  if (clearHistoryBtn) {
    clearHistoryBtn.addEventListener("click", async () => {
      recentTranslationsCache = [];
      // Note: recent translations are in-memory, so no need to save to settings
      renderRecentTranslations();
      showToast("Translation history cleared");
    });
  }

  // Recently translated items click handler
  document.addEventListener("click", (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>(
      "[data-recent-translation]",
    );
    if (!target) return;

    const index = parseInt(target.getAttribute("data-index") || "-1", 10);
    if (index < 0 || !recentTranslationsCache[index]) return;

    const item = recentTranslationsCache[index];
    state.originalText = item.originalText;
    state.sourceLanguage = ensureSupportedSourceLanguage(
      item.sourceLanguage,
      DEFAULT_LANGUAGE_PREFERENCES.sourceLanguage,
    );
    state.targetLanguage = ensureSupportedTargetLanguage(
      item.targetLanguage,
      DEFAULT_LANGUAGE_PREFERENCES.targetLanguage,
    );
    state.translationResult = {
      translatedText: item.translatedText,
      grammarExplanation: "",
      alternativeExpressions: [],
      alternatives: [],
      detectedLanguage:
        item.detectedLanguage ||
        (state.sourceLanguage === "auto" ? "en" : state.sourceLanguage),
      cefrLevel: "B1",
    };

    const sourceSelect = document.getElementById(
      "source-language",
    ) as HTMLSelectElement;
    const targetSelect = document.getElementById(
      "target-language",
    ) as HTMLSelectElement;
    if (sourceSelect) sourceSelect.value = state.sourceLanguage;
    if (targetSelect) targetSelect.value = state.targetLanguage;

    const originalTextarea = document.getElementById(
      "original-text",
    ) as HTMLTextAreaElement;
    if (originalTextarea) originalTextarea.value = state.originalText;

    displayTranslation();
  });
}

/**
 * Perform translation of original text
 * Task: T044
 */
async function performTranslation(): Promise<void> {
  if (!state.originalText.trim()) {
    showError("Please enter text to translate");
    return;
  }

  state.isLoading = true;
  state.error = null;
  displayTranslation();

  try {
    console.log(
      `[Glotian Translate] Translating from ${state.sourceLanguage} to ${state.targetLanguage}`,
    );

    const preferredSourceLanguage = ensureSupportedSourceLanguage(
      state.sourceLanguage,
      DEFAULT_LANGUAGE_PREFERENCES.sourceLanguage,
    );
    const preferredTargetLanguage = ensureSupportedTargetLanguage(
      state.targetLanguage,
      DEFAULT_LANGUAGE_PREFERENCES.targetLanguage,
    );

    const result = await translate({
      text: state.originalText,
      sourceLang: preferredSourceLanguage,
      targetLang: preferredTargetLanguage,
    });

    const resolvedSourceLanguage =
      result.detectedLanguage ||
      (preferredSourceLanguage === "auto" ? "en" : preferredSourceLanguage);

    // Map TranslateResponse to our extended type with cefrLevel and alternatives
    state.translationResult = {
      translatedText: result.translatedText,
      grammarExplanation: result.grammarExplanation,
      alternativeExpressions: result.alternativeExpressions,
      detectedLanguage: result.detectedLanguage,
      confidence: result.confidence,
      cefrLevel: "B1", // Default, should come from auto-tag
      alternatives: (result.alternativeExpressions || []).map((alt) =>
        typeof alt === "string" ? alt : alt.text,
      ),
    };
    state.translationResult.detectedLanguage = resolvedSourceLanguage;
    state.sourceLanguage = preferredSourceLanguage;
    state.targetLanguage = preferredTargetLanguage;

    const sourceSelect = document.getElementById(
      "source-language",
    ) as HTMLSelectElement | null;
    if (sourceSelect) sourceSelect.value = state.sourceLanguage;

    const targetSelect = document.getElementById(
      "target-language",
    ) as HTMLSelectElement | null;
    if (targetSelect) targetSelect.value = state.targetLanguage;
    state.isLoading = false;
    displayTranslation();

    // Add to recently translated cache
    addToRecentTranslations({
      sourceLanguage: resolvedSourceLanguage,
      targetLanguage: preferredTargetLanguage,
      originalText: state.originalText,
      translatedText: result.translatedText,
      timestamp: Date.now(),
      detectedLanguage: resolvedSourceLanguage,
    });
  } catch (error) {
    state.isLoading = false;
    state.error = error instanceof Error ? error.message : "Translation failed";
    displayTranslation();
    console.error("[Glotian Translate] Translation error:", error);
  }
}

/**
 * Display translation result or error state
 * Task: T044, T054-T058
 */
function displayTranslation(): void {
  const section = document.getElementById(
    "translation-result-section",
  ) as HTMLElement | null;
  if (!section) return;

  const loadingDiv = document.getElementById(
    "translation-loading",
  ) as HTMLElement | null;
  const resultDiv = document.getElementById(
    "translation-result",
  ) as HTMLElement | null;
  const errorDiv = document.getElementById(
    "translation-error",
  ) as HTMLElement | null;
  const offlineDiv = document.getElementById(
    "offline-state",
  ) as HTMLElement | null;

  if (!loadingDiv || !resultDiv || !errorDiv || !offlineDiv) return;

  // If there's no original text yet, hide everything
  if (!state.originalText) {
    hideElement(section);
    return;
  }

  showElement(section);

  // Hide all states first
  hideElement(loadingDiv);
  hideElement(resultDiv);
  hideElement(errorDiv);
  hideElement(offlineDiv);

  if (state.isLoading) {
    showElement(loadingDiv);
  } else if (state.error) {
    if (state.error.includes("offline") || state.error.includes("internet")) {
      showElement(offlineDiv);
    } else {
      showElement(errorDiv);
      const errorTitle = document.getElementById("error-title");
      const errorMessage = document.getElementById("error-message");
      if (errorTitle) errorTitle.textContent = "Translation failed";
      if (errorMessage) errorMessage.textContent = state.error;
    }
  } else if (state.translationResult) {
    showElement(resultDiv);

    // Display translated text
    const translatedTextDiv = document.getElementById("translated-text");
    if (translatedTextDiv) {
      translatedTextDiv.textContent = state.translationResult.translatedText;
    }

    // Display grammar info
    const grammarInfo = document.getElementById("grammar-info");
    if (grammarInfo) {
      grammarInfo.textContent =
        state.translationResult.grammarExplanation || "Unknown";
    }

    // Display CEFR badge
    const cefrBadge = document.getElementById("cefr-badge");
    if (cefrBadge) {
      cefrBadge.textContent = state.translationResult.cefrLevel || "B1";
      cefrBadge.className = `badge badge-primary cefr-badge cefr-${state.translationResult.cefrLevel}`;
    }

    // Display alternatives
    const alternativesSection = document.getElementById(
      "alternatives-section",
    ) as HTMLElement | null;
    const alternativesList = document.getElementById(
      "alternatives-list",
    ) as HTMLElement | null;
    if (
      alternativesList &&
      state.translationResult.alternatives &&
      state.translationResult.alternatives.length > 0
    ) {
      showElement(alternativesSection);
      alternativesList.innerHTML = state.translationResult.alternatives
        .map(
          (alt: string) =>
            `<li class="rounded-2xl border border-glotian-border bg-white px-3 py-2 text-sm leading-relaxed">${escapeHtml(alt)}</li>`,
        )
        .join("");
    } else if (alternativesSection) {
      hideElement(alternativesSection);
    }
  }
}

/**
 * Save translation to notes
 * Task: T046
 */
async function saveTranslationToNotes(): Promise<void> {
  if (!state.originalText || !state.translationResult) {
    showError("Nothing to save");
    return;
  }

  try {
    const userId = await getSetting("userId");
    if (!userId) {
      showError("Please log in to save notes");
      return;
    }

    const sourceLanguageForNote =
      state.translationResult.detectedLanguage ||
      (state.sourceLanguage === "auto" ? "en" : state.sourceLanguage);
    const targetLanguageForNote = ensureSupportedTargetLanguage(
      state.targetLanguage,
      DEFAULT_LANGUAGE_PREFERENCES.targetLanguage,
    );

    // Auto-tag the note
    console.log("[Glotian Translate] Auto-tagging note...");
    const tags = await autoTag({
      text: state.originalText,
      language: sourceLanguageForNote,
    });

    // Create note title
    const noteTitle =
      state.originalText.length > 80
        ? `${state.originalText.substring(0, 77)}…`
        : state.originalText;

    // Save to IndexedDB
    const note = await createCachedNote(userId, {
      title: noteTitle,
      content: JSON.stringify({
        originalText: state.originalText,
        translatedText: state.translationResult.translatedText,
        sourceLanguage: sourceLanguageForNote,
        targetLanguage: targetLanguageForNote,
        grammar: state.translationResult.grammarExplanation,
        alternatives: state.translationResult.alternatives,
        cefrLevel: state.translationResult.cefrLevel,
      }),
      tags: tags.tags || [],
      sourceType: "extension",
      sourceUrl: state.pageUrl || null,
    });
    console.log("[Glotian Translate] Note saved:", note.id);

    // Log activity
    await logActivity(userId, "note_created", {
      entityType: "learning_note",
      entityId: note.id,
      metadata: {
        sourceLanguage: sourceLanguageForNote,
        targetLanguage: targetLanguageForNote,
        textLength: state.originalText.length,
      },
    });

    // Show success
    showToast("Note saved!");

    // Clear the translate tab
    clearTranslateTab();
  } catch (error) {
    console.error("[Glotian Translate] Error saving note:", error);
    showError(error instanceof Error ? error.message : "Failed to save note");
  }
}

/**
 * Add translation to recent cache
 */
function addToRecentTranslations(
  item: (typeof recentTranslationsCache)[0],
): void {
  // Remove duplicates (same text, same language pair)
  recentTranslationsCache = recentTranslationsCache.filter(
    (t) =>
      !(
        t.originalText === item.originalText &&
        t.sourceLanguage === item.sourceLanguage &&
        t.targetLanguage === item.targetLanguage
      ),
  );

  // Add to beginning
  recentTranslationsCache.unshift(item);

  // Keep only last 10
  recentTranslationsCache = recentTranslationsCache.slice(0, 10);

  // Note: Recent translations are kept in memory during the session
  // Persistence can be implemented later if needed

  renderRecentTranslations();
}

/**
 * Render recently translated list
 * Task: T048
 */
function renderRecentTranslations(): void {
  const section = document.getElementById(
    "recently-translated-section",
  ) as HTMLElement | null;
  const list = document.getElementById("recently-translated-list");

  if (!section || !list) return;

  if (recentTranslationsCache.length === 0) {
    hideElement(section);
    return;
  }

  showElement(section);

  const html = recentTranslationsCache
    .map(
      (item, index) => `
        <button
          type="button"
          class="recent-translation-item w-full rounded-2xl border border-glotian-border bg-white px-4 py-3 text-left shadow-glotian transition hover:-translate-y-0.5 hover:shadow-glotian-lg focus:outline-none focus:ring-2 focus:ring-glotian-primary/30"
          data-index="${index}"
          data-recent-translation="true"
          aria-label="Load ${escapeHtml(item.originalText.substring(0, 40))} translation"
        >
          <div class="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.2em] text-glotian-text-tertiary">
            <span>${item.sourceLanguage.toUpperCase()}</span>
            <span class="text-glotian-primary">→</span>
            <span>${item.targetLanguage.toUpperCase()}</span>
          </div>
          <p class="mt-2 text-sm font-medium text-glotian-text-primary overflow-hidden text-ellipsis whitespace-nowrap">
            ${escapeHtml(item.originalText)}
          </p>
          <p class="mt-1 text-sm text-glotian-text-secondary overflow-hidden text-ellipsis whitespace-nowrap">
            ${escapeHtml(item.translatedText)}
          </p>
        </button>
      `,
    )
    .join("");

  list.innerHTML = html;
}

/**
 * Clear translate tab (after saving)
 */
function clearTranslateTab(): void {
  state.originalText = "";
  state.translationResult = null;
  state.error = null;

  const originalTextarea = document.getElementById(
    "original-text",
  ) as HTMLTextAreaElement;
  if (originalTextarea) originalTextarea.value = "";

  const section = document.getElementById(
    "translation-result-section",
  ) as HTMLElement | null;
  hideElement(section);
}

/**
 * Show error message
 */
function showError(message: string): void {
  state.error = message;
  displayTranslation();
}

/**
 * Show toast notification
 */
function showToast(message: string): void {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("show");
  }, 10);

  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Public function to handle captured text from content script
 * Called by messaging.ts when CAPTURE_TEXT message is received
 * Task: T040
 */
export async function handleCapturedText(
  originalText: string,
  pageUrl: string = "",
  pageTitle: string = "",
): Promise<void> {
  console.log(
    "[Glotian Translate] Handling captured text:",
    originalText.substring(0, 50),
  );

  // Truncate if needed
  if (originalText.length > 1000) {
    console.warn(
      "[Glotian Translate] Text truncated from",
      originalText.length,
      "to 1000 characters",
    );
    originalText = originalText.substring(0, 1000);
  }

  state.originalText = originalText;
  state.pageUrl = pageUrl;
  state.pageTitle = pageTitle;

  // Update UI
  const originalTextarea = document.getElementById(
    "original-text",
  ) as HTMLTextAreaElement;
  const charCount = document.getElementById("char-count");
  const translateBtn = document.getElementById("translate-btn");

  if (originalTextarea) {
    originalTextarea.value = originalText;

    // Update char count
    if (charCount) {
      if (originalText.length > 1000) {
        charCount.textContent = "⚠️ Text truncated to 1000 characters";
        charCount.style.color = "orange";
      } else {
        charCount.textContent = `${originalText.length} / 1000`;
        charCount.style.color = "";
      }
    }

    // Enable translate button
    if (translateBtn && originalText.trim()) {
      translateBtn.removeAttribute("disabled");
    }
  }

  // Start translation automatically for captured text
  await performTranslation();
}
