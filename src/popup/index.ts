/**
 * Action popup script
 *
 * Displays quick actions and keyboard shortcuts
 */

console.log("[Glotian Popup] Initializing...");

// Open side panel button
const openSidePanelBtn = document.getElementById("open-side-panel");
if (openSidePanelBtn) {
  openSidePanelBtn.addEventListener("click", async () => {
    try {
      // Opening the side panel must occur in direct response to the click.
      const [activeTab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      if (activeTab?.id) {
        await chrome.sidePanel.open({ tabId: activeTab.id });
      } else {
        const currentWindow = await chrome.windows.getCurrent();
        if (typeof currentWindow.id === "number") {
          await chrome.sidePanel.open({ windowId: currentWindow.id });
        }
      }

      // Notify background to persist UI state
      await chrome.runtime.sendMessage({
        type: "OPEN_SIDE_PANEL",
        openedBySender: true,
      });

      window.close(); // Close popup after opening side panel
    } catch (error) {
      console.error("[Glotian Popup] Error opening side panel:", error);
    }
  });
}

// Settings button - open side panel (settings functionality will be in side panel)
const settingsBtn = document.getElementById("settings");
if (settingsBtn) {
  settingsBtn.addEventListener("click", async () => {
    try {
      console.log("[Glotian Popup] Settings clicked");

      const [activeTab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      if (activeTab?.id) {
        await chrome.sidePanel.open({ tabId: activeTab.id });
      } else {
        const currentWindow = await chrome.windows.getCurrent();
        if (typeof currentWindow.id === "number") {
          await chrome.sidePanel.open({ windowId: currentWindow.id });
        }
      }

      // Notify background to persist UI state
      await chrome.runtime.sendMessage({
        type: "OPEN_SIDE_PANEL",
        openedBySender: true,
      });

      window.close();
    } catch (error) {
      console.error("[Glotian Popup] Error opening settings:", error);
    }
  });
}

console.log("[Glotian Popup] Initialized");
