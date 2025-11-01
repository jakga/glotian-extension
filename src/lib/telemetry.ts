/**
 * Telemetry and error monitoring with Sentry integration
 *
 * Task: T187
 * Optional Sentry integration for error tracking (opt-in)
 */

import { getSetting, onSettingsChanged } from "./storage";
import { logError as logErrorLocal } from "./logger";

let sentryEnabled = false;
let sentryInitialized = false;
let settingsChangeUnsubscribe: (() => void) | null = null;

ensureTelemetryPreferenceListener();

/**
 * Ensure telemetry reacts to runtime setting changes
 */
function ensureTelemetryPreferenceListener(): void {
  if (settingsChangeUnsubscribe) {
    return;
  }

  try {
    settingsChangeUnsubscribe = onSettingsChanged((changes) => {
      if (!Object.prototype.hasOwnProperty.call(changes, "telemetryEnabled")) {
        return;
      }

      const change = changes.telemetryEnabled;
      const enabled = Boolean(change?.newValue);

      if (enabled) {
        if (!sentryEnabled || !sentryInitialized) {
          void initTelemetry();
        }
      } else {
        void shutdownTelemetry();
      }
    });
  } catch (error) {
    console.error(
      "[Glotian Telemetry] Failed to register telemetry preference listener:",
      error,
    );
  }
}

/**
 * Initialize Sentry (if enabled and DSN available)
 */
export async function initTelemetry(): Promise<void> {
  try {
    ensureTelemetryPreferenceListener();

    if (sentryEnabled && sentryInitialized) {
      console.log("[Glotian Telemetry] Sentry already initialized");
      return;
    }

    const telemetryOptIn = await getSetting("telemetryEnabled");

    if (!telemetryOptIn) {
      console.log("[Glotian Telemetry] Telemetry disabled by user preference");
      await shutdownTelemetry();
      return;
    }

    const sentryDSN = import.meta.env.VITE_SENTRY_DSN;

    if (!sentryDSN) {
      console.log(
        "[Glotian Telemetry] Sentry DSN not configured, using local logging only",
      );
      await shutdownTelemetry();
      return;
    }

    // Dynamically import Sentry to reduce bundle size when not needed
    // Note: Sentry is optional and not included in package.json by default
    // Install with: pnpm add @sentry/browser
    // TODO: Uncomment when @sentry/browser is installed
    console.log(
      "[Glotian Telemetry] Sentry integration not yet implemented (install @sentry/browser first)",
    );

    /*
    const Sentry = await import("@sentry/browser");

    Sentry.init({
      dsn: sentryDSN,
      environment: import.meta.env.VITE_APP_ENV || "production",
      release: chrome.runtime.getManifest().version,
      integrations: [
        Sentry.browserTracingIntegration(),
      ],
      tracesSampleRate: 0.1, // Low sample rate to reduce quota usage
      beforeSend(event: any, hint: any) {
        // Filter out sensitive data
        if (event.request?.cookies) {
          delete event.request.cookies;
        }
        if (event.request?.headers) {
          delete event.request.headers;
        }

        return event;
      },
    });

    sentryEnabled = true;
    sentryInitialized = true;

    console.log("[Glotian Telemetry] Sentry initialized successfully");
    */
  } catch (error) {
    console.error("[Glotian Telemetry] Failed to initialize Sentry:", error);
    sentryEnabled = false;
  }
}

/**
 * Shut down Sentry when telemetry is toggled off
 */
export async function shutdownTelemetry(): Promise<void> {
  if (!sentryEnabled && !sentryInitialized) {
    return;
  }

  try {
    console.log("[Glotian Telemetry] Shutting down telemetry");

    // TODO: Uncomment when @sentry/browser is installed
    /*
    const Sentry = await import("@sentry/browser");

    await Sentry.close(2000);
    Sentry.getCurrentHub().getScope()?.clear();
    Sentry.getCurrentHub().bindClient(null);
    */
  } catch (error) {
    console.error("[Glotian Telemetry] Failed to shut down Sentry:", error);
  } finally {
    sentryEnabled = false;
    sentryInitialized = false;
  }
}

/**
 * Log an error (to Sentry if enabled, otherwise local storage)
 */
