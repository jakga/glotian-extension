/**
 * Media tab component for multimodal input
 *
 * Tasks: T123-T149
 * - Image OCR (upload, drag-drop, processing)
 * - Audio transcription (recording, upload, processing)
 * - Feature detection
 * - Error handling
 */

import { extractTextFromImage, transcribeAudio } from "@/lib/ai/prompt";
import {
  extractTextWithOpenAI,
  transcribeAudioWithOpenAI,
} from "@/lib/ai/fallback";
import { getSetting } from "@/lib/storage";
import { translate } from "@/lib/ai/translate";
import { db } from "@/lib/db/schema";
import { createCachedNote } from "@/lib/db/cache";
import { noteDraftToSupabasePayload, type NoteDraft } from "@repo/domain/notes";
import { ensureAIPolyfill } from "@/lib/ai/polyfill";
import { getAIHandle } from "@/lib/ai/env";
import {
  ensureSupportedSourceLanguage,
  ensureSupportedTargetLanguage,
  getDefaultLanguagePreferences,
} from "@/lib/language";

// State
let isProcessing = false;
let mediaRecorder: MediaRecorder | null = null;
let audioChunks: Blob[] = [];
let recordingStartTime: number = 0;
let recordingInterval: number | null = null;
let recordingTimeout: number | null = null;
let chromeAISupported = false;

/**
 * Unicode-aware text truncation that handles grapheme clusters
 * Safely truncates multi-byte characters, emojis, and CJK characters
 * @param text Text to truncate
 * @param maxLength Maximum number of characters to keep
 * @returns Truncated text with "..." appended if truncated
 */
function truncateTextUnicode(text: string, maxLength: number = 50): string {
  // Use String.prototype's grapheme-aware iteration via Array.from
  // This handles most Unicode characters including emojis
  const chars = Array.from(text);

  if (chars.length <= maxLength) {
    return text;
  }

  // Join the first maxLength grapheme clusters
  return chars.slice(0, maxLength).join("") + "...";
}

/**
 * Initialize media tab
 * Task: T123, T143-T144
 */
export async function initMediaTab(): Promise<void> {
  console.log("[Glotian Media] Initializing media tab");

  // Detect Chrome AI multimodal support
  await detectMultimodalSupport();

  // Render tab content
  renderMediaTab();

  // Setup image section
  setupImageSection();

  // Setup audio section
  setupAudioSection();

  console.log("[Glotian Media] Media tab initialized");
}

/**
 * Detect Chrome AI multimodal support
 * Task: T143
 */
async function detectMultimodalSupport(): Promise<void> {
  try {
    ensureAIPolyfill();
    const ai = getAIHandle() as { languageModel?: any } | undefined;
    chromeAISupported = !!(ai && ai.languageModel);

    console.log(
      `[Glotian Media] Chrome AI multimodal support: ${chromeAISupported}`,
    );

    // Store in settings for future reference
    await chrome.storage.local.set({ chromeAIMultimodal: chromeAISupported });
  } catch (error) {
    console.error("[Glotian Media] Error detecting multimodal support:", error);
    chromeAISupported = false;
  }
}

/**
 * Render media tab UI
 * Task: T123
 */
