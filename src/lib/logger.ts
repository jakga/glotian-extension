/**
 * Error logging utility
 *
 * Task: T186
 * Logs errors to chrome.storage.local with max 100 entries (FIFO)
 */

export interface ErrorLog {
  id: string;
  timestamp: number;
  message: string;
  stack?: string;
  context?: string;
  url?: string;
  userAgent?: string;
}

const MAX_ERROR_LOGS = 100;
const STORAGE_KEY = "error_logs";

/**
 * Log an error to chrome.storage.local
 */
export async function logError(
  error: Error | string,
  context?: string,
  url?: string,
): Promise<void> {
  try {
    const errorLog: ErrorLog = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      message: typeof error === "string" ? error : error.message,
      stack: typeof error === "string" ? undefined : error.stack,
      context,
      url,
      userAgent: navigator.userAgent,
    };

    // Get existing logs
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const logs: ErrorLog[] = result[STORAGE_KEY] || [];

    // Add new log
    logs.push(errorLog);

    // Keep only last MAX_ERROR_LOGS entries (FIFO)
    const trimmedLogs = logs.slice(-MAX_ERROR_LOGS);

    // Save back to storage
    await chrome.storage.local.set({ [STORAGE_KEY]: trimmedLogs });

    console.log("[Glotian Logger] Error logged:", errorLog);
  } catch (storageError) {
    // Fail silently to avoid infinite loop
    console.error("[Glotian Logger] Failed to log error:", storageError);
  }
}

/**
 * Get all error logs
 */
export async function getErrorLogs(): Promise<ErrorLog[]> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    return result[STORAGE_KEY] || [];
  } catch (error) {
    console.error("[Glotian Logger] Failed to retrieve error logs:", error);
    return [];
  }
}

/**
 * Clear all error logs
 */
export async function clearErrorLogs(): Promise<void> {
  try {
    await chrome.storage.local.remove(STORAGE_KEY);
    console.log("[Glotian Logger] Error logs cleared");
  } catch (error) {
    console.error("[Glotian Logger] Failed to clear error logs:", error);
  }
}

/**
 * Get error count
 */
export async function getErrorCount(): Promise<number> {
  try {
    const logs = await getErrorLogs();
    return logs.length;
  } catch (error) {
    console.error("[Glotian Logger] Failed to get error count:", error);
    return 0;
  }
}

/**
 * Export logs as JSON string (for debugging or sharing)
 */
export async function exportErrorLogs(): Promise<string> {
  try {
    const logs = await getErrorLogs();
    return JSON.stringify(logs, null, 2);
  } catch (error) {
    console.error("[Glotian Logger] Failed to export error logs:", error);
    return "[]";
  }
}
