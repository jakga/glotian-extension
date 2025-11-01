/**
 * DOM utility functions
 */

/**
 * Create element with Shadow DOM
 */
export function createShadowElement(
  tagName: string,
  styles?: string,
): { host: HTMLElement; shadow: ShadowRoot } {
  const host = document.createElement(tagName);
  const shadow = host.attachShadow({ mode: "open" });

  if (styles) {
    const styleElement = document.createElement("style");
    styleElement.textContent = styles;
    shadow.appendChild(styleElement);
  }

  return { host, shadow };
}

/**
 * Get element position relative to viewport
 */
export function getElementPosition(element: Element): {
  top: number;
  left: number;
  width: number;
  height: number;
} {
  const rect = element.getBoundingClientRect();
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  };
}

/**
 * Check if element is visible
 */
export function isElementVisible(element: Element): boolean {
  const rect = element.getBoundingClientRect();
  return (
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <=
      (window.innerHeight || document.documentElement.clientHeight) &&
    rect.right <= (window.innerWidth || document.documentElement.clientWidth)
  );
}

/**
 * Wait for element to appear in DOM
 */
export function waitForElement(
  selector: string,
  timeout = 5000,
): Promise<Element | null> {
  return new Promise((resolve) => {
    const element = document.querySelector(selector);
    if (element) {
      resolve(element);
      return;
    }

    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) {
        observer.disconnect();
        resolve(el);
      }
    });

    // Use document.body if available, fallback to document.documentElement
    const observationTarget = document.body || document.documentElement;
    observer.observe(observationTarget, {
      childList: true,
      subtree: true,
    });

    setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeout);
  });
}