function renderMediaTab(): void {
  const container = document.getElementById("media-tab");
  if (!container) return;

  container.innerHTML = `
    <div class="media-container">
      ${!chromeAISupported ? renderDisabledWarning() : ""}

      <!-- Image OCR Section -->
      <section class="media-section image-section">
        <h2>📸 Image OCR (Text Extraction)</h2>
        <p class="section-description">Upload an image with text, and AI will extract the text for you.</p>

        <div class="upload-area" id="image-drop-zone">
          <div class="upload-icon">📤</div>
          <p>Drag & drop an image here, or click to select</p>
          <p class="upload-hint">Supports JPG, PNG, WebP • Max 3MB</p>
          <input
            type="file"
            id="image-file-input"
            accept="image/jpeg,image/png,image/webp"
            style="display: none;"
          />
          <button class="btn-primary" id="image-select-btn">Select Image</button>
        </div>

        <div class="result-area" id="image-result" style="display: none;">
          <div class="result-header">
            <h3>Extracted Text</h3>
            <span class="confidence-badge" id="image-confidence"></span>
          </div>
          <div class="result-preview" id="image-preview"></div>
          <div class="result-text" id="image-text"></div>
          <div class="result-actions">
            <button class="btn-primary" id="image-translate-btn">Translate & Save</button>
            <button class="btn-secondary" id="image-copy-btn">Copy Text</button>
          </div>
        </div>

        <div class="processing-indicator" id="image-processing" style="display: none;">
          <div class="spinner"></div>
          <p>Extracting text from image...</p>
          <p class="processing-time" id="image-processing-time"></p>
        </div>

        <div class="error-message" id="image-error" style="display: none;"></div>
      </section>

      <!-- Audio Transcription Section -->
      <section class="media-section audio-section">
        <h2>🎤 Audio Transcription</h2>
        <p class="section-description">Record or upload audio, and AI will transcribe it to text.</p>

        <!-- Recording Controls -->
        <div class="recording-controls">
          <button class="btn-record" id="audio-record-btn">
            <span class="record-icon">⏺</span>
            Start Recording
          </button>
          <button class="btn-stop" id="audio-stop-btn" style="display: none;">
            <span class="stop-icon">⏹</span>
            Stop Recording
          </button>
          <div class="recording-timer" id="recording-timer" style="display: none;">
            <span class="timer-icon">⏱</span>
            <span id="timer-display">00:00</span>
            <span class="timer-limit">/ 02:00</span>
          </div>
        </div>

        <!-- Audio Upload -->
        <div class="divider">OR</div>

        <div class="upload-area">
          <div class="upload-icon">📤</div>
          <p>Upload an audio file</p>
          <p class="upload-hint">Supports MP3, WAV, M4A • Max 4MB (2 minutes)</p>
          <input
            type="file"
            id="audio-file-input"
            accept="audio/mpeg,audio/wav,audio/x-m4a,audio/mp4"
            style="display: none;"
          />
          <button class="btn-primary" id="audio-select-btn">Select Audio</button>
        </div>

        <div class="result-area" id="audio-result" style="display: none;">
          <div class="result-header">
            <h3>Transcribed Text</h3>
            <span class="language-badge" id="audio-language"></span>
          </div>
          <div class="audio-player" id="audio-player"></div>
          <div class="result-text" id="audio-text"></div>
          <div class="result-actions">
            <button class="btn-primary" id="audio-translate-btn">Translate & Save</button>
            <button class="btn-secondary" id="audio-copy-btn">Copy Text</button>
          </div>
        </div>

        <div class="processing-indicator" id="audio-processing" style="display: none;">
          <div class="spinner"></div>
          <p>Transcribing audio...</p>
          <p class="processing-time" id="audio-processing-time"></p>
        </div>

        <div class="error-message" id="audio-error" style="display: none;"></div>
      </section>
    </div>
  `;
}

/**
 * Render disabled warning if Chrome AI not available
 * Task: T144
 */
function renderDisabledWarning(): string {
  return `
    <div class="warning-banner">
      <div class="warning-icon">⚠️</div>
      <div class="warning-content">
        <h3>Chrome AI Multimodal Not Available</h3>
        <p>This feature requires Chrome 120+ with experimental AI features enabled.</p>
        <p>Falling back to OpenAI Vision and Whisper APIs (requires API key).</p>
        <a href="chrome://flags/#optimization-guide-on-device-model" target="_blank" class="warning-link">
          Enable Chrome AI Features →
        </a>
      </div>
    </div>
  `;
}

/**
 * Setup image section (file picker, drag-drop, processing)
 * Tasks: T124-T125, T128-T134
 */
