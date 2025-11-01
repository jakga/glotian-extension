/**
 * Settings Component
 *
 * Tasks: T189-T193
 * User preferences and configuration management
 */

import { getSetting, setSetting } from "@/lib/storage";
import { db } from "@/lib/db/schema";
import { renderErrorLogsViewer } from "./error-logs";
import { isTelemetryEnabled, initTelemetry } from "@/lib/telemetry";
import {
  ensureSupportedSourceLanguage,
  ensureSupportedTargetLanguage,
  getDefaultLanguagePreferences,
} from "@/lib/language";

/**
 * Render settings modal
 */
export async function renderSettingsModal(
  container: HTMLElement,
): Promise<void> {
  // Load current settings
  const defaults = getDefaultLanguagePreferences();
  const sourceLanguage = ensureSupportedSourceLanguage(
    await getSetting("sourceLanguage"),
    defaults.sourceLanguage,
  );
  const targetLanguage = ensureSupportedTargetLanguage(
    await getSetting("targetLanguage"),
    defaults.targetLanguage,
  );
  const cefrLevel = await getSetting("defaultCEFRLevel");
  const aiFallbackEnabled = await getSetting("serverFallbackEnabled");
  const telemetryOptIn = await getSetting("telemetryEnabled");

  container.innerHTML = `
    <div class="settings-modal">
      <div class="settings-header">
        <h2>Settings</h2>
        <button id="settings-close" class="btn-close" aria-label="Close">×</button>
      </div>

      <div class="settings-content">
        <!-- Language Settings -->
        <section class="settings-section">
          <h3>Language Settings</h3>

          <div class="settings-field">
            <label for="settings-source-lang">Source Language</label>
            <select id="settings-source-lang">
              ${renderLanguageOptions(sourceLanguage, { includeAuto: true })}
            </select>
            <p class="settings-hint">Language you're learning from</p>
          </div>

          <div class="settings-field">
            <label for="settings-target-lang">Target Language</label>
            <select id="settings-target-lang">
              ${renderLanguageOptions(targetLanguage)}
            </select>
            <p class="settings-hint">Your native language</p>
          </div>

          <div class="settings-field">
            <label for="settings-cefr-level">CEFR Level</label>
            <select id="settings-cefr-level">
              <option value="A1" ${cefrLevel === "A1" ? "selected" : ""}>A1 - Beginner</option>
              <option value="A2" ${cefrLevel === "A2" ? "selected" : ""}>A2 - Elementary</option>
              <option value="B1" ${cefrLevel === "B1" ? "selected" : ""}>B1 - Intermediate</option>
              <option value="B2" ${cefrLevel === "B2" ? "selected" : ""}>B2 - Upper Intermediate</option>
              <option value="C1" ${cefrLevel === "C1" ? "selected" : ""}>C1 - Advanced</option>
              <option value="C2" ${cefrLevel === "C2" ? "selected" : ""}>C2 - Proficient</option>
            </select>
            <p class="settings-hint">Used for simplifying content</p>
          </div>
        </section>

        <!-- AI Settings (Task: T191) -->
        <section class="settings-section">
          <h3>AI Settings</h3>

          <div class="settings-field">
            <label class="settings-toggle">
              <input type="checkbox" id="settings-ai-fallback" ${aiFallbackEnabled ? "checked" : ""}>
              <span>Enable Server Fallback</span>
            </label>
            <p class="settings-hint">
              Use OpenAI/Gemini API when Chrome Built-in AI is unavailable
            </p>
          </div>
        </section>

        <!-- Keyboard Shortcuts (Task: T190) -->
        <section class="settings-section">
          <h3>Keyboard Shortcuts</h3>

          <div class="shortcuts-list">
            <div class="shortcut-item">
              <span class="shortcut-label">Capture Text</span>
              <kbd>Ctrl+Shift+F</kbd>
            </div>
            <div class="shortcut-item">
              <span class="shortcut-label">Summarize Page</span>
              <kbd>Ctrl+Shift+S</kbd>
            </div>
            <div class="shortcut-item">
              <span class="shortcut-label">Writing Coach</span>
              <kbd>Ctrl+Shift+K</kbd>
            </div>
            <div class="shortcut-item">
              <span class="shortcut-label">Open Side Panel</span>
              <kbd>Ctrl+Shift+E</kbd>
            </div>
          </div>

          <button id="settings-customize-shortcuts" class="btn-secondary">
            Customize Shortcuts
          </button>
          <p class="settings-hint">
            Opens Chrome's extension shortcut settings
          </p>
        </section>

        <!-- Telemetry (Task: T193) -->
        <section class="settings-section">
          <h3>Privacy & Analytics</h3>

          <div class="settings-field">
            <label class="settings-toggle">
              <input type="checkbox" id="settings-telemetry" ${telemetryOptIn ? "checked" : ""}>
              <span>Send Anonymous Usage Data</span>
            </label>
            <p class="settings-hint">
              Help improve Glotian by sharing anonymous error reports and usage statistics (via Sentry)
            </p>
          </div>

          <button id="settings-view-error-logs" class="btn-secondary">
            View Error Logs
          </button>
        </section>

        <!-- Data Management (Task: T192) -->
        <section class="settings-section">
          <h3>Data Management</h3>

          <div class="settings-stats" id="settings-stats">
            <p>Loading storage stats...</p>
          </div>

          <button id="settings-clear-data" class="btn-danger">
            Clear All Local Data
          </button>
          <p class="settings-hint">
            Deletes all cached notes, flashcards, and sync queue. Synced data on server remains intact.
          </p>
        </section>
      </div>

      <div class="settings-footer">
        <p class="settings-version">Version ${chrome.runtime.getManifest().version}</p>
        <button id="settings-save" class="btn-primary">Save Changes</button>
      </div>
    </div>
  `;

  // Add styles
  addStyles();

  // Load storage stats
  await loadStorageStats(container);

  // Setup event listeners
  setupEventListeners(container);
}

