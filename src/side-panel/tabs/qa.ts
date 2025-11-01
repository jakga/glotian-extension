/**
 * Q&A tab component
 *
 * Provides page-based Q&A with chat interface, source quotes, and follow-up suggestions
 */

import type { QAResponse } from "@/types";
import {
  createSession,
  getSession,
  updateSessionContext,
  askQuestion,
  clearHistory,
  type QASessionMessage,
} from "@/lib/ai/qa-session";

// Tab state
let currentSessionId: string | null = null;
let currentPageUrl: string | null = null;
let currentPageTitle: string | null = null;
let currentPageContent: string | null = null;
let isProcessing = false;
let isExtractingContent = false;

// Store listener references for cleanup to prevent memory leaks
let onActivatedListener: (() => void) | null = null;
let onUpdatedListener:
  | ((tabId: number, changeInfo: chrome.tabs.TabChangeInfo) => void)
  | null = null;

/**
 * Initialize Q&A tab
 */
export async function initQATab(container: HTMLElement): Promise<void> {
  console.log("[Glotian Q&A Tab] Initializing");

  renderQATab(container);
  attachEventListeners(container);

  // Auto-detect active tab and extract page content
  await detectActiveTabAndExtractContent(container);

  // Store listener references for cleanup to prevent memory leaks
  onActivatedListener = () => {
    detectActiveTabAndExtractContent(container);
  };

  onUpdatedListener = (
    tabId: number,
    changeInfo: chrome.tabs.TabChangeInfo,
  ) => {
    if (changeInfo.status === "complete") {
      detectActiveTabAndExtractContent(container);
    }
  };

  // Listen for tab switches
  chrome.tabs.onActivated.addListener(onActivatedListener);

  // Listen for tab updates (page navigation)
  chrome.tabs.onUpdated.addListener(onUpdatedListener);
}

/**
 * Clean up Q&A tab listeners to prevent memory leaks
 */
export function cleanupQATab(): void {
  if (onActivatedListener) {
    chrome.tabs.onActivated.removeListener(onActivatedListener);
    onActivatedListener = null;
  }

  if (onUpdatedListener) {
    chrome.tabs.onUpdated.removeListener(onUpdatedListener);
    onUpdatedListener = null;
  }

  console.log("[Glotian Q&A Tab] Cleaned up listeners");
}

/**
 * Render Q&A tab HTML
 */
function renderQATab(container: HTMLElement): void {
  container.innerHTML = `
    <div class="qa-tab">
      <!-- Page Context Header -->
      <div id="page-context" class="page-context">
        <div class="context-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
        </div>
        <div class="context-info">
          <p id="context-title" class="context-title">Loading page context...</p>
          <p id="context-url" class="context-url"></p>
          <p id="context-stats" class="context-stats"></p>
        </div>
        <button id="refresh-context-button" class="icon-button" title="Refresh context">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="23 4 23 10 17 10"/>
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
          </svg>
        </button>
      </div>

      <!-- Chat Container -->
      <div id="chat-container" class="chat-container">
        <!-- Messages will be inserted here -->
      </div>

      <!-- Empty State -->
      <div id="empty-state" class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          <path d="M9 10h6M9 14h4"/>
        </svg>
        <p>Ask questions about this page</p>
        <p class="hint">I'll answer based on the page content and provide relevant quotes.</p>
      </div>

      <!-- Processing Indicator -->
      <div id="processing-section" class="processing-section hidden">
        <div class="processing-spinner"></div>
        <p id="processing-text">Thinking...</p>
      </div>

      <!-- Error Display -->
      <div id="error-section" class="error-section hidden">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <p id="error-text"></p>
        <button id="retry-button" class="secondary-button">Retry</button>
      </div>

      <!-- Question Input -->
      <div class="question-input-container">
        <div class="action-buttons">
          <button id="clear-history-button" class="icon-button" title="Clear chat history">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        </div>

        <div class="input-wrapper">
          <textarea
            id="question-input"
            placeholder="Ask a question about this page..."
            rows="1"
            maxlength="500"
          ></textarea>
          <button id="send-button" class="send-button" disabled>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="22" y1="2" x2="11" y2="13"/>
              <polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </div>

        <p class="char-count">
          <span id="char-count">0</span>/500
        </p>
      </div>
    </div>
  `;
}

/**
 * Attach event listeners
 */