function setupImageSection(): void {
  const dropZone = document.getElementById("image-drop-zone");
  const fileInput = document.getElementById(
    "image-file-input",
  ) as HTMLInputElement;
  const selectBtn = document.getElementById("image-select-btn");

  if (!dropZone || !fileInput || !selectBtn) return;

  // File picker (Task: T124)
  selectBtn.addEventListener("click", () => {
    fileInput.click();
  });

  fileInput.addEventListener("change", async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) {
      await processImage(file);
      // Reset input to allow re-selecting the same file
      fileInput.value = "";
    }
  });

  // Drag and drop (Task: T125)
  dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.classList.add("drag-over");
  });

  dropZone.addEventListener("dragleave", () => {
    dropZone.classList.remove("drag-over");
  });

  dropZone.addEventListener("drop", async (e) => {
    e.preventDefault();
    dropZone.classList.remove("drag-over");

    const file = e.dataTransfer?.files?.[0];
    if (file && file.type.startsWith("image/")) {
      await processImage(file);
    } else {
      showImageError("Please drop a valid image file (JPG, PNG, WebP)");
    }
  });

  // Copy button
  const copyBtn = document.getElementById("image-copy-btn");
  if (copyBtn) {
    copyBtn.addEventListener("click", () => {
      const textElement = document.getElementById("image-text");
      if (textElement) {
        navigator.clipboard.writeText(textElement.textContent || "");
        copyBtn.textContent = "✓ Copied!";
        setTimeout(() => {
          copyBtn.textContent = "Copy Text";
        }, 2000);
      }
    });
  }

  // Translate & Save button
  const translateBtn = document.getElementById("image-translate-btn");
  if (translateBtn) {
    translateBtn.addEventListener("click", async () => {
      const textElement = document.getElementById("image-text");
      if (textElement && textElement.textContent) {
        await translateAndSaveText(textElement.textContent, "image");
      }
    });
  }
}

/**
 * Setup audio section (recording, file picker, processing)
 * Tasks: T126-T127, T135-T142
 */
function setupAudioSection(): void {
  const recordBtn = document.getElementById("audio-record-btn");
  const stopBtn = document.getElementById("audio-stop-btn");
  const fileInput = document.getElementById(
    "audio-file-input",
  ) as HTMLInputElement;
  const selectBtn = document.getElementById("audio-select-btn");

  if (!recordBtn || !stopBtn || !fileInput || !selectBtn) return;

  // Recording controls (Task: T126)
  recordBtn.addEventListener("click", async () => {
    await startRecording();
  });

  stopBtn.addEventListener("click", async () => {
    await stopRecording();
  });

  // File picker (Task: T127)
  selectBtn.addEventListener("click", () => {
    fileInput.click();
  });

  fileInput.addEventListener("change", async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) {
      await processAudio(file);
      // Reset input to allow re-selecting the same file
      fileInput.value = "";
    }
  });

  // Copy button
  const copyBtn = document.getElementById("audio-copy-btn");
  if (copyBtn) {
    copyBtn.addEventListener("click", () => {
      const textElement = document.getElementById("audio-text");
      if (textElement) {
        navigator.clipboard.writeText(textElement.textContent || "");
        copyBtn.textContent = "✓ Copied!";
        setTimeout(() => {
          copyBtn.textContent = "Copy Text";
        }, 2000);
      }
    });
  }

  // Translate & Save button
  const translateBtn = document.getElementById("audio-translate-btn");
  if (translateBtn) {
    translateBtn.addEventListener("click", async () => {
      const textElement = document.getElementById("audio-text");
      if (textElement && textElement.textContent) {
        await translateAndSaveText(textElement.textContent, "audio");
      }
    });
  }
}

/**
 * Process image file (validate, extract text)
 * Tasks: T128-T134
 */
async function processImage(file: File): Promise<void> {
  console.log("[Glotian Media] Processing image:", file.name);

  // Clear previous results
  hideImageResult();
  hideImageError();

  // Validate image size (Task: T128, T146)
  if (file.size > 3 * 1024 * 1024) {
    showImageError(
      "Image exceeds 3MB size limit. Please compress the image and try again.",
    );
    return;
  }

  // Validate image format
  if (!file.type.match(/^image\/(jpeg|png|webp)$/)) {
    showImageError("Unsupported image format. Please use JPG, PNG, or WebP.");
    return;
  }

  // Show processing indicator
  showImageProcessing();

  // Display image preview
  displayImagePreview(file);

  try {
    // Convert file to Blob
    const imageBlob = new Blob([await file.arrayBuffer()], { type: file.type });

    // Try Chrome AI first, fallback to OpenAI Vision
    let result;
    try {
      result = await extractTextFromImage(imageBlob);
    } catch (chromeError) {
      console.warn(
        "[Glotian Media] Chrome AI OCR failed, falling back to OpenAI Vision:",
        chromeError,
      );
      result = await extractTextWithOpenAI(imageBlob);
    }

    // Check if any text was extracted (Task: T145)
    if (!result.extractedText || result.extractedText.trim().length === 0) {
      throw new Error(
        "No text found in the image. Please try a different image with clearer text.",
      );
    }

    console.log(
      `[Glotian Media] OCR complete: ${result.extractedText.length} chars in ${result.processingTime.toFixed(0)}ms`,
    );

    // Display result (Task: T133)
    displayImageResult(
      result.extractedText,
      result.confidence,
      result.aiSource,
    );
  } catch (error) {
    console.error("[Glotian Media] Image processing error:", error);
    showImageError(
      (error as Error).message || "Failed to extract text from image",
    );
  } finally {
    hideImageProcessing();
  }
}

