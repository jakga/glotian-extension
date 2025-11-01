/**
 * Side panel entry script
 *
 * Manages tab navigation and state persistence
 */

import { getSetting, setSetting } from "@/lib/storage";
import { initTranslateTab, handleCapturedText } from "./tabs/translate";
import { initSummarizeTab } from "./tabs/summarize";
import {
  login as performLogin,
  logout as performLogout,
  isAuthenticated as checkAuthenticated,
} from "./components/auth";

console.log("[Glotian Side Panel] Initializing...");

// Authentication UI elements
const authSection = document.getElementById("auth-section");
const loginForm = document.getElementById(
  "login-form",
) as HTMLFormElement | null;
const loginEmailInput = document.getElementById(
  "login-email",
) as HTMLInputElement | null;
const loginPasswordInput = document.getElementById(
  "login-password",
) as HTMLInputElement | null;
const loginButton = document.getElementById(
  "login-submit",
) as HTMLButtonElement | null;
const loginError = document.getElementById("login-error");
const loginToggleBtn = document.getElementById(
  "header-login-btn",
) as HTMLButtonElement | null;
const logoutBtn = document.getElementById(
  "header-logout-btn",
) as HTMLButtonElement | null;

// Tab navigation with lazy loading
const tabs = document.querySelectorAll(".tab");
const tabContents = document.querySelectorAll(".tab-content");

// Track which tabs have been initialized to enable lazy loading
const initializedTabs = new Set<string>();

/**
 * Switch to a specific tab
 * Task: T182 - Keyboard navigation helper
 */
async function switchToTab(tabElement: Element): Promise<void> {
  const tabName = tabElement.getAttribute("data-tab");
  if (!tabName) return;

  // Cleanup listeners on previously active tab before switching
  const previousActiveTab = Array.from(tabs).find((t) =>
    t.classList.contains("active"),
  );

  // Update active states
  tabs.forEach((t) => {
    t.classList.remove("active");
    t.setAttribute("aria-selected", "false");
  });
  tabContents.forEach((c) => {
    c.classList.remove("active");
    c.setAttribute("hidden", "");
    c.classList.add("hidden");
  });

  tabElement.classList.add("active");
  tabElement.setAttribute("aria-selected", "true");
  const content = document.getElementById(`tab-${tabName}`);
  if (content) {
    content.classList.add("active");
    content.classList.remove("hidden");
    content.removeAttribute("hidden");
  }

  // Focus the tab button for keyboard navigation
  (tabElement as HTMLElement).focus();

  // Save last tab preference
  await setSetting("sidePanelLastTab", tabName as any);

  // Lazy-load tab initialization
  if (tabName === "translate") {
    // Translate tab is always eager-loaded on page load
    if (!initializedTabs.has("translate")) {
      await initTranslateTab();
      initializedTabs.add("translate");
    }
  } else if (tabName === "summarize") {
    if (!initializedTabs.has("summarize")) {
      const summarizeTabContent = document.getElementById("tab-summarize");
      if (summarizeTabContent instanceof HTMLElement) {
        await initSummarizeTab(summarizeTabContent);
        initializedTabs.add("summarize");
      } else {
        console.warn(
          "[Glotian Side Panel] Summarize tab container not found during init",
        );
      }
    }
  }

  console.log("[Glotian Side Panel] Switched to tab:", tabName);
}

// Click handlers
tabs.forEach((tab) => {
  tab.addEventListener("click", async () => {
    await switchToTab(tab);
  });
});

// Keyboard navigation (Task: T182)
// Arrow keys for tab navigation, Escape to close settings
tabs.forEach((tab, index) => {
  tab.addEventListener("keydown", async (event: Event) => {
    const keyEvent = event as KeyboardEvent;
    const tabsArray = Array.from(tabs);

    switch (keyEvent.key) {
      case "ArrowLeft":
      case "ArrowUp":
        keyEvent.preventDefault();
        // Move to previous tab (with wrapping)
        const prevIndex = index === 0 ? tabsArray.length - 1 : index - 1;
        const prevTab = tabsArray[prevIndex];
        if (prevTab) await switchToTab(prevTab);
        break;

      case "ArrowRight":
      case "ArrowDown":
        keyEvent.preventDefault();
        // Move to next tab (with wrapping)
        const nextIndex = index === tabsArray.length - 1 ? 0 : index + 1;
        const nextTab = tabsArray[nextIndex];
        if (nextTab) await switchToTab(nextTab);
        break;

      case "Home":
        keyEvent.preventDefault();
        // Move to first tab
        const firstTab = tabsArray[0];
        if (firstTab) await switchToTab(firstTab);
        break;

      case "End":
        keyEvent.preventDefault();
        // Move to last tab
        const lastTab = tabsArray[tabsArray.length - 1];
        if (lastTab) await switchToTab(lastTab);
        break;
    }
  });
});

// Restore last active tab
async function restoreLastTab(): Promise<void> {
  const lastTab = await getSetting("sidePanelLastTab");
  if (lastTab) {
    const tabButton = document.querySelector(`[data-tab="${lastTab}"]`);
    if (tabButton) {
      (tabButton as HTMLElement).click();
      return;
    }
  }

  const defaultTab = document.querySelector('[data-tab="translate"]');
  if (defaultTab) {
    (defaultTab as HTMLElement).click();
  }
}