function attachEventListeners(container: HTMLElement): void {
  const questionInput =
    container.querySelector<HTMLTextAreaElement>("#question-input");
  const sendButton = container.querySelector<HTMLButtonElement>("#send-button");
  const clearHistoryButton = container.querySelector<HTMLButtonElement>(
    "#clear-history-button",
  );
  const refreshContextButton = container.querySelector<HTMLButtonElement>(
    "#refresh-context-button",
  );
  const retryButton =
    container.querySelector<HTMLButtonElement>("#retry-button");
  const charCount = container.querySelector<HTMLSpanElement>("#char-count");

  if (!questionInput || !sendButton) return;

  // Auto-resize textarea
  questionInput.addEventListener("input", () => {
    questionInput.style.height = "auto";
    questionInput.style.height = `${Math.min(questionInput.scrollHeight, 120)}px`;

    // Update character count
    if (charCount) {
      charCount.textContent = questionInput.value.length.toString();
    }

    // Enable/disable send button
    sendButton.disabled =
      questionInput.value.trim().length < 5 ||
      questionInput.value.length > 500 ||
      isProcessing;
  });

  // Send question on Enter (Shift+Enter for new line)
  questionInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!sendButton.disabled) {
        sendQuestion(container, questionInput.value.trim());
      }
    }
  });

  // Send button click
  sendButton?.addEventListener("click", () => {
    if (!sendButton.disabled) {
      sendQuestion(container, questionInput.value.trim());
    }
  });

  // Clear history button
  clearHistoryButton?.addEventListener("click", () => {
    handleClearHistory(container);
  });

  // Refresh context button
  refreshContextButton?.addEventListener("click", () => {
    detectActiveTabAndExtractContent(container);
  });

  // Retry button
  retryButton?.addEventListener("click", () => {
    // Retry last question (get from last user message)
    const session = currentSessionId ? getSession(currentSessionId) : null;
    if (session && session.messages.length > 0) {
      const lastUserMessage = session.messages
        .slice()
        .reverse()
        .find((m) => m.role === "user");
      if (lastUserMessage) {
        sendQuestion(container, lastUserMessage.content);
      }
    }
  });
}

/**
 * Detect active tab and extract page content
 */
