# Glotian Chrome Extension - Manual QA Checklist

**Version**: 1.0.0
**Date**: 2025-10-17
**Purpose**: Comprehensive integration testing across major websites

## Pre-Test Setup

- [ ] Extension installed in Chrome (version ≥138 for built-in AI features; ≥120 for basic capture only)
- [ ] Chrome Built-in AI enabled (check `chrome://flags`)
- [ ] Supabase credentials configured in `.env.local`
- [ ] User authenticated in side panel
- [ ] Network connection stable

## Test Environment

| Item              | Value    |
| ----------------- | -------- |
| Chrome Version    | **\_\_** |
| Extension Version | 1.0.0    |
| Test Date         | **\_\_** |
| Tester Name       | **\_\_** |

---

## User Story 1: Quick Text Capture (P1) 🎯 MVP

### US1.1: Text Selection + Translation

**Site**: Any website (e.g., Wikipedia, News sites)

- [ ] **Step 1**: Navigate to [https://en.wikipedia.org/wiki/Machine_learning](https://en.wikipedia.org/wiki/Machine_learning)
- [ ] **Step 2**: Select text (10-50 words): "Machine learning is a field of study..."
- [ ] **Step 3**: Press `Ctrl+Shift+F` (or `Cmd+Shift+F` on Mac)
- [ ] **Expected**: Translation snackbar appears within 1.2 seconds
- [ ] **Expected**: Snackbar shows original text + translated text
- [ ] **Expected**: Snackbar has "Create Flashcards" and "View Note" buttons
- [ ] **Expected**: Auto-tags visible (e.g., "technology", "CEFR: B2")

**Verify**:

- [ ] Translation accuracy (spot check)
- [ ] Grammar explanation present
- [ ] Tags are relevant
- [ ] Performance < 1.2s (use DevTools Network tab)

### US1.2: Context Menu Capture

- [ ] **Step 1**: Right-click selected text
- [ ] **Step 2**: Click "Save to Glotian" in context menu
- [ ] **Expected**: Same behavior as keyboard shortcut
- [ ] **Expected**: Translation snackbar appears

### US1.3: View Note in Side Panel

- [ ] **Step 1**: Click "View Note" button in snackbar
- [ ] **Step 2**: Side panel opens to Capture tab
- [ ] **Expected**: Note appears in recent notes list (top position)
- [ ] **Expected**: Note shows sync status: "Synced" or "Pending"
- [ ] **Expected**: Tags visible below note

### US1.4: Offline Capture

- [ ] **Step 1**: Disconnect network (DevTools → Network → "Offline")
- [ ] **Step 2**: Select text and press `Ctrl+Shift+F`
- [ ] **Expected**: Warning snackbar: "Will sync when online"
- [ ] **Expected**: Note saved locally with syncStatus: 'pending'
- [ ] **Step 3**: Reconnect network
- [ ] **Step 4**: Wait 30 seconds or click "Sync Now" in side panel
- [ ] **Expected**: Note syncs to Supabase
- [ ] **Expected**: Sync status changes to "Synced"

### US1.5: Text Length Limits

- [ ] **Step 1**: Select text > 1000 characters
- [ ] **Step 2**: Press `Ctrl+Shift+F`
- [ ] **Expected**: Warning modal: "Text too long. Maximum 1000 characters."
- [ ] **Expected**: Option to trim or cancel

---

## User Story 2: Page Summarization (P1)

### US2.1: Basic Summarization

**Site**: Long article (e.g., The Atlantic, Medium)

- [ ] **Step 1**: Navigate to [https://en.wikipedia.org/wiki/Artificial_intelligence](https://en.wikipedia.org/wiki/Artificial_intelligence)
- [ ] **Step 2**: Open side panel → Summarize tab
- [ ] **Step 3**: Select CEFR level: B1
- [ ] **Step 4**: Click "Summarize Page"
- [ ] **Expected**: Progress indicator appears
- [ ] **Expected**: Three tabs appear: "Original", "Simplified", "Translation"
- [ ] **Expected**: Summary completes within 2.5 seconds for ~5,000 words
- [ ] **Expected**: Simplified version uses B1-level vocabulary
- [ ] **Expected**: Translation matches user's target language

**Verify**:

- [ ] Summary captures main points
- [ ] Simplified version is easier to read
- [ ] Translation is accurate

### US2.2: Long Page Chunking

**Site**: Very long article (>20,000 chars)

- [ ] **Step 1**: Navigate to a long Wikipedia article (e.g., "History of the United States")
- [ ] **Step 2**: Open side panel → Summarize tab
- [ ] **Step 3**: Click "Summarize Page"
- [ ] **Expected**: Progress indicator shows chunking status (e.g., "Processing 1/3 chunks")
- [ ] **Expected**: Summary still completes within 15 seconds
- [ ] **Expected**: No errors or timeouts

### US2.3: Create Flashcards from Summary

- [ ] **Step 1**: After summarization, click "Create Flashcards" button
- [ ] **Expected**: Modal appears with extracted expressions
- [ ] **Expected**: At least 5-10 expressions suggested
- [ ] **Step 2**: Select 5 expressions, click "Add to Deck"
- [ ] **Expected**: Flashcards created and saved
- [ ] **Expected**: Confirmation message appears

---

## User Story 3: Writing Coach Overlay (P2)

### US3.1: Gmail Integration

**Site**: [https://mail.google.com](https://mail.google.com)

- [ ] **Step 1**: Open Gmail and click "Compose"
- [ ] **Step 2**: Focus on email body textarea
- [ ] **Step 3**: Press `Ctrl+Shift+K`
- [ ] **Expected**: Writing coach overlay appears next to textarea
- [ ] **Expected**: Overlay does NOT cover "Send" button or recipient fields
- [ ] **Step 4**: Type text with errors: "I would like to request a meeting. Plz let me no when your available."
- [ ] **Step 5**: Click "Check" in overlay
- [ ] **Expected**: Errors highlighted (red underlines)
- [ ] **Expected**: Suggestions appear in sidebar: "Plz" → "Please", "no" → "know", "your" → "you're"
- [ ] **Expected**: Proofreading completes within 2 seconds

**Verify**:

- [ ] All grammar errors detected
- [ ] Explanations are clear
- [ ] Overlay positioning is correct

### US3.2: Notion Integration

**Site**: [https://notion.so](https://notion.so)

- [ ] **Step 1**: Open Notion page, click to edit
- [ ] **Step 2**: Focus on contentEditable div
- [ ] **Step 3**: Press `Ctrl+Shift+K`
- [ ] **Expected**: Overlay appears correctly (handles contentEditable)
- [ ] **Expected**: No layout issues or z-index conflicts

### US3.3: Google Docs Integration

**Site**: [https://docs.google.com](https://docs.google.com)

- [ ] **Step 1**: Open Google Docs
- [ ] **Step 2**: Press `Ctrl+Shift+K`
- [ ] **Expected**: Warning message: "Writing coach not supported in iframe editors (Google Docs)"
- [ ] **Expected**: No crash or errors

### US3.4: YouTube Comments

**Site**: [https://youtube.com](https://youtube.com)

- [ ] **Step 1**: Open any YouTube video
- [ ] **Step 2**: Scroll to comments, click "Add a comment"
- [ ] **Step 3**: Press `Ctrl+Shift+K`
- [ ] **Expected**: Overlay appears next to comment textarea
- [ ] **Expected**: Overlay handles dynamically loaded textarea

### US3.5: Rewrite with Tone Adjustment

- [ ] **Step 1**: In writing coach overlay, enter text: "Hey, need help ASAP!"
- [ ] **Step 2**: Click "Rewrite" → Select "Formal" tone
- [ ] **Expected**: Rewritten version: "Hello, I would appreciate your assistance at your earliest convenience."
- [ ] **Expected**: Learning expressions highlighted (e.g., "at your earliest convenience")
- [ ] **Step 3**: Click "Add to Flashcards" on highlighted expression
- [ ] **Expected**: Expression added to flashcard deck

---

## User Story 4: Page-Based Q&A (P2)

### US4.1: Wikipedia Q&A

**Site**: [https://en.wikipedia.org/wiki/Quantum_computing](https://en.wikipedia.org/wiki/Quantum_computing)

- [ ] **Step 1**: Navigate to Wikipedia article
- [ ] **Step 2**: Open side panel → Q&A tab
- [ ] **Expected**: Page title appears in header: "Quantum computing"
- [ ] **Expected**: Content length shown (e.g., "15,234 characters")
- [ ] **Step 3**: Ask question: "What is a qubit?"
- [ ] **Step 4**: Press Enter
- [ ] **Expected**: Answer appears within 3 seconds
- [ ] **Expected**: Source quotes shown below answer with relevance scores
- [ ] **Expected**: Follow-up questions suggested (2-3)

**Verify**:

- [ ] Answer is accurate and relevant
- [ ] Source quotes match page content
- [ ] Follow-up questions are relevant

### US4.2: Highlight Source Quotes

- [ ] **Step 1**: Click on a source quote in Q&A tab
- [ ] **Expected**: Page scrolls to quote location
- [ ] **Expected**: Quote is highlighted (yellow background)
- [ ] **Expected**: Highlight fades after 5 seconds

### US4.3: Multi-Turn Q&A

- [ ] **Step 1**: Ask: "What is quantum entanglement?"
- [ ] **Step 2**: Wait for response
- [ ] **Step 3**: Ask follow-up: "How is it used in computing?"
- [ ] **Expected**: Answer references previous question context
- [ ] **Expected**: Chat history shows both Q&A pairs

### US4.4: Save Q&A as Note

- [ ] **Step 1**: After Q&A exchange, click "Save Q&A" button
- [ ] **Expected**: Note created in Capture tab
- [ ] **Expected**: Note contains question + answer
- [ ] **Expected**: Note tagged with "qa", "wikipedia", page topic

### US4.5: Tab Switch Behavior

- [ ] **Step 1**: Open Q&A tab on Page A
- [ ] **Step 2**: Switch to new tab (Page B)
- [ ] **Expected**: Q&A context updates to Page B
- [ ] **Expected**: Chat history clears
- [ ] **Expected**: Header shows Page B title

---

## User Story 5: Multimodal Input (P3)

### US5.1: Image OCR

**Site**: Any page with side panel open

- [ ] **Step 1**: Open side panel → Media tab
- [ ] **Step 2**: Click "Upload Image" button
- [ ] **Step 3**: Select image with text (e.g., screenshot of text, photo of book page)
- [ ] **Expected**: Image preview appears
- [ ] **Expected**: OCR processing completes within 2 seconds
- [ ] **Expected**: Extracted text appears with confidence score
- [ ] **Step 4**: Click "Translate & Save" button
- [ ] **Expected**: Note created with extracted text + translation

**Verify**:

- [ ] OCR accuracy (spot check)
- [ ] Confidence score reasonable (>80%)
- [ ] Translation quality

### US5.2: Image Drag-and-Drop

- [ ] **Step 1**: Drag image file from desktop to Media tab drop zone
- [ ] **Expected**: Drop zone highlights on drag-over
- [ ] **Expected**: Image uploads and processes automatically
- [ ] **Expected**: Same behavior as file picker

### US5.3: Audio Recording

- [ ] **Step 1**: In Media tab, click "Record Audio" button
- [ ] **Step 2**: Allow microphone permission
- [ ] **Step 3**: Speak for 10 seconds: "This is a test recording for the Glotian extension."
- [ ] **Step 4**: Click "Stop Recording"
- [ ] **Expected**: Audio player appears with playback controls
- [ ] **Step 5**: Click "Transcribe"
- [ ] **Expected**: Transcription completes within 8 seconds
- [ ] **Expected**: Transcribed text matches spoken words (>90% accuracy)
- [ ] **Expected**: Detected language shown (e.g., "English")

### US5.4: Audio File Upload

- [ ] **Step 1**: Click "Upload Audio" button
- [ ] **Step 2**: Select audio file (.mp3, .wav, .m4a, <4MB)
- [ ] **Expected**: Audio player appears
- [ ] **Step 3**: Click "Transcribe"
- [ ] **Expected**: Transcription completes within 8 seconds
- [ ] **Expected**: Transcribed text is accurate

### US5.5: Media Size Limits

- [ ] **Test 1**: Upload image >3MB
- [ ] **Expected**: Error message: "Image too large. Maximum 3MB."
- [ ] **Test 2**: Upload audio >4MB
- [ ] **Expected**: Error message: "Audio too large. Maximum 4MB."
- [ ] **Test 3**: Record audio >2 minutes
- [ ] **Expected**: Recording stops at 2:00, warning message appears

---

## User Story 6: Activity Feed and Sync (P2)

### US6.1: Activity Logging

- [ ] **Step 1**: Perform 5 different actions:
  1. Capture text
  2. Summarize page
  3. Ask Q&A question
  4. Upload image
  5. Record audio
- [ ] **Step 2**: Open side panel → Activity tab
- [ ] **Expected**: All 5 actions appear in activity feed
- [ ] **Expected**: Each action has correct icon and timestamp
- [ ] **Expected**: Relative timestamps (e.g., "2 minutes ago")
- [ ] **Expected**: All show syncStatus: "Synced" or "Pending"

### US6.2: Sync Status Display

- [ ] **Step 1**: Check sync status header in Activity tab
- [ ] **Expected**: Shows "● Synced" or "● Syncing" or "● Pending"
- [ ] **Expected**: Pending count shown (e.g., "3 pending")
- [ ] **Expected**: Last sync time shown (e.g., "Last sync: 2 minutes ago")

### US6.3: Manual Sync

- [ ] **Step 1**: Disconnect network
- [ ] **Step 2**: Capture 3 notes
- [ ] **Step 3**: Open Activity tab
- [ ] **Expected**: 3 items show syncStatus: "Pending"
- [ ] **Expected**: Pending count: 3
- [ ] **Step 4**: Reconnect network
- [ ] **Step 5**: Click "Sync Now" button
- [ ] **Expected**: Progress indicator appears: "Syncing 1/3 items"
- [ ] **Expected**: Sync completes within 30 seconds
- [ ] **Expected**: Toast appears: "Synced 3 items. 0 conflicts. 0 errors."
- [ ] **Expected**: All items now show syncStatus: "Synced"

### US6.4: Filtering

- [ ] **Step 1**: Click action type filter dropdown
- [ ] **Expected**: Options: All, Notes, Summaries, Q&A, Media, Coach
- [ ] **Step 2**: Select "Notes"
- [ ] **Expected**: Only note_created actions visible
- [ ] **Step 3**: Select date range filter: "Last 7 days"
- [ ] **Expected**: Only items from last 7 days visible

### US6.5: Deep Link to Web App

- [ ] **Step 1**: Click "Open in Web App" button on an activity item
- [ ] **Expected**: New tab opens with URL: `https://glotian.app/notes/{noteId}`
- [ ] **Expected**: Web app shows the note (if deployed)

---

## Performance Testing

### P1: Translation Performance

- [ ] **Test**: Capture 1000-character text
- [ ] **Expected**: Translation completes within 1.2 seconds (on-device AI)
- [ ] **Fallback**: If on-device AI unavailable, fallback to server should complete within 5 seconds

### P2: Summarization Performance

- [ ] **Test**: Summarize 5,000-character page
- [ ] **Expected**: Summary completes within 2.5 seconds

### P3: Side Panel Load Time

- [ ] **Test**: Open side panel from cold start
- [ ] **Expected**: Side panel loads within 600ms
- [ ] **Expected**: Capture tab visible immediately (lazy loading for other tabs)

### P4: Local Interaction Latency

- [ ] **Test**: Click tab navigation in side panel
- [ ] **Expected**: Tab switches within 150ms
- [ ] **Test**: Click "Sync Now" button
- [ ] **Expected**: Button state changes within 150ms

---

## Accessibility Testing

### A1: Keyboard Navigation

- [ ] **Test**: Press `Tab` key in side panel
- [ ] **Expected**: Focus moves through all interactive elements
- [ ] **Expected**: Focus visible (outline or highlight)
- [ ] **Test**: Press `Escape` key in overlay
- [ ] **Expected**: Overlay closes

### A2: Screen Reader Support

- [ ] **Test**: Enable screen reader (NVDA on Windows, VoiceOver on Mac)
- [ ] **Expected**: Side panel tabs are announced correctly
- [ ] **Expected**: Button labels are read aloud
- [ ] **Expected**: Form inputs have labels
- [ ] **Expected**: Status messages are announced (aria-live)

---

## Error Handling

### E1: Translation Timeout

- [ ] **Test**: Trigger translation with network throttling (DevTools → Network → Slow 3G)
- [ ] **Expected**: If timeout (>10s), error snackbar appears
- [ ] **Expected**: Option to retry or save without translation

### E2: AI API Unavailable

- [ ] **Test**: Disable Chrome Built-in AI (or use older Chrome version)
- [ ] **Expected**: Extension falls back to server APIs (OpenAI/Gemini)
- [ ] **Expected**: Warning message: "Using server fallback (slower)"
- [ ] **Expected**: Translation still works (within 5s)

### E3: Offline Error Handling

- [ ] **Test**: Go offline, attempt to summarize page
- [ ] **Expected**: Error message: "Cannot summarize offline. Requires internet connection."
- [ ] **Expected**: No crash or console errors

### E4: Quota Exceeded

- [ ] **Test**: (Manual simulation) Fill IndexedDB to >90% quota
- [ ] **Expected**: LRU eviction triggers automatically
- [ ] **Expected**: Oldest 20% of notes deleted (excluding pending/recent)
- [ ] **Expected**: Warning message: "Cache quota exceeded. Cleared old notes."

---

## Cross-Browser Testing

### Chrome Stable

- [ ] **Version**: **\_\_**
- [ ] All user stories pass: YES / NO
- [ ] Notes: **\_\_**

### Chrome Canary

- [ ] **Version**: **\_\_**
- [ ] All user stories pass: YES / NO
- [ ] Notes: **\_\_**

### Chrome Dev

- [ ] **Version**: **\_\_**
- [ ] All user stories pass: YES / NO
- [ ] Notes: **\_\_**

---

## Security & Privacy

### S1: Incognito Mode

- [ ] **Test**: Open incognito window
- [ ] **Expected**: Extension does NOT work by default (unless user enables in settings)
- [ ] **Test**: Enable extension in incognito
- [ ] **Expected**: Extension works, but no data persists after window close

### S2: Data Storage

- [ ] **Test**: Check chrome://extensions → Storage
- [ ] **Expected**: Data stored in IndexedDB and chrome.storage.local only
- [ ] **Expected**: No sensitive data in plain text (session tokens encrypted)

### S3: Network Requests

- [ ] **Test**: Open DevTools → Network tab
- [ ] **Expected**: Requests only to Supabase, OpenAI, Gemini APIs
- [ ] **Expected**: No tracking or analytics requests (unless user opts in)

---

## Regression Testing

### R1: After Update

- [ ] **Test**: Update extension to new version
- [ ] **Expected**: All existing data preserved (IndexedDB, chrome.storage)
- [ ] **Expected**: No migration errors
- [ ] **Expected**: All features still work

### R2: After Chrome Update

- [ ] **Test**: Update Chrome to latest version
- [ ] **Expected**: Extension still loads
- [ ] **Expected**: All features still work
- [ ] **Expected**: No console errors

---

## Final Checklist

- [ ] All user stories tested: US1-US6 ✅
- [ ] All performance targets met: P1-P4 ✅
- [ ] Accessibility checks passed: A1-A2 ✅
- [ ] Error handling verified: E1-E4 ✅
- [ ] Cross-browser testing complete: Chrome Stable/Canary/Dev ✅
- [ ] Security & privacy checks passed: S1-S3 ✅
- [ ] Regression tests passed: R1-R2 ✅

**Overall Test Result**: PASS / FAIL

**Sign-off**:

- Tester: **\*\***\_\_\_\_**\*\***
- Date: **\*\***\_\_\_\_**\*\***
- Notes: **\*\***\_\_\_\_**\*\***

---

## Known Issues

Document any bugs or issues found during testing:

1. ***
2. ***
3. ***

---

## Next Steps

- [ ] Fix critical bugs
- [ ] Re-test failed scenarios
- [ ] Submit to Chrome Web Store
- [ ] Monitor post-launch metrics
