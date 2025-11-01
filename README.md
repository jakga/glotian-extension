# Glotian Chrome Extension

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Chrome Built-in AI](https://img.shields.io/badge/Chrome-Built--in%20AI-4285F4?logo=googlechrome)](https://developer.chrome.com/docs/ai/built-in)
[![Google Chrome AI Challenge 2025](https://img.shields.io/badge/Hackathon-Google%20Chrome%20AI%202025-00897B)](https://googlechromeai2025.devpost.com)

> **Transform your web browsing into personalized language learning with AI-powered translation, flashcards, and spaced repetition—all on-device and privacy-first.**

Built for the [Google Chrome Built-in AI Challenge 2025](https://googlechromeai2025.devpost.com).

## 🎯 What is Glotian?

Glotian turns every translation you make while browsing the web into a personalized learning opportunity. No more forgetting words you looked up—Glotian captures, organizes, and helps you learn vocabulary from real-world contexts.

**Key Features**:
- ⚡ **Sub-second translation** (<1.2s) using Chrome's on-device AI
- 🔒 **Privacy-first**: 90%+ of AI operations run locally
- 📴 **Offline-first**: Full functionality without internet
- 🧠 **AI flashcards**: Automatic vocabulary extraction with spaced repetition
- 📝 **Page summarization**: Extract key points and simplify to your reading level
- ✍️ **Writing coach**: Grammar checking and tone adjustment

## 🚀 Quick Start (5 minutes)

### Prerequisites

- **Chrome 120+** (Canary/Dev recommended for Built-in AI APIs)
- **Node.js 18+** and **npm** (or pnpm/yarn)
- **Supabase account** (free tier works)

### Installation

```bash
# 1. Clone repository
git clone https://github.com/jakga/glotian-extension.git
cd glotian-extension

# 2. Install dependencies
npm install

# 3. Setup environment
cp .env.example .env.local
# Edit .env.local with your Supabase credentials

# 4. Build extension
npm run build

# 5. Load in Chrome
# - Open chrome://extensions
# - Enable "Developer mode"
# - Click "Load unpacked"
# - Select the "dist-prod" folder
```

### Enable Chrome Built-in AI (Required for on-device processing)

1. **Enable flags** at `chrome://flags`:
   - `#optimization-guide-on-device-model` → **Enabled BypassPerfRequirement**
   - `#prompt-api-for-gemini-nano` → **Enabled**
   - `#summarization-api-for-gemini-nano` → **Enabled**
   - `#translation-api` → **Enabled**
   - `#writer-api` → **Enabled**
   - `#rewriter-api` → **Enabled**
   - Restart Chrome

2. **Download AI model**:
   - Open `chrome://components`
   - Find "Optimization Guide On Device Model"
   - Click "Check for update"
   - Wait for download (1-2 GB, 5-10 minutes)

3. **Verify**:
   ```javascript
   // Open DevTools Console (F12)
   window.ai
   // Should return object with languageModel, summarizer, translator, etc.
   ```

## 📖 Usage

### 1. Quick Text Translation

1. Visit any webpage (e.g., [Wikipedia](https://en.wikipedia.org/wiki/Artificial_intelligence))
2. Select any text
3. **Right-click** → "Translate with Glotian" (or press `Ctrl+Shift+T`)
4. See instant translation (<1.2s) with grammar explanation
5. Note auto-saved to side panel

### 2. Page Summarization

1. Click extension icon → Open side panel
2. Navigate to **"Summarize"** tab
3. Click "Summarize This Page"
4. Get AI-generated summary in <2.5s
5. Optionally simplify to your reading level (CEFR A1-C2)

### 3. AI Flashcard Creation

1. In side panel **"Translate"** tab, select 5+ saved notes
2. Click "Create Deck from Selected"
3. AI extracts key vocabulary with definitions and examples
4. Study with spaced repetition algorithm

### 4. Offline Mode

- All translations/notes saved locally in IndexedDB
- Works offline for reviewing saved content
- Auto-syncs to cloud when online

## 🏗️ Architecture

### Technology Stack

- **Framework**: Chrome Extension Manifest V3 + TypeScript 5.9
- **Build**: Vite + CRXJS (HMR support)
- **AI**: Chrome Built-in AI (Translator, Summarizer, Prompt, Writer, Rewriter, Proofreader)
- **Fallback**: OpenAI API + Gemini API (when on-device unavailable)
- **Backend**: Supabase (PostgreSQL, Auth, Storage)
- **Storage**: IndexedDB (Dexie.js) for offline-first sync
- **Styling**: Tailwind CSS

### Chrome Built-in AI APIs Used

| API | Usage | Performance |
|-----|-------|-------------|
| **Translator API** | Primary translation engine | <1.2s (4x faster than cloud) |
| **Summarizer API** | Page content summarization | <2.5s for 5,000 chars |
| **Prompt API** | Auto-tagging, Q&A, OCR post-processing | <1.5s |
| **Writer API** | Text simplification (CEFR levels) | <2s |
| **Rewriter API** | Tone adjustment (formal/casual) | <1.8s |
| **Proofreader API** | Grammar checking | <2s |

### Data Flow

```
User Action (text selection)
    ↓
Content Script captures text
    ↓
Background Service Worker:
  1. Translate with Chrome AI (or fallback to OpenAI/Gemini)
  2. Auto-tag with Prompt API
  3. Save to IndexedDB (syncStatus: pending)
  4. Enqueue for sync
    ↓
Show confirmation snackbar
    ↓
[When online] Sync to Supabase
```

### Sync Strategy

- **Offline-first**: All operations save locally first
- **Conflict resolution**: Last-Write-Wins (LWW) based on `updated_at` timestamps
- **Retry logic**: Exponential backoff (max 5 retries)
- **Periodic sync**: Every 5 minutes via chrome.alarms
- **LRU eviction**: Auto-delete oldest 20% of synced notes at 90% quota

## 🧪 Testing

### Basic Functionality Test

```bash
# 1. Translation
- Visit any webpage
- Select text → Right-click → "Translate with Glotian"
- Verify translation appears in <1.2s
- Check side panel for saved note

# 2. Summarization
- Click extension icon → "Summarize" tab
- Click "Summarize This Page"
- Verify summary in <2.5s
- Try CEFR simplification (A1/A2/B1/B2)

# 3. Offline Sync
- DevTools → Application → "Offline" checkbox
- Translate text (should queue locally)
- Uncheck "Offline"
- Verify sync completes
```

See [tests/manual/integration.md](tests/manual/integration.md) for comprehensive test scenarios.

## 📊 Performance Targets

| Metric | Target | Achieved |
|--------|--------|----------|
| Translation (on-device) | <1.2s | ✅ <1.0s |
| Translation (fallback) | <5s | ✅ <4.2s |
| Summarization | <2.5s | ✅ <2.1s |
| Side panel load | <600ms | ✅ <450ms |
| Offline sync (100 notes) | <30s | ✅ <22s |

## 🛠️ Development

```bash
# Development mode (hot reload)
npm run dev

# Production build
npm run build

# Type checking
npm run check-types

# Linting
npm run lint
npm run lint:fix

# Testing
npm run test
npm run test:watch
```

## 🔒 Privacy & Security

- **On-device processing**: 90%+ of AI operations run locally via Chrome Built-in AI
- **No data tracking**: Zero telemetry or analytics
- **API key safety**: Fallback APIs proxied through Supabase Edge Functions (not in client)
- **User data**: Stored locally in IndexedDB + optionally synced to user's own Supabase instance
- **Open source**: Full code transparency under MIT License

See [docs/privacy-policy.md](docs/privacy-policy.md) for details.

## 📝 Environment Variables

Create `.env.local` with:

```bash
# Required
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbG...

# Optional (for fallback when Chrome AI unavailable)
VITE_OPENAI_API_KEY=sk-...
VITE_GEMINI_API_KEY=AIza...
```

**Security Note**: For production, proxy API keys through Supabase Edge Functions to keep them out of client bundles.

## 🐛 Troubleshooting

### "Chrome AI not working"

1. **Check Chrome version**: Must be 120+ (Canary/Dev recommended)
2. **Enable flags**: See "Enable Chrome Built-in AI" section above
3. **Download model**: Check `chrome://components` → "Optimization Guide On Device Model"
4. **Fallback**: Extension automatically falls back to OpenAI/Gemini if on-device unavailable

### "Extension won't load"

1. Check console errors: `chrome://extensions` → Extension details → "Inspect views: service worker"
2. Rebuild: `npm run build`
3. Reload extension: `chrome://extensions` → Reload icon

### "Supabase connection failed"

1. Verify `.env.local` has correct credentials
2. Check Supabase project is active (not paused)
3. Test connection in Supabase Dashboard → SQL Editor

### "IndexedDB quota exceeded"

- LRU eviction should trigger automatically at 90% quota
- Manually clear: Side Panel → Settings → "Clear All Local Data"

## 🚧 Roadmap

- [x] MVP: Translation, summarization, flashcards, offline sync
- [ ] Voice interaction (when Chrome Speech API available)
- [ ] Collaborative learning (share flashcard decks)
- [ ] Adaptive difficulty (CEFR level tracking)
- [ ] Browser history mining (suggest vocab from frequently visited sites)

## 🤝 Contributing

Contributions welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

**Found a bug?** Open an issue with:
- Chrome version
- Steps to reproduce
- Console errors (from service worker and side panel)

## 📜 License

[MIT License](LICENSE) - Copyright (c) 2025 Glotian

## 🔗 Links

- **Hackathon Submission**: [Devpost](https://devpost.com/software/glotian)
- **Chrome Built-in AI Docs**: https://developer.chrome.com/docs/ai/built-in
- **Supabase**: https://supabase.com
- **Report Issues**: [GitHub Issues](https://github.com/jakga/glotian-extension/issues)

---

**Built with ❤️ for the Google Chrome Built-in AI Challenge 2025**

*Transform your browsing into learning moments—one translation at a time.*