async function detectActiveTabAndExtractContent(
  container: HTMLElement,
): Promise<void> {
  if (isExtractingContent) return;

  isExtractingContent = true;

  try {
    // Get active tab
    const [activeTab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (!activeTab || !activeTab.id || !activeTab.url) {
      showError(container, "No active tab found");
      updatePageContext(container, null, null, null);
      return;
    }

    // Check if this is the same page
    if (
      activeTab.url === currentPageUrl &&
      currentPageContent &&
      currentSessionId
    ) {
      // Same page, don't re-extract
      isExtractingContent = false;
      return;
    }

    // Show loading state
    const contextTitle = container.querySelector<HTMLElement>("#context-title");
    if (contextTitle) {
      contextTitle.textContent = "Loading page context...";
    }

    // Extract page content using content script
    if (!activeTab.id) {
      throw new Error("Active tab ID not available");
    }

    const results = await chrome.scripting.executeScript({
      target: { tabId: activeTab.id },
      func: extractPageContent,
    });

    if (!results || results.length === 0 || !results[0] || !results[0].result) {
      throw new Error("Failed to extract page content");
    }

    const pageContent = results[0].result as string;

    // Validate page content
    if (!pageContent || pageContent.trim().length < 100) {
      showError(
        container,
        "No content available for Q&A. Please navigate to a page with text content.",
      );
      updatePageContext(container, null, null, null);
      return;
    }

    // Handle pages > 10k characters (summarize first)
    let content = pageContent;
    if (pageContent.length > 10000) {
      console.warn(
        `[Q&A Tab] Page content exceeds 10k chars (${pageContent.length}), truncating...`,
      );
      content = pageContent.substring(0, 10000) + "...";
    }

    // Update or create session
    if (currentSessionId) {
      // Update existing session with new page context
      updateSessionContext(
        currentSessionId,
        activeTab.url,
        activeTab.title || "Untitled",
        content,
        true, // Clear history on page change
      );
    } else {
      // Create new session
      currentSessionId = createSession(
        activeTab.url,
        activeTab.title || "Untitled",
        content,
      );
    }

    currentPageUrl = activeTab.url;
    currentPageTitle = activeTab.title || "Untitled";
    currentPageContent = content;

    // Update UI
    updatePageContext(
      container,
      activeTab.url,
      activeTab.title || "Untitled",
      content.length,
    );
    hideError(container);
    renderMessages(container);
  } catch (error) {
    console.error("[Q&A Tab] Error extracting page content:", error);
    showError(
      container,
      "Failed to extract page content. Please try refreshing the page.",
    );
    updatePageContext(container, null, null, null);
  } finally {
    isExtractingContent = false;
  }
}

/**
 * Extract page content (runs in content script context)
 */
function extractPageContent(): string {
  // Use the same extraction logic as page-extract.ts
  // For simplicity, extract main content from body
  const article = document.querySelector("article");
  const main = document.querySelector("main");
  const contentArea = article || main || document.body;

  // Remove script, style, and nav elements
  const clone = contentArea.cloneNode(true) as HTMLElement;
  const elementsToRemove = clone.querySelectorAll(
    "script, style, nav, header, footer, aside, .sidebar, .ad, .advertisement",
  );
  elementsToRemove.forEach((el) => el.remove());

  // Get text content
  return clone.innerText.trim();
}

/**
 * Update page context display
 */
function updatePageContext(
  container: HTMLElement,
  url: string | null,
  title: string | null,
  contentLength: number | null,
): void {
  const contextTitle = container.querySelector<HTMLElement>("#context-title");
  const contextUrl = container.querySelector<HTMLElement>("#context-url");
  const contextStats = container.querySelector<HTMLElement>("#context-stats");

  if (contextTitle && contextUrl && contextStats) {
    if (url && title && contentLength !== null) {
      contextTitle.textContent = title;
      try {
        contextUrl.textContent = new URL(url).hostname;
      } catch {
        contextUrl.textContent = url;
      }
      contextStats.textContent = `${contentLength.toLocaleString()} characters`;
    } else {
      contextTitle.textContent = "No page context";
      contextUrl.textContent = "";
      contextStats.textContent = "";
    }
  }
}

/**
 * Send a question
 */
async function sendQuestion(
  container: HTMLElement,
  question: string,
): Promise<void> {
  if (!question || question.length < 5 || question.length > 500) {
    showError(container, "Question must be between 5 and 500 characters");
    return;
  }

  if (!currentSessionId) {
    showError(
      container,
      "No page context available. Please navigate to a page first.",
    );
    return;
  }

  if (isProcessing) return;

  isProcessing = true;

  // Clear input
  const questionInput =
    container.querySelector<HTMLTextAreaElement>("#question-input");
  if (questionInput) {
    questionInput.value = "";
    questionInput.style.height = "auto";
  }

  // Update send button state
  const sendButton = container.querySelector<HTMLButtonElement>("#send-button");
  if (sendButton) {
    sendButton.disabled = true;
  }

  // Hide empty state, show processing
  hideEmptyState(container);
  hideError(container);
  showProcessing(container, "Thinking...");

  // Add user message to chat immediately
  addMessageToChat(container, {
    role: "user",
    content: question,
    timestamp: Date.now(),
  });

  try {
    // Set timeout for Q&A (25 seconds)
    const timeoutMs = 25000;
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new Error(`Q&A timeout (${timeoutMs / 1000}s)`)),
        timeoutMs,
      );
    });

    // Ask question with timeout
    const response: QAResponse = await Promise.race([
      askQuestion(currentSessionId, question),
      timeoutPromise,
    ]);

    // Add assistant answer to chat
    addMessageToChat(container, {
      role: "assistant",
      content: response.answer,
      timestamp: Date.now(),
      sources: response.sources,
    });

    // Display follow-up questions
    if (response.followUpQuestions && response.followUpQuestions.length > 0) {
      displayFollowUpQuestions(container, response.followUpQuestions);
    }

    hideProcessing(container);
  } catch (error: any) {
    console.error("[Q&A Tab] Error asking question:", error);

    // Check for specific error types
    let errorMessage = "Failed to get answer. Please try again.";

    if (error.message.includes("timeout")) {
      errorMessage =
        "Q&A timeout (25s). The page content might be too complex. Try asking a simpler question.";
    } else if (error.message.includes("No answer found")) {
      errorMessage =
        "I couldn't find that information on this page. Try reformulating your question.";
    } else if (error.message.includes("not configured")) {
      errorMessage =
        "AI service not configured. Please check your API keys in settings.";
    }

    showError(container, errorMessage);
    hideProcessing(container);
  } finally {
    isProcessing = false;

    // Re-enable send button if input has valid content (5-500 chars)
    if (sendButton && questionInput) {
      const len = questionInput.value.trim().length;
      sendButton.disabled = len < 5 || len > 500;
    }
  }
}

/**
 * Add message to chat
 */