export async function captureError(
  error: Error | string,
  context?: string,
  extras?: Record<string, any>,
): Promise<void> {
  // Always log locally
  await logErrorLocal(error, context);

  if (!sentryEnabled || !sentryInitialized) {
    return;
  }

  // Send to Sentry if enabled
  // TODO: Uncomment when @sentry/browser is installed
  /*
  if (sentryEnabled && sentryInitialized) {
    try {
      const Sentry = await import("@sentry/browser");

      if (typeof error === "string") {
        Sentry.captureMessage(error, {
          level: "error",
          tags: { context },
          extra: extras,
        });
      } else {
        Sentry.captureException(error, {
          tags: { context },
          extra: extras,
        });
      }
    } catch (sentryError) {
      console.error("[Glotian Telemetry] Failed to send error to Sentry:", sentryError);
    }
  }
  */
}

/**
 * Hash email using SHA-256 for privacy
 * This ensures we can track user behavior without storing PII in telemetry
 */
async function hashEmail(email: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(email.toLowerCase());
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Set user context for error tracking (without sending raw email/PII)
 */
export async function setUserContext(
  userId: string,
  email?: string,
): Promise<void> {
  if (!sentryEnabled || !sentryInitialized) {
    console.log(
      "[Glotian Telemetry] setUserContext skipped (telemetry disabled)",
    );
    return;
  }

  // TODO: Uncomment when @sentry/browser is installed
  /*
  if (sentryEnabled && sentryInitialized) {
    try {
      const Sentry = await import("@sentry/browser");

      // Only hash and include email if it exists and user consents to telemetry
      // NOTE: This requires telemetry opt-in consent from user
      const userContext: Record<string, string | undefined> = {
        id: userId,
      };

      if (email && sentryEnabled) {
        // Hash the email before sending to Sentry (GDPR/CCPA compliance)
        try {
          const emailHash = await hashEmail(email);
          userContext.email_hash = emailHash;
        } catch (hashError) {
          console.warn("[Glotian Telemetry] Failed to hash email:", hashError);
          // Continue without email hash rather than failing
        }
      }

      Sentry.setUser(userContext);

      console.log("[Glotian Telemetry] User context set (email hashed for privacy)");
    } catch (error) {
      console.error("[Glotian Telemetry] Failed to set user context:", error);
    }
  }
  */
  console.log(
    "[Glotian Telemetry] setUserContext called (Sentry not installed)",
  );
}

/**
 * Clear user context (on logout)
 */
export async function clearUserContext(): Promise<void> {
  if (!sentryEnabled || !sentryInitialized) {
    console.log(
      "[Glotian Telemetry] clearUserContext skipped (telemetry disabled)",
    );
    return;
  }

  // TODO: Uncomment when @sentry/browser is installed
  /*
  if (sentryEnabled && sentryInitialized) {
    try {
      const Sentry = await import("@sentry/browser");

      Sentry.setUser(null);

      console.log("[Glotian Telemetry] User context cleared");
    } catch (error) {
      console.error("[Glotian Telemetry] Failed to clear user context:", error);
    }
  }
  */
  console.log(
    "[Glotian Telemetry] clearUserContext called (Sentry not installed)",
  );
}

/**
 * Track custom event (for analytics)
 */
export async function trackEvent(
  eventName: string,
  properties?: Record<string, any>,
): Promise<void> {
  if (!sentryEnabled || !sentryInitialized) {
    console.log(
      `[Glotian Telemetry] trackEvent skipped (telemetry disabled): ${eventName}`,
    );
    return;
  }

  const telemetryOptIn = await getSetting("telemetryEnabled");

  if (!telemetryOptIn) {
    await shutdownTelemetry();
    return;
  }

  // TODO: Uncomment when @sentry/browser is installed
  /*
  if (sentryEnabled && sentryInitialized) {
    try {
      const Sentry = await import("@sentry/browser");

      Sentry.addBreadcrumb({
        category: "custom-event",
        message: eventName,
        level: "info",
        data: properties,
      });

      console.log(`[Glotian Telemetry] Event tracked: ${eventName}`, properties);
    } catch (error) {
      console.error("[Glotian Telemetry] Failed to track event:", error);
    }
  }
  */
  console.log(
    `[Glotian Telemetry] trackEvent called: ${eventName} (Sentry not installed)`,
  );
}

/**
 * Check if telemetry is enabled
 */
export function isTelemetryEnabled(): boolean {
  return sentryEnabled && sentryInitialized;
}
