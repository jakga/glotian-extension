/**
 * Page content extraction utility
 *
 * Uses Readability-like algorithm to extract main content from web pages.
 * This is used for page summarization and Q&A features.
 *
 * @see research.md Section 6 for algorithm details
 */

interface ExtractedContent {
  content: string;
  title: string;
  url: string;
  length: number;
  timestamp: number;
}

// Cache extracted content for 5 minutes to avoid re-extraction
const contentCache = new Map<string, ExtractedContent>();
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes
const CACHE_CLEANUP_INTERVAL_MS = 10 * 60 * 1000; // Clean expired entries every 10 minutes

// Magic number constants for content scoring
const LINK_PENALTY_SCALE = 1000; // Penalty multiplier for link density
const PARAGRAPH_BONUS = 20; // Points added per paragraph found

// Start periodic cache cleanup
let cacheCleanupTimer: number | null = null;
function startCacheCleanup(): void {
  if (cacheCleanupTimer === null) {
    cacheCleanupTimer = window.setInterval(() => {
      const now = Date.now();
      let removedCount = 0;

      // Iterate through cache and remove expired entries
      for (const [key, entry] of contentCache.entries()) {
        if (now - entry.timestamp >= CACHE_DURATION_MS) {
          contentCache.delete(key);
          removedCount++;
        }
      }

      if (removedCount > 0) {
        console.log(
          `[Glotian Content] Cache cleanup: removed ${removedCount} expired entries`,
        );
      }
    }, CACHE_CLEANUP_INTERVAL_MS);
  }
}

// Ensure cleanup is started when module loads
startCacheCleanup();

// Clean up on extension unload
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    if (cacheCleanupTimer !== null) {
      clearInterval(cacheCleanupTimer);
      cacheCleanupTimer = null;
    }
  });
}

/**
 * Normalize URL for caching (strip hash fragments)
 * Hash-based navigation represents the same page content, so we strip it
 * to avoid separate cache entries for hash navigation.
 */
function getCacheKey(href: string): string {
  // Split on '#' and take only the part before the hash
  return href.split("#")[0] || href;
}

/**
 * Extract main content from current page
 *
 * @param maxLength Maximum content length (default: 20,000 chars per AI API constraint)
 * @returns Extracted content with metadata
 */
export async function extractPageContent(
  maxLength: number = 20000,
): Promise<ExtractedContent> {
  const url = window.location.href;
  const cacheKey = getCacheKey(url); // Normalize URL (strip hash)
  const now = Date.now();

  // Check cache first (using normalized key)
  const cached = contentCache.get(cacheKey);
  if (cached && now - cached.timestamp < CACHE_DURATION_MS) {
    console.log(
      "[Glotian Content] Using cached content for",
      cacheKey.substring(0, 50),
    );
    return cached;
  }

  console.log("[Glotian Content] Extracting page content from", cacheKey);

  // Clone document to avoid modifying original DOM
  let doc: Document;
  try {
    doc = document.cloneNode(true) as Document;
  } catch (error) {
    console.warn(
      "[Glotian Content] document.cloneNode failed, using DOMParser fallback:",
      error,
    );
    const parser = new DOMParser();
    doc = parser.parseFromString(
      document.documentElement.outerHTML,
      "text/html",
    );
  }

  // Step 1: Remove noise elements
  removeNoiseElements(doc);

  // Step 2: Find main content container
  const mainElement = findMainContent(doc);

  // Step 3: Extract text from main element
  let content = "";
  if (mainElement) {
    content = extractText(mainElement);
  } else {
    // Fallback: use body text
    content = doc.body.textContent?.trim() || "";
  }

  // Step 4: Truncate to max length
  if (content.length > maxLength) {
    const codePoints = Array.from(content);
    if (codePoints.length > maxLength) {
      content = `${codePoints.slice(0, maxLength).join("")}...`;
    } else {
      content = codePoints.join("");
    }
  }

  const extracted: ExtractedContent = {
    content,
    title: document.title,
    url,
    length: content.length,
    timestamp: now,
  };

  // Cache result (using normalized cache key to avoid duplicate entries for hash navigation)
  contentCache.set(cacheKey, extracted);

  console.log(
    `[Glotian Content] Extracted ${content.length} characters from page`,
  );

  return extracted;
}

/**
 * Extract main content with retry for SPAs (single-page apps)
 *
 * Some SPAs load content dynamically after initial render.
 * This function retries extraction after a delay if content is too short.
 *
 * @param maxLength Maximum content length
 * @returns Extracted content
 */
const SPA_CONTENT_THRESHOLD = 500; // Minimum chars before considering content loaded
const SPA_RETRY_DELAY_MS = 1000; // Delay before retrying for SPAs

