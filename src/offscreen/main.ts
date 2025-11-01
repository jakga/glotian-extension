import {
  summarizeLongContent,
  type SummarizeRequest,
  type SummarizeResponse,
} from "@/lib/ai/summarizer";
import { summarizeWithTimeout } from "@/lib/ai/summarize";
import type { QARequest, QAResponse } from "@/types";
import { answerQuestionWithPrompt } from "@/lib/ai/prompt";

type OffscreenAction = "summarize" | "qa" | "summarize-content";

type SummarizePayload = {
  request: SummarizeRequest;
  timeoutMs: number;
};

type QAPayload = {
  request: QARequest;
};

type SummarizeContentPayload = {
  content: string;
};

declare const chrome: typeof globalThis.chrome;

function isSummarizePayload(payload: unknown): payload is SummarizePayload {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const candidate = payload as SummarizePayload;
  return (
    typeof candidate.timeoutMs === "number" &&
    candidate.timeoutMs > 0 &&
    typeof candidate.request === "object" &&
    candidate.request !== null
  );
}

function isQAPayload(payload: unknown): payload is QAPayload {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const candidate = payload as QAPayload;
  return typeof candidate.request === "object" && candidate.request !== null;
}

function isSummarizeContentPayload(
  payload: unknown,
): payload is SummarizeContentPayload {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const candidate = payload as SummarizeContentPayload;
  return typeof candidate.content === "string" && candidate.content.length > 0;
}

async function handleSummarize(
  payload: SummarizePayload,
): Promise<SummarizeResponse> {
  return summarizeWithTimeout(payload.request, payload.timeoutMs);
}

async function handleQA(payload: QAPayload): Promise<QAResponse> {
  return answerQuestionWithPrompt(payload.request);
}

async function handleSummarizeContent(
  payload: SummarizeContentPayload,
): Promise<string> {
  return summarizeLongContent(payload.content);
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.target !== "offscreen") {
    return undefined;
  }

  const { action, payload } = message as {
    action: OffscreenAction;
    payload: unknown;
  };

  (async () => {
    switch (action) {
      case "summarize": {
        if (!isSummarizePayload(payload)) {
          throw new Error("Invalid summarize payload");
        }
        const result = await handleSummarize(payload);
        sendResponse({ ok: true, result });
        return;
      }
      case "qa": {
        if (!isQAPayload(payload)) {
          throw new Error("Invalid QA payload");
        }
        const result = await handleQA(payload);
        sendResponse({ ok: true, result });
        return;
      }
      case "summarize-content": {
        if (!isSummarizeContentPayload(payload)) {
          throw new Error("Invalid summarize-content payload");
        }
        const result = await handleSummarizeContent(payload);
        sendResponse({ ok: true, result });
        return;
      }
      default:
        throw new Error(`Unsupported offscreen action: ${String(action)}`);
    }
  })().catch((error: unknown) => {
    const message =
      error instanceof Error ? error.message : String(error ?? "Unknown error");
    console.error("[Glotian Offscreen] Task failed:", error);
    sendResponse({ ok: false, error: message });
  });

  return true;
});