function addMessageToChat(
  container: HTMLElement,
  message: QASessionMessage,
): void {
  const chatContainer = container.querySelector("#chat-container");
  const emptyState = container.querySelector("#empty-state");

  if (!chatContainer) return;

  // Hide empty state
  if (emptyState) {
    emptyState.classList.add("hidden");
  }

  const messageEl = document.createElement("div");
  messageEl.className = `chat-message ${message.role}-message`;

  if (message.role === "user") {
    messageEl.innerHTML = `
      <div class="message-content">
        <p>${escapeHtml(message.content)}</p>
      </div>
    `;
  } else {
    // Assistant message with sources
    let sourcesHtml = "";
    if (message.sources && message.sources.length > 0) {
      sourcesHtml = `
        <div class="sources">
          <p class="sources-label">Sources:</p>
          ${message.sources
            .map(
              (source, index) => `
            <div class="source-quote" data-position="${source.position?.start || ""}-${source.position?.end || ""}">
              <span class="source-number">${index + 1}</span>
              <p class="quote-text">"${escapeHtml(source.quote)}"</p>
              <span class="relevance-badge">${Math.round(source.relevance * 100)}% relevant</span>
            </div>
          `,
            )
            .join("")}
        </div>
      `;
    }

    messageEl.innerHTML = `
      <div class="message-content">
        <p>${escapeHtml(message.content)}</p>
        ${sourcesHtml}
      </div>
    `;

    // Add click listeners to source quotes to highlight in page
    const sourceQuotes = messageEl.querySelectorAll(".source-quote");
    sourceQuotes.forEach((quoteEl) => {
      quoteEl.addEventListener("click", () => {
        const position = quoteEl.getAttribute("data-position");
        if (position && position.includes("-")) {
          const parts = position.split("-");
          const start = Number(parts[0]);
          const end = Number(parts[1]);
          if (!isNaN(start) && !isNaN(end)) {
            highlightQuoteInPage(start, end);
          }
        }
      });
    });
  }

  chatContainer.appendChild(messageEl);

  // Scroll to bottom
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

/**
 * Display follow-up questions
 */
function displayFollowUpQuestions(
  container: HTMLElement,
  questions: string[],
): void {
  const chatContainer = container.querySelector("#chat-container");
  if (!chatContainer) return;

  const followUpEl = document.createElement("div");
  followUpEl.className = "follow-up-questions";
  followUpEl.innerHTML = `
    <p class="follow-up-label">Follow-up questions:</p>
    ${questions
      .map(
        (q) => `
      <button class="follow-up-button">${escapeHtml(q)}</button>
    `,
      )
      .join("")}
  `;

  // Add click listeners
  const buttons = followUpEl.querySelectorAll(".follow-up-button");
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const question = btn.textContent?.trim();
      if (question) {
        sendQuestion(container, question);
      }
    });
  });

  chatContainer.appendChild(followUpEl);
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

/**
 * Highlight quote in page (send message to content script)
 */
