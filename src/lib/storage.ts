import type { ExtensionSettings, AISupport } from "@/types";
import {
  getDefaultLanguagePreferences,
  ensureSupportedSourceLanguage,
  ensureSupportedTargetLanguage,
} from "@/lib/language";

/**
 * Chrome storage wrapper for extension settings
 * Uses chrome.storage.local for persistent storage (5MB quota)
 */

// Default settings
const LANGUAGE_DEFAULTS = getDefaultLanguagePreferences();

const DEFAULT_SETTINGS: Partial<ExtensionSettings> = {
  sourceLanguage: LANGUAGE_DEFAULTS.sourceLanguage,
  targetLanguage: LANGUAGE_DEFAULTS.targetLanguage,
  defaultCEFRLevel: "B1",
  autoSaveEnabled: true,
  chromeAIEnabled: true,
  serverFallbackEnabled: true,
  uiLanguage: LANGUAGE_DEFAULTS.uiLanguage,
  sidePanelLastTab: "capture",
  telemetryEnabled: false,
  errorLogs: [],
  lastSyncTime: null,
  supabaseSession: null,
  userId: null,
  aiSupport: {
    translator: false,
    summarizer: false,
    prompt: false,
    writer: false,
    rewriter: false,
    proofreader: false,
  },
};

/**
 * Get a specific setting from chrome.storage.local
 */
export async function getSetting<K extends keyof ExtensionSettings>(
  key: K,
): Promise<ExtensionSettings[K]> {
  try {
    const result = await chrome.storage.local.get(key);
    if (key === "sourceLanguage") {
      return ensureSupportedSourceLanguage(
        (result[key] ?? DEFAULT_SETTINGS[key]) as string,
        LANGUAGE_DEFAULTS.sourceLanguage,
      ) as ExtensionSettings[K];
    }

    if (key === "targetLanguage") {
      return ensureSupportedTargetLanguage(
        (result[key] ?? DEFAULT_SETTINGS[key]) as string,
        LANGUAGE_DEFAULTS.targetLanguage,
      ) as ExtensionSettings[K];
    }

    return (result[key] ?? DEFAULT_SETTINGS[key]) as ExtensionSettings[K];
  } catch (error) {
    console.error(
      `[Glotian Storage] Error getting setting ${String(key)}:`,
      error,
    );
    if (key === "sourceLanguage") {
      return ensureSupportedSourceLanguage(
        DEFAULT_SETTINGS[key] as string,
        LANGUAGE_DEFAULTS.sourceLanguage,
      ) as ExtensionSettings[K];
    }

    if (key === "targetLanguage") {
      return ensureSupportedTargetLanguage(
        DEFAULT_SETTINGS[key] as string,
        LANGUAGE_DEFAULTS.targetLanguage,
      ) as ExtensionSettings[K];
    }

    return DEFAULT_SETTINGS[key] as ExtensionSettings[K];
  }
}

/**
 * Get multiple settings from chrome.storage.local
 */
export async function getSettings<K extends keyof ExtensionSettings>(
  keys: K[],
): Promise<Pick<ExtensionSettings, K>> {
  try {
    const result = await chrome.storage.local.get(keys);
    const settings: Partial<ExtensionSettings> = {};

    for (const key of keys) {
      if (key === "sourceLanguage") {
        settings[key] = ensureSupportedSourceLanguage(
          (result[key] ?? DEFAULT_SETTINGS[key]) as string,
          LANGUAGE_DEFAULTS.sourceLanguage,
        );
        continue;
      }

      if (key === "targetLanguage") {
        settings[key] = ensureSupportedTargetLanguage(
          (result[key] ?? DEFAULT_SETTINGS[key]) as string,
          LANGUAGE_DEFAULTS.targetLanguage,
        );
        continue;
      }

      settings[key] = result[key] ?? DEFAULT_SETTINGS[key];
    }

    return settings as Pick<ExtensionSettings, K>;
  } catch (error) {
    console.error("[Glotian Storage] Error getting settings:", error);
    const fallback: Partial<ExtensionSettings> = {};
    for (const key of keys) {
      if (key === "sourceLanguage") {
        fallback[key] = ensureSupportedSourceLanguage(
          DEFAULT_SETTINGS[key] as string,
          LANGUAGE_DEFAULTS.sourceLanguage,
        );
        continue;
      }

      if (key === "targetLanguage") {
        fallback[key] = ensureSupportedTargetLanguage(
          DEFAULT_SETTINGS[key] as string,
          LANGUAGE_DEFAULTS.targetLanguage,
        );
        continue;
      }

      fallback[key] = DEFAULT_SETTINGS[key];
    }
    return fallback as Pick<ExtensionSettings, K>;
  }
}

/**
 * Get all settings from chrome.storage.local
 */