/**
 * Render language options
 */
function renderLanguageOptions(
  selected: string,
  { includeAuto = false }: { includeAuto?: boolean } = {},
): string {
  const languages = [
    ...(includeAuto ? [{ code: "auto", name: "Auto Detect" }] : []),
    { code: "en", name: "English" },
    { code: "ko", name: "Korean" },
    { code: "es", name: "Spanish" },
    { code: "fr", name: "French" },
    { code: "de", name: "German" },
    { code: "zh-hans", name: "Chinese (Simplified)" },
    { code: "zh-hant", name: "Chinese (Traditional)" },
    { code: "ja", name: "Japanese" },
    { code: "it", name: "Italian" },
    { code: "pt", name: "Portuguese" },
    { code: "ru", name: "Russian" },
    { code: "ar", name: "Arabic" },
    { code: "hi", name: "Hindi" },
  ];

  return languages
    .map(
      (lang) =>
        `<option value="${lang.code}" ${lang.code === selected ? "selected" : ""}>${lang.name}</option>`,
    )
    .join("");
}

/**
 * Load storage statistics
 */
async function loadStorageStats(container: HTMLElement): Promise<void> {
  try {
    const notesCount = await db.notes.count();
    const flashcardsCount = await db.flashcards.count();
    const decksCount = await db.decks.count();
    const syncQueueCount = await db.syncQueue.count();

    const statsEl = container.querySelector("#settings-stats");
    if (statsEl) {
      statsEl.innerHTML = `
        <p><strong>${notesCount}</strong> cached notes</p>
        <p><strong>${flashcardsCount}</strong> cached flashcards</p>
        <p><strong>${decksCount}</strong> cached decks</p>
        <p><strong>${syncQueueCount}</strong> items in sync queue</p>
      `;
    }
  } catch (error) {
    console.error("[Settings] Failed to load storage stats:", error);
    const statsEl = container.querySelector("#settings-stats");
    if (statsEl) {
      statsEl.innerHTML = `<p class="error">Failed to load storage stats</p>`;
    }
  }
}

/**
 * Setup event listeners
 */