/**
 * Start audio recording
 * Task: T135
 */
async function startRecording(): Promise<void> {
  console.log("[Glotian Media] Starting audio recording");

  // Clear previous results
  hideAudioResult();
  hideAudioError();

  try {
    // Choose supported audio format
    const mimeType = MediaRecorder.isTypeSupported("audio/webm")
      ? "audio/webm"
      : "audio/mp4";

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
    });

    mediaRecorder = new MediaRecorder(stream, {
      mimeType,
    });

    audioChunks = [];
    recordingStartTime = Date.now();

    // Collect audio data
    mediaRecorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) {
        audioChunks.push(event.data);
      }
    });

    // Handle recording stop
    mediaRecorder.addEventListener("stop", async () => {
      // Stop all tracks
      stream.getTracks().forEach((track: MediaStreamTrack) => track.stop());

      // Create audio blob
      const audioBlob = new Blob(audioChunks, { type: "audio/webm" });

      // Process audio
      await processAudio(audioBlob);

      // Clear recording state
      audioChunks = [];
    });

    // Start recording
    mediaRecorder.start();

    // Update UI
    toggleRecordingUI(true);
    // Auto-stop after 2 minutes (Task: T147)
    recordingTimeout = window.setTimeout(() => {
      if (mediaRecorder && mediaRecorder.state === "recording") {
        stopRecording();
        showAudioError(
          "Recording stopped automatically after 2 minutes (maximum duration).",
        );
      }
    }, 120000);
  } catch (error) {
    console.error("[Glotian Media] Recording error:", error);
    showAudioError(
      "Failed to start recording. Please check microphone permissions.",
    );
  }
}

/**
 * Stop audio recording
 */
async function stopRecording(): Promise<void> {
  console.log("[Glotian Media] Stopping audio recording");

  if (mediaRecorder && mediaRecorder.state === "recording") {
    mediaRecorder.stop();
  }

  // Stop timer
  stopRecordingTimer();

  if (recordingTimeout !== null) {
    clearTimeout(recordingTimeout);
    recordingTimeout = null;
  }

  // Update UI
  toggleRecordingUI(false);
}

/**
 * Process audio file or recording (validate, transcribe)
 * Tasks: T136-T142
 */
async function processAudio(audio: File | Blob): Promise<void> {
  console.log("[Glotian Media] Processing audio:", audio.size, "bytes");

  // Clear previous errors
  hideAudioError();

  // Validate audio size (Task: T136, T147)
  if (audio.size > 4 * 1024 * 1024) {
    showAudioError(
      "Audio exceeds 4MB size limit (max 2 minutes). Please trim the audio and try again.",
    );
    return;
  }

  // Show processing indicator
  showAudioProcessing();

  // Create audio element for playback
  const audioUrl = URL.createObjectURL(audio);
  displayAudioPlayer(audioUrl);

  try {
    // Try Chrome AI first, fallback to OpenAI Whisper
    let result;
    try {
      result = await transcribeAudio(audio as Blob);
    } catch (chromeError) {
      console.warn(
        "[Glotian Media] Chrome AI transcription failed, falling back to OpenAI Whisper:",
        chromeError,
      );
      result = await transcribeAudioWithOpenAI(audio as Blob);
    }

    // Check if transcription is empty
    if (!result.transcribedText || result.transcribedText.trim().length === 0) {
      throw new Error(
        "No speech detected in the audio. Please try again with clearer audio.",
      );
    }

    console.log(
      `[Glotian Media] Transcription complete: ${result.transcribedText.length} chars in ${result.processingTime.toFixed(0)}ms`,
    );

    // Display result (Task: T141)
    displayAudioResult(
      result.transcribedText,
      result.language,
      result.duration,
      result.aiSource,
    );
  } catch (error) {
    console.error("[Glotian Media] Audio processing error:", error);
    showAudioError((error as Error).message || "Failed to transcribe audio");
    URL.revokeObjectURL(audioUrl);
  } finally {
    hideAudioProcessing();
  }
}

/**
 * Translate and save extracted text as note
 * Task: T134, T142
 */