export async function getAllSettings(): Promise<ExtensionSettings> {
  try {
    const result = await chrome.storage.local.get(null);
    const merged = {
      ...DEFAULT_SETTINGS,
      ...result,
    } as ExtensionSettings;

    merged.sourceLanguage = ensureSupportedSourceLanguage(
      merged.sourceLanguage,
      LANGUAGE_DEFAULTS.sourceLanguage,
    );
    merged.targetLanguage = ensureSupportedTargetLanguage(
      merged.targetLanguage,
      LANGUAGE_DEFAULTS.targetLanguage,
    );

    return merged;
  } catch (error) {
    console.error("[Glotian Storage] Error getting all settings:", error);
    return {
      ...(DEFAULT_SETTINGS as ExtensionSettings),
      sourceLanguage: ensureSupportedSourceLanguage(
        DEFAULT_SETTINGS.sourceLanguage as string,
        LANGUAGE_DEFAULTS.sourceLanguage,
      ),
      targetLanguage: ensureSupportedTargetLanguage(
        DEFAULT_SETTINGS.targetLanguage as string,
        LANGUAGE_DEFAULTS.targetLanguage,
      ),
    };
  }
}

/**
 * Set a specific setting in chrome.storage.local
 */
export async function setSetting<K extends keyof ExtensionSettings>(
  key: K,
  value: ExtensionSettings[K],
): Promise<void> {
  try {
    let normalizedValue: ExtensionSettings[K] = value;

    if (key === "sourceLanguage") {
      normalizedValue = ensureSupportedSourceLanguage(
        value as string,
        LANGUAGE_DEFAULTS.sourceLanguage,
      ) as ExtensionSettings[K];
    } else if (key === "targetLanguage") {
      normalizedValue = ensureSupportedTargetLanguage(
        value as string,
        LANGUAGE_DEFAULTS.targetLanguage,
      ) as ExtensionSettings[K];
    }

    await chrome.storage.local.set({ [key]: normalizedValue });
    console.log(`[Glotian Storage] Setting ${String(key)} updated`);
  } catch (error) {
    console.error(`[Glotian Storage] Error setting ${String(key)}:`, error);
    throw error;
  }
}

/**
 * Set multiple settings in chrome.storage.local
 */
export async function setSettings(
  settings: Partial<ExtensionSettings>,
): Promise<void> {
  try {
    const normalizedSettings: Partial<ExtensionSettings> = { ...settings };

    if (typeof settings.sourceLanguage === "string") {
      normalizedSettings.sourceLanguage = ensureSupportedSourceLanguage(
        settings.sourceLanguage,
        LANGUAGE_DEFAULTS.sourceLanguage,
      );
    }

    if (typeof settings.targetLanguage === "string") {
      normalizedSettings.targetLanguage = ensureSupportedTargetLanguage(
        settings.targetLanguage,
        LANGUAGE_DEFAULTS.targetLanguage,
      );
    }

    await chrome.storage.local.set(normalizedSettings);
    console.log("[Glotian Storage] Settings updated:", Object.keys(settings));
  } catch (error) {
    console.error("[Glotian Storage] Error setting multiple settings:", error);
    throw error;
  }
}

/**
 * Remove a specific setting from chrome.storage.local
 */
export async function removeSetting(
  key: keyof ExtensionSettings,
): Promise<void> {
  try {
    await chrome.storage.local.remove(String(key));
    console.log(`[Glotian Storage] Setting ${String(key)} removed`);
  } catch (error) {
    console.error(`[Glotian Storage] Error removing ${String(key)}:`, error);
    throw error;
  }
}

/**
 * Clear all settings from chrome.storage.local
 */
export async function clearAllSettings(): Promise<void> {
  try {
    await chrome.storage.local.clear();
    console.log("[Glotian Storage] All settings cleared");
  } catch (error) {
    console.error("[Glotian Storage] Error clearing settings:", error);
    throw error;
  }
}

/**
 * Listen to storage changes
 * Returns a cleanup function to unsubscribe the listener
 */
export function onSettingsChanged(
  callback: (changes: { [key: string]: chrome.storage.StorageChange }) => void,
): () => void {
  const listener = (
    changes: { [key: string]: chrome.storage.StorageChange },
    areaName: string,
  ) => {
    if (areaName === "local") {
      callback(changes);
    }
  };

  chrome.storage.onChanged.addListener(listener);

  // Return cleanup function
  return () => {
    chrome.storage.onChanged.removeListener(listener);
  };
}

/**
 * Log error to local storage (max 100 entries)
 */
export async function logError(
  context: string,
  error: Error,
  metadata?: Record<string, any>,
): Promise<void> {
  try {
    const errorLogs = (await getSetting("errorLogs")) || [];

    const errorLog = {
      timestamp: Date.now(),
      context,
      message: error.message,
      stack: error.stack,
      metadata,
    };

    errorLogs.unshift(errorLog);

    // Keep only last 100 errors
    if (errorLogs.length > 100) {
      errorLogs.pop();
    }

    await setSetting("errorLogs", errorLogs);
    console.error(
      `[Glotian Storage] Error logged in context ${context}:`,
      error,
    );
  } catch (err) {
    console.error("[Glotian Storage] Failed to log error:", err);
  }
}

/**
 * Clear error logs
 */
export async function clearErrorLogs(): Promise<void> {
  await setSetting("errorLogs", []);
}

/**
 * Update AI support detection
 */
export async function updateAISupport(aiSupport: AISupport): Promise<void> {
  await setSetting("aiSupport", aiSupport);
  console.log("[Glotian Storage] AI support updated:", aiSupport);
}

/**
 * Update last sync time
 */
export async function updateLastSyncTime(timestamp: number): Promise<void> {
  await setSetting("lastSyncTime", timestamp);
}