function setupEventListeners(container: HTMLElement): void {
  // Close button
  const closeBtn = container.querySelector("#settings-close");
  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      container.innerHTML = "";
    });
  }

  // Save button
  const saveBtn = container.querySelector("#settings-save");
  if (saveBtn) {
    saveBtn.addEventListener("click", async () => {
      await saveSettings(container);
    });
  }

  // Customize shortcuts button (Task: T190)
  const customizeShortcutsBtn = container.querySelector(
    "#settings-customize-shortcuts",
  );
  if (customizeShortcutsBtn) {
    customizeShortcutsBtn.addEventListener("click", () => {
      chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
    });
  }

  // View error logs button (Task: T188)
  const viewErrorLogsBtn = container.querySelector("#settings-view-error-logs");
  if (viewErrorLogsBtn) {
    viewErrorLogsBtn.addEventListener("click", () => {
      const errorLogsContainer = document.createElement("div");
      errorLogsContainer.className = "error-logs-modal";

      const teardownErrorLogs = renderErrorLogsViewer(errorLogsContainer);

      // Replace settings content with error logs
      const settingsContent = container.querySelector(".settings-content");
      if (settingsContent) {
        settingsContent.innerHTML = "";
        settingsContent.appendChild(errorLogsContainer);

        // Add back button
        const backBtn = document.createElement("button");
        backBtn.textContent = "← Back to Settings";
        backBtn.className = "btn-secondary";
        backBtn.style.marginBottom = "20px";
        backBtn.addEventListener("click", async () => {
          teardownErrorLogs();
          await renderSettingsModal(container);
        });
        settingsContent.prepend(backBtn);
      }
    });
  }

  // Clear data button (Task: T192)
  const clearDataBtn = container.querySelector("#settings-clear-data");
  if (clearDataBtn) {
    clearDataBtn.addEventListener("click", async () => {
      if (
        !confirm(
          "Are you sure you want to clear all local data?\n\n" +
            "This will delete:\n" +
            "- All cached notes, flashcards, and decks\n" +
            "- Sync queue (pending changes will be lost)\n" +
            "- Activity logs\n\n" +
            "Synced data on the server will NOT be affected.\n\n" +
            "This cannot be undone.",
        )
      ) {
        return;
      }

      try {
        // Show loading state
        clearDataBtn.textContent = "Clearing...";
        clearDataBtn.setAttribute("disabled", "true");

        // Clear IndexedDB
        await db.notes.clear();
        await db.flashcards.clear();
        await db.decks.clear();
        await db.syncQueue.clear();
        await db.activityLog.clear();

        // Clear chrome.storage.local (except user settings)
        const keysToPreserve = [
          "sourceLanguage",
          "targetLanguage",
          "cefrLevel",
          "serverFallbackEnabled",
          "telemetryEnabled",
          "userId",
        ];
        const allKeys = await chrome.storage.local.get(null);
        const keysToRemove = Object.keys(allKeys).filter(
          (key) => !keysToPreserve.includes(key),
        );
        if (keysToRemove.length > 0) {
          await chrome.storage.local.remove(keysToRemove);
        }

        console.log("[Settings] All local data cleared successfully");

        // Reload stats
        await loadStorageStats(container);

        alert("All local data has been cleared successfully.");

        // Reset button state
        clearDataBtn.textContent = "Clear All Local Data";
        clearDataBtn.removeAttribute("disabled");
      } catch (error) {
        console.error("[Settings] Failed to clear data:", error);
        alert("Failed to clear local data: " + (error as Error).message);

        // Reset button state
        clearDataBtn.textContent = "Clear All Local Data";
        clearDataBtn.removeAttribute("disabled");
      }
    });
  }

  // Telemetry toggle (Task: T193)
  const telemetryToggle = container.querySelector(
    "#settings-telemetry",
  ) as HTMLInputElement;
  if (telemetryToggle) {
    telemetryToggle.addEventListener("change", async () => {
      const enabled = telemetryToggle.checked;

      if (enabled) {
        // Initialize telemetry
        try {
          await initTelemetry();
          console.log("[Settings] Telemetry initialized");
        } catch (error) {
          console.error("[Settings] Failed to initialize telemetry:", error);
        }
      } else {
        // Disable/cleanup telemetry if needed
        console.log("[Settings] Telemetry disabled");
      }
    });
  }
}

/**
 * Save settings
 */