async function highlightQuoteInPage(start: number, end: number): Promise<void> {
  try {
    const [activeTab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (!activeTab || !activeTab.id) return;

    await chrome.scripting.executeScript({
      target: { tabId: activeTab.id },
      func: highlightText,
      args: [start, end],
    });
  } catch (error) {
    console.error("[Q&A Tab] Error highlighting quote:", error);
  }
}

/**
 * Highlight text in page (runs in content script context)
 * Uses robust DOM text node traversal instead of brittle window.find
 */
function highlightText(start: number, end: number): void {
  try {
    // Remove existing highlights
    const existingHighlights = document.querySelectorAll(".glotian-highlight");
    existingHighlights.forEach((el) => {
      const parent = el.parentNode;
      if (parent && el.textContent) {
        parent.replaceChild(document.createTextNode(el.textContent), el);
      }
    });

    // Walk text nodes and find the target range
    const textNodeMap: Array<{ node: Text; start: number; end: number }> = [];
    let charCount = 0;

    function walkTextNodes(node: Node): void {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node as Text;
        const nodeStart = charCount;
        const nodeEnd = charCount + text.length;
        textNodeMap.push({ node: text, start: nodeStart, end: nodeEnd });
        charCount = nodeEnd;
      } else {
        node.childNodes.forEach(walkTextNodes);
      }
    }

    walkTextNodes(document.body);

    // Find text nodes that overlap with the target range
    const overlappingNodes = textNodeMap.filter(
      (item) => item.start < end && item.end > start,
    );

    if (overlappingNodes.length === 0) {
      console.warn(
        "[Glotian Q&A] Could not find text nodes for range:",
        start,
        "-",
        end,
      );
      return;
    }

    try {
      // Create a range spanning the overlapping nodes
      const range = document.createRange();
      const firstNode = overlappingNodes[0];
      const lastNode = overlappingNodes[overlappingNodes.length - 1];

      if (!firstNode || !lastNode) {
        console.warn("[Glotian Q&A] Unable to get first or last node");
        return;
      }

      // Calculate offsets within the text nodes
      const startOffset = Math.max(0, start - firstNode.start);
      const endOffset = Math.min(lastNode.node.length, end - lastNode.start);

      range.setStart(firstNode.node, startOffset);
      range.setEnd(lastNode.node, endOffset);

      // Create span and wrap content
      const span = document.createElement("span");
      span.className = "glotian-highlight";
      span.style.backgroundColor = "yellow";
      span.style.transition = "background-color 2s ease-out";

      try {
        // Try surroundContents first (only works if range doesn't cross element boundaries)
        range.surroundContents(span);
      } catch {
        // Fallback: extract contents and insert into span
        const contents = range.extractContents();
        span.appendChild(contents);
        range.insertNode(span);
      }

      // Scroll into view
      span.scrollIntoView({ behavior: "smooth", block: "center" });

      // Remove highlight after 3 seconds
      setTimeout(() => {
        span.style.backgroundColor = "transparent";
        setTimeout(() => {
          const parent = span.parentNode;
          if (parent && span.textContent) {
            parent.replaceChild(
              document.createTextNode(span.textContent),
              span,
            );
          }
        }, 2000);
      }, 3000);
    } catch (rangeError) {
      console.warn("[Glotian Q&A] Error creating/applying range:", rangeError);
    }
  } catch (error) {
    console.error("[Glotian Q&A] Error highlighting text:", error);
  }
}

/**
 * Render all messages from session
 */
function renderMessages(container: HTMLElement): void {
  const chatContainer = container.querySelector("#chat-container");
  if (!chatContainer) return;

  // Clear chat
  chatContainer.innerHTML = "";

  if (!currentSessionId) return;

  const session = getSession(currentSessionId);
  if (!session || session.messages.length === 0) {
    // Show empty state
    const emptyState = container.querySelector("#empty-state");
    if (emptyState) {
      emptyState.classList.remove("hidden");
    }
    return;
  }

  // Hide empty state
  const emptyState = container.querySelector("#empty-state");
  if (emptyState) {
    emptyState.classList.add("hidden");
  }

  // Render all messages
  session.messages.forEach((msg) => addMessageToChat(container, msg));
}

/**
 * Clear chat history
 */
function handleClearHistory(container: HTMLElement): void {
  if (!currentSessionId) return;

  if (
    confirm("Are you sure you want to clear the chat history for this page?")
  ) {
    clearHistory(currentSessionId);
    renderMessages(container);

    // Show empty state
    const emptyState = container.querySelector("#empty-state");
    if (emptyState) {
      emptyState.classList.remove("hidden");
    }
  }
}

/**
 * Show processing indicator
 */
function showProcessing(container: HTMLElement, message: string): void {
  const processingSection = container.querySelector("#processing-section");
  const processingText =
    container.querySelector<HTMLElement>("#processing-text");

  if (processingSection && processingText) {
    processingText.textContent = message;
    processingSection.classList.remove("hidden");
  }
}

/**
 * Hide processing indicator
 */
function hideProcessing(container: HTMLElement): void {
  const processingSection = container.querySelector("#processing-section");
  if (processingSection) {
    processingSection.classList.add("hidden");
  }
}

/**
 * Hide empty state
 */
function hideEmptyState(container: HTMLElement): void {
  const emptyState = container.querySelector("#empty-state");
  if (emptyState) {
    emptyState.classList.add("hidden");
  }
}

/**
 * Show error message
 */
function showError(container: HTMLElement, message: string): void {
  const errorSection = container.querySelector("#error-section");
  const errorText = container.querySelector<HTMLElement>("#error-text");

  if (errorSection && errorText) {
    errorText.textContent = message;
    errorSection.classList.remove("hidden");
  }

  hideProcessing(container);
}

/**
 * Hide error message
 */
function hideError(container: HTMLElement): void {
  const errorSection = container.querySelector("#error-section");
  if (errorSection) {
    errorSection.classList.add("hidden");
  }
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(unsafe: string | null | undefined): string {
  if (typeof unsafe !== "string") return "";

  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