async function setAuthState(authenticated: boolean): Promise<void> {
  if (authSection) {
    authSection.classList.toggle("hidden", authenticated);
  }

  if (loginToggleBtn) {
    loginToggleBtn.classList.toggle("hidden", authenticated);
  }

  if (logoutBtn) {
    logoutBtn.classList.toggle("hidden", !authenticated);
    logoutBtn.disabled = false;
    logoutBtn.textContent = "Log Out";
  }

  if (loginError) {
    loginError.textContent = "";
    loginError.classList.add("hidden");
  }

  if (authenticated) {
    loginForm?.reset();
  }
}

// Login form handler
if (loginForm) {
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!loginEmailInput || !loginPasswordInput || !loginButton) {
      console.warn("[Glotian Side Panel] Login form missing elements");
      return;
    }

    const email = loginEmailInput.value.trim();
    const password = loginPasswordInput.value;

    if (!email || !password) {
      if (loginError) {
        loginError.textContent = "Email and password are required.";
        loginError.classList.remove("hidden");
      }
      return;
    }

    if (loginError) {
      loginError.classList.add("hidden");
      loginError.textContent = "";
    }

    loginButton.disabled = true;
    loginButton.textContent = "Logging in...";

    try {
      const result = await performLogin(email, password);
      if (!result.success) {
        throw new Error(result.error || "Unable to log in. Please try again.");
      }

      await setAuthState(true);
    } catch (error) {
      console.error("[Glotian Side Panel] Login failed:", error);
      if (loginError) {
        loginError.textContent = (error as Error).message;
        loginError.classList.remove("hidden");
      }
    } finally {
      loginButton.disabled = false;
      loginButton.textContent = "Log In";
    }
  });
}

// Toggle login card visibility
if (loginToggleBtn) {
  loginToggleBtn.addEventListener("click", () => {
    if (!authSection) return;
    const showLogin = authSection.classList.contains("hidden");
    authSection.classList.toggle("hidden", !showLogin);
    if (showLogin) {
      if (loginError) {
        loginError.classList.add("hidden");
        loginError.textContent = "";
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
      loginEmailInput?.focus();
    }
  });
}

// Logout handler
if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    logoutBtn.disabled = true;
    logoutBtn.textContent = "Logging out...";

    try {
      const result = await performLogout();
      if (!result.success) {
        throw new Error(result.error || "Unable to log out. Please try again.");
      }

      await setAuthState(false);
    } catch (error) {
      console.error("[Glotian Side Panel] Logout failed:", error);
      if (loginError) {
        loginError.textContent = (error as Error).message;
        loginError.classList.remove("hidden");
      }
      if (authSection) {
        authSection.classList.remove("hidden");
      }
    } finally {
      logoutBtn.disabled = false;
      logoutBtn.textContent = "Log Out";
    }
  });
}

// Settings button handler (moved to header)
const settingsBtn = document.getElementById("header-settings-btn");
if (settingsBtn) {
  settingsBtn.addEventListener("click", () => {
    console.log("[Glotian Side Panel] Settings clicked");
    // TODO: Implement settings modal in Phase 9
    alert("Settings coming in Phase 9");
  });
}

// Listen to messages from background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("[Glotian Side Panel] Received message:", message.type);

  if (message.type === "SYNC_COMPLETE") {
    console.log("[Glotian Side Panel] Sync complete:", message.stats);
  } else if (message.type === "CAPTURED_TEXT_READY") {
    // Task: T040 - Handle captured text from content script
    console.log(
      "[Glotian Side Panel] Received captured text:",
      message.text.substring(0, 50),
    );
    handleCapturedText(message.text, message.pageUrl, message.pageTitle).catch(
      (error) =>
        console.error(
          "[Glotian Side Panel] Error handling captured text:",
          error,
        ),
    );
  } else if (message.type === "SWITCH_TO_TAB") {
    // Switch to specific tab (e.g., from keyboard shortcut)
    const tabButton = document.querySelector(`[data-tab="${message.tab}"]`);
    if (tabButton) {
      switchToTab(tabButton).catch((error) =>
        console.error("[Glotian Side Panel] Error switching to tab:", error),
      );
    }
  } else if (message.type === "TRANSLATE_REQUEST") {
    // Handle translation request from background (Chrome AI only works in side panel)
    console.log(
      "[Glotian Side Panel] Received translation request from background",
    );
    import("@/lib/ai/translate")
      .then(({ translate }) => translate(message.request))
      .then((result) => {
        console.log(
          "[Glotian Side Panel] Translation completed, sending response",
        );
        sendResponse({ success: true, result });
      })
      .catch((error) => {
        console.error("[Glotian Side Panel] Translation error:", error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // Keep message channel open for async response
  }

  sendResponse({ success: true });
  return false;
});

// Initialize
(async () => {
  const authenticated = await checkAuthenticated();
  await setAuthState(authenticated);

  // Initialize translate tab (always eager-loaded as default tab)
  await initTranslateTab();
  initializedTabs.add("translate");

  // Restore last active tab (will lazy-load if not translate)
  await restoreLastTab();

  // Note: Q&A, Media, Summarize, and Activity tabs are now lazy-loaded when first accessed
  // This reduces initial memory footprint and speeds up side panel load time

  console.log("[Glotian Side Panel] Initialized (lazy loading enabled)");
})();