export async function extractPageContentWithRetry(
  maxLength: number = 20000,
): Promise<ExtractedContent> {
  const firstAttempt = await extractPageContent(maxLength);

  if (firstAttempt.length < SPA_CONTENT_THRESHOLD) {
    console.log(
      "[Glotian Content] Content too short, retrying after 1 second (SPA detection)",
    );

    await new Promise((resolve) => setTimeout(resolve, SPA_RETRY_DELAY_MS));

    // Clear cache and retry
    const retryKey = getCacheKey(window.location.href);
    contentCache.delete(retryKey);
    return extractPageContent(maxLength);
  }

  return firstAttempt;
}

/**
 * Remove noise elements (nav, header, footer, ads, sidebars)
 */
function removeNoiseElements(doc: Document): void {
  const noiseSelectors = [
    "nav",
    "header",
    "footer",
    "aside",
    ".sidebar",
    ".ad",
    ".advertisement",
    ".banner",
    ".navigation",
    ".menu",
    ".comments",
    ".social-share",
    "[role='banner']",
    "[role='navigation']",
    "[role='complementary']",
    "iframe", // Remove embedded content
    "script", // Remove scripts
    "style", // Remove style tags
  ];

  noiseSelectors.forEach((selector) => {
    const elements = doc.querySelectorAll(selector);
    elements.forEach((el) => el.remove());
  });
}

/**
 * Find main content container using heuristics
 *
 * Scores each potential content container based on:
 * - Text length (higher is better)
 * - Link density (lower is better)
 * - Paragraph count (higher is better)
 * - Semantic tags (article, main, etc. are preferred)
 *
 * @returns Main content element or null
 */
function findMainContent(doc: Document): Element | null {
  const contentSelectors = [
    "article",
    "main",
    '[role="main"]',
    ".content",
    ".post",
    ".article",
    "#content",
    "#main",
    ".entry-content", // WordPress
    ".post-content", // Common blog pattern
  ];

  let maxScore = 0;
  let mainElement: Element | null = null;

  // Try semantic selectors first
  for (const selector of contentSelectors) {
    const elements = doc.querySelectorAll(selector);
    elements.forEach((el) => {
      const score = scoreElement(el);
      if (score > maxScore) {
        maxScore = score;
        mainElement = el;
      }
    });
  }

  // If no semantic match, score all divs
  if (!mainElement) {
    const divs = doc.querySelectorAll("div");
    divs.forEach((el) => {
      const score = scoreElement(el);
      if (score > maxScore) {
        maxScore = score;
        mainElement = el;
      }
    });
  }

  return mainElement;
}

/**
 * Score an element for content quality
 *
 * Scoring formula: text_length - (link_density * LINK_PENALTY_SCALE) + (paragraph_count * PARAGRAPH_BONUS)
 *
 * @param el Element to score
 * @returns Score (higher is better)
 */
function scoreElement(el: Element): number {
  const text = el.textContent?.trim() || "";
  const links = el.querySelectorAll("a").length;
  const paragraphs = el.querySelectorAll("p").length;

  // Calculate link density (percentage of text that's links)
  const linkText = Array.from(el.querySelectorAll("a"))
    .map((a) => a.textContent?.trim() || "")
    .join(" ");
  const linkDensity = text.length > 0 ? linkText.length / text.length : 0;

  // Score = text length - link density penalty + paragraph bonus
  // Use named constants for easy tuning
  const textScore = text.length;
  const linkPenalty = linkDensity * LINK_PENALTY_SCALE; // Penalize high link density
  const paragraphBonus = paragraphs * PARAGRAPH_BONUS; // Reward content-dense elements

  return textScore - linkPenalty + paragraphBonus;
}

/**
 * Extract clean text from element
 *
 * Preserves paragraph breaks and removes excessive whitespace.
 *
 * @param el Element to extract text from
 * @returns Clean text
 */
function extractText(el: Element): string {
  // Get all text nodes and paragraphs
  const paragraphs = el.querySelectorAll("p, h1, h2, h3, h4, h5, h6");
  const textParts: string[] = [];

  paragraphs.forEach((p) => {
    const text = p.textContent?.trim();
    if (text && text.length > 0) {
      textParts.push(text);
    }
  });

  // If no paragraphs found, use all text content
  if (textParts.length === 0) {
    return el.textContent?.trim() || "";
  }

  // Join with double newline to preserve paragraph breaks
  return textParts.join("\n\n");
}

/**
 * Clear content cache
 *
 * Useful for testing or when page content changes significantly
 */
export function clearContentCache(): void {
  contentCache.clear();
  console.log("[Glotian Content] Content cache cleared");
}

/**
 * Check if current page has extractable content
 *
 * @returns True if page has sufficient content
 */
export async function hasExtractableContent(): Promise<boolean> {
  try {
    const content = await extractPageContent();
    return content.length > 100; // At least 100 chars
  } catch (error) {
    console.error("[Glotian Content] Error checking content:", error);
    return false;
  }
}
