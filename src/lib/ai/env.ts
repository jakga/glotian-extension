/**
 * Shared helpers for accessing the Chrome AI global handle.
 *
 * Modern Chrome exposes AI APIs via dedicated globals (Translator, Writer,
 * etc.) and mirrors legacy handles through `chrome.ai`. The extension runs in
 * multiple contexts (background service worker, side panel, content scripts),
 * so these helpers normalize access to the shared handle without assuming a
 * particular environment.
 */

type UnknownRecord = Record<string, unknown>;

function resolveGlobalScope(): UnknownRecord {
  if (typeof globalThis !== "undefined") {
    return globalThis as unknown as UnknownRecord;
  }

  // Web workers use `self` instead of `window`
  if (typeof self !== "undefined") {
    return self as unknown as UnknownRecord;
  }

  if (typeof window !== "undefined") {
    return window as unknown as UnknownRecord;
  }

  return {};
}

function getModernGlobal(name: string): unknown {
  const scope = resolveGlobalScope();
  if (!(name in scope)) {
    return undefined;
  }

  const value = scope[name];
  return typeof value === "object" || typeof value === "function"
    ? value
    : undefined;
}

export function getModernAIGlobal<T = unknown>(name: string): T | undefined {
  return getModernGlobal(name) as T | undefined;
}

/**
 * Read the current AI handle if present.
 */
export function getAIHandle(): unknown {
  const scope = resolveGlobalScope();

  if (
    typeof scope.chrome !== "undefined" &&
    scope.chrome &&
    typeof (scope.chrome as UnknownRecord).ai !== "undefined"
  ) {
    return (scope.chrome as UnknownRecord).ai;
  }

  if (typeof scope.ai !== "undefined") {
    return scope.ai;
  }

  return undefined;
}

/**
 * Write the AI handle to the active global scope.
 */
export function setAIHandle(value: unknown): void {
  const scope = resolveGlobalScope();
  scope.ai = value;

  if (typeof scope.chrome !== "undefined" && scope.chrome) {
    try {
      (scope.chrome as UnknownRecord).ai = value;
    } catch (error) {
      console.warn(
        "[Glotian AI] Failed to assign AI handle to chrome.ai:",
        error,
      );
    }
  }
}

/**
 * Check whether an AI handle is already available.
 */
export function hasAIHandle(): boolean {
  return typeof getAIHandle() !== "undefined";
}
