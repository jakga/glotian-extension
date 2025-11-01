const OFFSCREEN_DOCUMENT_PATH = "src/offscreen/index.html";

type OffscreenAction = "summarize" | "qa" | "summarize-content";

interface OffscreenMessage<Response> {
  ok: boolean;
  result?: Response;
  error?: string;
}

declare const chrome: typeof globalThis.chrome;

export async function ensureOffscreenDocument(): Promise<void> {
  const url = chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH);

  const runtimeAny = chrome.runtime as typeof chrome.runtime & {
    getContexts?: (details: {
      contextTypes: string[];
      documentUrls: string[];
    }) => Promise<Array<{ contextType: string }>>;
  };

  if (typeof runtimeAny.getContexts === "function") {
    const contexts = await runtimeAny.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT"],
      documentUrls: [url],
    });

    if (contexts.length > 0) {
      return;
    }
  } else if (chrome.offscreen?.hasDocument) {
    const hasDocument = await chrome.offscreen.hasDocument();
    if (hasDocument) {
      return;
    }
  }

  await chrome.offscreen.createDocument({
    url,
    reasons: [chrome.offscreen.Reason.DOM_PARSER],
    justification: "Run Chrome Built-in AI APIs from a document context",
  });
}

export async function runOffscreenTask<Response>(
  action: OffscreenAction,
  payload: unknown,
): Promise<Response> {
  await ensureOffscreenDocument();

  return new Promise<Response>((resolve, reject) => {
    chrome.runtime.sendMessage(
      { target: "offscreen", action, payload },
      (message: OffscreenMessage<Response> | undefined) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        if (!message) {
          reject(new Error("No response from offscreen document"));
          return;
        }

        if (!message.ok) {
          reject(new Error(message.error || "Unknown offscreen error"));
          return;
        }

        resolve(message.result as Response);
      },
    );
  });
}