async function translateAndSaveText(
  text: string,
  source: "image" | "audio",
): Promise<void> {
  console.log(`[Glotian Media] Translating and saving ${source} text`);

  try {
    // Get user settings
    const userId = await getSetting("userId");
    const defaults = getDefaultLanguagePreferences();
    const sourceLanguage = ensureSupportedSourceLanguage(
      await getSetting("sourceLanguage"),
      defaults.sourceLanguage,
    );
    const targetLanguage = ensureSupportedTargetLanguage(
      await getSetting("targetLanguage"),
      defaults.targetLanguage,
    );

    if (!userId) {
      const errorMessage = "Please log in to save notes";
      if (source === "image") {
        showImageError(errorMessage);
      } else if (source === "audio") {
        showAudioError(errorMessage);
      }
      return;
    }

    // Show loading state
    const btn =
      source === "image"
        ? document.getElementById("image-translate-btn")
        : document.getElementById("audio-translate-btn");
    const originalText = btn?.textContent || "";
    if (btn) btn.textContent = "Translating...";

    // Translate text
    const translation = await translate({
      text,
      sourceLang: sourceLanguage,
      targetLang: targetLanguage,
    });

    // Create note in IndexedDB
    const noteId = crypto.randomUUID();
    const now = new Date().toISOString();
    const title = `${source === "image" ? "📸" : "🎤"} ${truncateTextUnicode(text, 50)}`;
    const noteBody = [
      "Original:",
      text.trim(),
      "",
      "Translation:",
      translation.translatedText.trim(),
    ]
      .filter(Boolean)
      .join("\n");

    const noteDraft: NoteDraft = {
      userId,
      title,
      content: noteBody,
      tags: [source === "image" ? "ocr" : "transcription"],
      sourceType: source === "image" ? "image" : "voice",
      sourceUrl: null,
    };

    await createCachedNote(userId, {
      id: noteId,
      ...noteDraft,
      createdAt: now,
      updatedAt: now,
    });

    // Add to sync queue
    const notePayload = noteDraftToSupabasePayload(noteDraft, {
      timestamp: now,
    });

    await db.syncQueue.add({
      operation: "create",
      table: "learning_notes",
      entityId: noteId,
      payload: notePayload,
      timestamp: Date.now(),
      retryCount: 0,
      lastAttempt: null,
      error: null,
    });

    // Log activity
    const { logActivity } = await import("@/lib/db/activity-log");
    await logActivity(
      userId,
      source === "image" ? "media_ocr" : "media_transcribe",
      {
        entityType: "learning_note",
        entityId: noteId,
        metadata: {
          source,
          textLength: text.length,
          sourceLanguage:
            translation.detectedLanguage ||
            (sourceLanguage === "auto" ? "en" : sourceLanguage),
          targetLanguage,
        },
      },
    );

    console.log(`[Glotian Media] Note saved successfully: ${noteId}`);

    // Show success message
    if (btn) {
      btn.textContent = "✓ Saved!";
      setTimeout(() => {
        btn.textContent = originalText;
      }, 2000);
    }

    // Switch to Capture tab to show the note
    const captureTab = document.querySelector('[data-tab="capture"]');
    if (captureTab) {
      (captureTab as HTMLElement).click();
    }
  } catch (error) {
    console.error("[Glotian Media] Save error:", error);
    const errorMsg = `Failed to save note: ${(error as Error).message}`;
    if (source === "image") {
      showImageError(errorMsg);
    } else {
      showAudioError(errorMsg);
    }
  }
}

/**
 * Display image preview
 */
function displayImagePreview(file: File): void {
  const preview = document.getElementById("image-preview");
  if (!preview) return;

  const reader = new FileReader();

  reader.onload = (e) => {
    preview.innerHTML = `<img src="${e.target?.result}" alt="Uploaded image" />`;
  };

  reader.onerror = () => {
    console.error("[Glotian Media] FileReader error:", reader.error);
    preview.innerHTML = `<div class="error-placeholder">Failed to preview image</div>`;
    showImageError("Failed to read image file. Please try again.");
  };

  reader.readAsDataURL(file);
}

/**
 * Display image extraction result
 * Task: T133
 */