async function saveSettings(container: HTMLElement): Promise<void> {
  try {
    // Get form values
    const sourceLanguage = (
      container.querySelector("#settings-source-lang") as HTMLSelectElement
    )?.value;
    const targetLanguage = (
      container.querySelector("#settings-target-lang") as HTMLSelectElement
    )?.value;
    const cefrLevel = (
      container.querySelector("#settings-cefr-level") as HTMLSelectElement
    )?.value;
    const aiFallbackEnabled = (
      container.querySelector("#settings-ai-fallback") as HTMLInputElement
    )?.checked;
    const telemetryOptIn = (
      container.querySelector("#settings-telemetry") as HTMLInputElement
    )?.checked;

    if (cefrLevel)
      await setSetting(
        "defaultCEFRLevel",
        cefrLevel as "A1" | "A2" | "B1" | "B2" | "C1" | "C2",
      );
    if (sourceLanguage) await setSetting("sourceLanguage", sourceLanguage);
    if (targetLanguage) await setSetting("targetLanguage", targetLanguage);
    if (aiFallbackEnabled !== undefined)
      await setSetting("serverFallbackEnabled", aiFallbackEnabled);
    if (telemetryOptIn !== undefined)
      await setSetting("telemetryEnabled", telemetryOptIn);

    console.log("[Settings] Settings saved successfully");

    // Show success message
    const saveBtn = container.querySelector("#settings-save");
    if (saveBtn) {
      const originalText = saveBtn.textContent;
      saveBtn.textContent = "✓ Saved!";
      saveBtn.classList.add("btn-success");

      setTimeout(() => {
        saveBtn.textContent = originalText;
        saveBtn.classList.remove("btn-success");
      }, 2000);
    }
  } catch (error) {
    console.error("[Settings] Failed to save settings:", error);
    alert("Failed to save settings: " + (error as Error).message);
  }
}

/**
 * Add CSS styles
 */
function addStyles(): void {
  if (document.getElementById("settings-styles")) return;

  const style = document.createElement("style");
  style.id = "settings-styles";
  style.textContent = `
    .settings-modal {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: #fff;
      z-index: 1000;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .settings-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 20px;
      border-bottom: 1px solid #e0e0e0;
    }

    .settings-header h2 {
      margin: 0;
      font-size: 20px;
      font-weight: 600;
    }

    .btn-close {
      background: none;
      border: none;
      font-size: 32px;
      cursor: pointer;
      color: #666;
      padding: 0;
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .btn-close:hover {
      color: #333;
    }

    .settings-content {
      flex: 1;
      overflow-y: auto;
      padding: 20px;
    }

    .settings-section {
      margin-bottom: 40px;
    }

    .settings-section h3 {
      margin: 0 0 20px 0;
      font-size: 16px;
      font-weight: 600;
      color: #333;
    }

    .settings-field {
      margin-bottom: 20px;
    }

    .settings-field label {
      display: block;
      font-weight: 500;
      margin-bottom: 8px;
      color: #333;
    }

    .settings-field select {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid #ccc;
      border-radius: 6px;
      font-size: 14px;
      background: #fff;
    }

    .settings-hint {
      margin: 6px 0 0 0;
      font-size: 13px;
      color: #666;
    }

    .settings-toggle {
      display: flex;
      align-items: center;
      gap: 10px;
      cursor: pointer;
    }

    .settings-toggle input[type="checkbox"] {
      width: 18px;
      height: 18px;
      cursor: pointer;
    }

    .shortcuts-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-bottom: 16px;
    }

    .shortcut-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px;
      background: #f5f5f5;
      border-radius: 6px;
    }

    .shortcut-label {
      font-weight: 500;
      color: #333;
    }

    kbd {
      padding: 4px 8px;
      background: #fff;
      border: 1px solid #ccc;
      border-radius: 4px;
      font-family: monospace;
      font-size: 13px;
      box-shadow: 0 1px 2px rgba(0,0,0,0.1);
    }

    .settings-stats {
      padding: 12px;
      background: #f5f5f5;
      border-radius: 6px;
      margin-bottom: 16px;
    }

    .settings-stats p {
      margin: 6px 0;
      font-size: 14px;
    }

    .settings-stats p.error {
      color: #d32f2f;
    }

    .settings-footer {
      padding: 20px;
      border-top: 1px solid #e0e0e0;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .settings-version {
      margin: 0;
      font-size: 13px;
      color: #666;
    }

    .btn-primary {
      padding: 10px 24px;
      border: none;
      border-radius: 6px;
      background: #1976d2;
      color: #fff;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
    }

    .btn-primary:hover {
      background: #1565c0;
    }

    .btn-primary.btn-success {
      background: #4caf50;
    }

    .btn-secondary {
      padding: 8px 16px;
      border: 1px solid #ccc;
      border-radius: 6px;
      background: #fff;
      color: #333;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
    }

    .btn-secondary:hover {
      background: #f5f5f5;
    }

    .btn-danger {
      padding: 10px 20px;
      border: 1px solid #d32f2f;
      border-radius: 6px;
      background: #d32f2f;
      color: #fff;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
    }

    .btn-danger:hover {
      background: #c62828;
    }

    .btn-danger:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  `;

  document.head.appendChild(style);
}
