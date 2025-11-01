/**
 * Error Logs Viewer Component
 *
 * Task: T188
 * View and manage error logs from chrome.storage.local
 */

import {
  getErrorLogs,
  clearErrorLogs,
  exportErrorLogs,
  type ErrorLog,
} from "@/lib/logger";

/**
 * Render error logs viewer in settings modal
 */
export function renderErrorLogsViewer(container: HTMLElement): () => void {
  container.innerHTML = `
    <div class="error-logs-viewer">
      <div class="error-logs-header">
        <h3>Error Logs</h3>
        <div class="error-logs-actions">
          <button id="error-logs-export" class="btn-secondary">
            Export
          </button>
          <button id="error-logs-clear" class="btn-danger">
            Clear All
          </button>
        </div>
      </div>
      <div id="error-logs-stats" class="error-logs-stats">
        Loading...
      </div>
      <div id="error-logs-list" class="error-logs-list">
        <p class="loading">Loading error logs...</p>
      </div>
    </div>
  `;

  // Add styles
  addStyles();

  // Load logs
  void loadErrorLogs(container);

  // Setup event listeners
  const teardownListeners = setupEventListeners(container);

  let disposed = false;

  return () => {
    if (disposed) return;
    disposed = true;
    teardownListeners();
  };
}

/**
 * Load and display error logs
 */
async function loadErrorLogs(container: HTMLElement): Promise<void> {
  try {
    const logs: ErrorLog[] = await getErrorLogs();

    const statsEl = container.querySelector("#error-logs-stats");
    const listEl = container.querySelector("#error-logs-list");

    if (!statsEl || !listEl) return;

    // Update stats
    statsEl.innerHTML = `
      <p><strong>${logs.length}</strong> error logs (max 100)</p>
    `;

    // Display logs
    if (logs.length === 0) {
      listEl.innerHTML = `
        <div class="error-logs-empty">
          <p>No error logs yet. Errors will be logged here automatically.</p>
        </div>
      `;
      return;
    }

    // Sort logs by timestamp (newest first)
    logs.sort((a, b) => b.timestamp - a.timestamp);

    // Render log list
    listEl.innerHTML = logs
      .map(
        (log) => `
      <div class="error-log-item" data-log-id="${escapeHtml(String(log.id))}">
        <div class="error-log-header">
          <span class="error-log-time">${formatTime(log.timestamp)}</span>
          <span class="error-log-context">${escapeHtml(log.context || "unknown")}</span>
        </div>
        <div class="error-log-message">${escapeHtml(log.message)}</div>
        ${
          log.stack
            ? `<details class="error-log-stack">
          <summary>Stack Trace</summary>
          <pre>${escapeHtml(log.stack)}</pre>
        </details>`
            : ""
        }
        ${log.url ? `<div class="error-log-url">URL: ${escapeHtml(log.url)}</div>` : ""}
      </div>
    `,
      )
      .join("");
  } catch (error) {
    console.error("[Error Logs Viewer] Failed to load logs:", error);

    const listEl = container.querySelector("#error-logs-list");
    if (listEl) {
      listEl.innerHTML = `
        <div class="error-logs-error">
          <p>Failed to load error logs: ${(error as Error).message}</p>
        </div>
      `;
    }
  }
}

/**
 * Setup event listeners
 */
function setupEventListeners(container: HTMLElement): () => void {
  let exportBtn =
    container.querySelector<HTMLButtonElement>("#error-logs-export");
  let clearBtn =
    container.querySelector<HTMLButtonElement>("#error-logs-clear");

  const handleExportClick = async (): Promise<void> => {
    try {
      const json = await exportErrorLogs();

      // Download as JSON file
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `glotian-error-logs-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);

      console.log("[Error Logs Viewer] Logs exported successfully");
    } catch (error) {
      console.error("[Error Logs Viewer] Failed to export logs:", error);
      alert("Failed to export error logs");
    }
  };

  const handleClearClick = async (): Promise<void> => {
    if (
      !confirm(
        "Are you sure you want to clear all error logs? This cannot be undone.",
      )
    ) {
      return;
    }

    try {
      await clearErrorLogs();
      console.log("[Error Logs Viewer] Logs cleared successfully");

      // Reload logs
      await loadErrorLogs(container);
    } catch (error) {
      console.error("[Error Logs Viewer] Failed to clear logs:", error);
      alert("Failed to clear error logs");
    }
  };

  exportBtn?.addEventListener("click", handleExportClick);
  clearBtn?.addEventListener("click", handleClearClick);

  return () => {
    if (exportBtn) {
      exportBtn.removeEventListener("click", handleExportClick);
      exportBtn = null;
    }

    if (clearBtn) {
      clearBtn.removeEventListener("click", handleClearClick);
      clearBtn = null;
    }
  };
}

/**
 * Format timestamp as readable string
 */
function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - timestamp;

  // Less than 1 hour: show relative time
  if (diff < 3600000) {
    const minutes = Math.floor(diff / 60000);
    return minutes === 0 ? "Just now" : `${minutes}m ago`;
  }

  // Less than 24 hours: show relative hours
  if (diff < 86400000) {
    const hours = Math.floor(diff / 3600000);
    return `${hours}h ago`;
  }

  // Otherwise: show date and time
  return date.toLocaleString();
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Add CSS styles
 */
function addStyles(): void {
  if (document.getElementById("error-logs-styles")) return;

  const style = document.createElement("style");
  style.id = "error-logs-styles";
  style.textContent = `
    .error-logs-viewer {
      padding: 20px;
      max-width: 800px;
    }

    .error-logs-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
    }

    .error-logs-header h3 {
      margin: 0;
      font-size: 18px;
      font-weight: 600;
    }

    .error-logs-actions {
      display: flex;
      gap: 10px;
    }

    .error-logs-stats {
      padding: 10px 15px;
      background: #f5f5f5;
      border-radius: 6px;
      margin-bottom: 20px;
      font-size: 14px;
    }

    .error-logs-stats p {
      margin: 0;
    }

    .error-logs-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .error-log-item {
      border: 1px solid #e0e0e0;
      border-radius: 6px;
      padding: 12px;
      background: #fff;
    }

    .error-log-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
      font-size: 12px;
      color: #666;
    }

    .error-log-time {
      font-weight: 500;
    }

    .error-log-context {
      background: #e3f2fd;
      padding: 2px 8px;
      border-radius: 4px;
      color: #1976d2;
      font-weight: 500;
    }

    .error-log-message {
      font-size: 14px;
      font-weight: 500;
      color: #d32f2f;
      margin-bottom: 8px;
    }

    .error-log-stack {
      margin-top: 8px;
      cursor: pointer;
    }

    .error-log-stack summary {
      font-size: 13px;
      color: #666;
      font-weight: 500;
    }

    .error-log-stack pre {
      margin-top: 8px;
      padding: 10px;
      background: #f5f5f5;
      border-radius: 4px;
      font-size: 12px;
      overflow-x: auto;
      max-height: 200px;
      overflow-y: auto;
    }

    .error-log-url {
      font-size: 12px;
      color: #666;
      margin-top: 4px;
      word-break: break-all;
    }

    .error-logs-empty,
    .error-logs-error {
      padding: 40px 20px;
      text-align: center;
      color: #666;
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
      padding: 8px 16px;
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
  `;

  document.head.appendChild(style);
}