function displayImageResult(
  text: string,
  confidence: number,
  aiSource: string,
): void {
  const resultArea = document.getElementById("image-result");
  const textElement = document.getElementById("image-text");
  const confidenceBadge = document.getElementById("image-confidence");

  if (!resultArea || !textElement || !confidenceBadge) return;

  textElement.textContent = text;
  confidenceBadge.textContent = `${aiSource === "chrome" ? "🔵 Chrome AI" : "🌐 OpenAI Vision"} • ${(confidence * 100).toFixed(0)}% confidence`;

  resultArea.style.display = "block";
}

/**
 * Display audio player
 */
function displayAudioPlayer(audioUrl: string): void {
  const player = document.getElementById("audio-player");
  if (!player) return;

  player.innerHTML = `
    <audio controls src="${audioUrl}">
      Your browser does not support the audio element.
    </audio>
  `;

  // Revoke the object URL after playback ends to prevent memory leak
  const audioElement = player.querySelector("audio") as HTMLAudioElement | null;
  if (audioElement) {
    audioElement.addEventListener(
      "ended",
      () => {
        URL.revokeObjectURL(audioUrl);
      },
      { once: true },
    );

    // Also revoke when the player is removed from DOM
    const observer = new MutationObserver(() => {
      if (!document.contains(audioElement)) {
        URL.revokeObjectURL(audioUrl);
        observer.disconnect();
      }
    });
    observer.observe(player.parentElement || document.body, {
      childList: true,
      subtree: true,
    });
  }
}

/**
 * Display audio transcription result
 * Task: T141
 */
function displayAudioResult(
  text: string,
  language: string,
  duration: number,
  aiSource: string,
): void {
  const resultArea = document.getElementById("audio-result");
  const textElement = document.getElementById("audio-text");
  const languageBadge = document.getElementById("audio-language");

  if (!resultArea || !textElement || !languageBadge) return;

  textElement.textContent = text;
  languageBadge.textContent = `${aiSource === "chrome" ? "🔵 Chrome AI" : "🌐 OpenAI Whisper"} • ${language} • ${Math.floor(duration)}s`;

  resultArea.style.display = "block";
}

/**
 * Toggle recording UI
 */
function toggleRecordingUI(isRecording: boolean): void {
  const recordBtn = document.getElementById("audio-record-btn");
  const stopBtn = document.getElementById("audio-stop-btn");
  const timer = document.getElementById("recording-timer");

  if (!recordBtn || !stopBtn || !timer) return;

  if (isRecording) {
    recordBtn.style.display = "none";
    stopBtn.style.display = "block";
    timer.style.display = "flex";
  } else {
    recordBtn.style.display = "block";
    stopBtn.style.display = "none";
    timer.style.display = "none";
  }
}

/**
 * Start recording timer
 */
function startRecordingTimer(): void {
  const timerDisplay = document.getElementById("timer-display");
  if (!timerDisplay) return;

  recordingInterval = window.setInterval(() => {
    const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    timerDisplay.textContent = `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }, 1000);
}

/**
 * Stop recording timer
 */
function stopRecordingTimer(): void {
  if (recordingInterval !== null) {
    clearInterval(recordingInterval);
    recordingInterval = null;
  }
}

/**
 * UI state helpers
 */
function showImageProcessing(): void {
  const processing = document.getElementById("image-processing");
  if (processing) processing.style.display = "block";
}

function hideImageProcessing(): void {
  const processing = document.getElementById("image-processing");
  if (processing) processing.style.display = "none";
}

function showAudioProcessing(): void {
  const processing = document.getElementById("audio-processing");
  if (processing) processing.style.display = "block";
}

function hideAudioProcessing(): void {
  const processing = document.getElementById("audio-processing");
  if (processing) processing.style.display = "none";
}

function showImageError(message: string): void {
  const error = document.getElementById("image-error");
  if (error) {
    error.textContent = message;
    error.style.display = "block";
  }
}

function hideImageError(): void {
  const error = document.getElementById("image-error");
  if (error) error.style.display = "none";
}

function showAudioError(message: string): void {
  const error = document.getElementById("audio-error");
  if (error) {
    error.textContent = message;
    error.style.display = "block";
  }
}

function hideAudioError(): void {
  const error = document.getElementById("audio-error");
  if (error) error.style.display = "none";
}

function hideImageResult(): void {
  const result = document.getElementById("image-result");
  if (result) result.style.display = "none";
}

function hideAudioResult(): void {
  const result = document.getElementById("audio-result");
  if (result) result.style.display = "none";
}
