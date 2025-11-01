# Chrome Web Store Listing - Glotian

**Status**: DRAFT
**Version**: 1.0.0
**Last Updated**: 2025-10-17

---

## Extension Name

**English**: Glotian - AI Language Learning Assistant
**Korean**: Glotian - AI 언어 학습 도우미

**Character Count**: 40 (under 45-char limit) ✅

---

## Tagline / Subtitle

**English**: Transform web browsing into learning moments with instant AI-powered translation and study tools

**Korean**: AI 기반 번역과 학습 도구로 웹 브라우징을 학습의 순간으로 변화시키세요

**Character Count**: 95 (under 132-char limit) ✅

---

## Short Description (132 characters max)

**English**:
Capture text, translate instantly, and create flashcards from any webpage with Chrome's Built-in AI. Learn languages while browsing!

**Korean**:
웹페이지에서 텍스트를 캡처하고 즉시 번역하며 플래시카드를 생성하세요. Chrome 내장 AI로 브라우징하며 언어를 배우세요!

**Character Count**: 128 ✅

---

## Detailed Description (16,000 characters max)

### Overview

Glotian transforms your everyday web browsing into powerful language learning moments. Capture translations instantly, summarize articles at your reading level, and get real-time writing assistance—all powered by Chrome's Built-in AI for lightning-fast, privacy-respecting performance.

**🎯 Perfect for:**

- Language learners who want to learn from real-world content
- Bilingual readers who encounter unfamiliar words while browsing
- Students studying foreign languages
- Anyone who wants to improve their writing in a second language

### ✨ Key Features

#### 🔤 **Instant Text Capture & Translation** (Priority: High)

- Select any text on any webpage
- Press `Ctrl+Shift+F` (or right-click "Save to Glotian")
- Get instant translation with grammar explanations
- Auto-generated tags for easy organization
- **Performance**: <1.2 seconds using Chrome Built-in AI

#### 📄 **Smart Page Summarization** (Priority: High)

- Summarize long articles with one click
- Adjust reading level (A1-C2 CEFR) for language learners
- Get three versions: Original, Simplified, Translated
- Perfect for research and study

#### ✍️ **AI Writing Coach** (Priority: Medium)

- Real-time grammar and spelling corrections
- Tone adjustment (formal ↔ casual)
- Works on Gmail, Notion, YouTube comments, and more
- Privacy-focused: processing happens on-device
- **Performance**: <2 seconds for proofreading

#### 💬 **Page-Based Q&A** (Priority: Medium)

- Ask questions about the current webpage
- Get answers with source quotes highlighted
- Perfect for understanding complex documentation
- Multi-turn conversations with context

#### 🎤 **Multimodal Input** (Priority: Low)

- OCR: Extract text from images (<2s)
- Audio transcription: Convert speech to text (<8s)
- Translate captured content instantly

#### 📊 **Activity Feed & Sync** (Priority: Medium)

- Track all your learning activities
- Sync notes across mobile and web apps
- Offline-first: works without internet, syncs when online
- Manual sync control and status monitoring

### 🚀 Performance & Privacy

**Lightning-Fast Performance**:

- Translation: <1.2s (on-device AI) vs. 5s (server fallback)
- Summarization: <2.5s for 5,000-character pages
- Writing Coach: <2s for proofreading
- All powered by Chrome's Built-in AI

**Privacy-Respecting**:

- **On-device AI**: Your data never leaves your computer when using Chrome's Built-in AI
- **No tracking**: We don't collect browsing history or personal information
- **Transparent sync**: Only captured notes sync to your Supabase account (optional)
- **Incognito mode**: Opt-in only

### 🔧 Technical Highlights

**Chrome Built-in AI Integration**:

- Translator API for instant translation
- Summarizer API for content summarization
- Prompt API for Q&A and OCR
- Writer, Rewriter, Proofreader APIs for writing assistance

**Offline Support**:

- Notes and flashcards viewable offline
- Automatic sync when back online
- Smart conflict resolution (Last-Write-Wins)

**Cross-Platform Sync**:

- Works seamlessly with Glotian mobile and web apps
- Shared Supabase database
- Same account across all platforms

### 📚 Supported Languages

**UI Languages**: English, Korean

**Learning Languages** (13 total):
English, Spanish, Chinese (Simplified), Chinese (Traditional), French, German, Japanese, Korean, Italian, Portuguese, Russian, Arabic, Hindi

### 🎓 Use Cases

**For Students**:

- Capture vocabulary from research papers
- Summarize academic articles at your reading level
- Practice writing essays with AI feedback

**For Professionals**:

- Translate business emails and documents
- Proofread important messages before sending
- Learn industry jargon in a foreign language

**For Travelers**:

- Understand foreign websites and booking pages
- Translate reviews and recommendations
- Build vocabulary for your destination

**For Content Creators**:

- Research topics in multiple languages
- Improve writing quality with AI suggestions
- Learn from international sources

### 🔐 Permissions Explained

**Why we need these permissions:**

- **Read and change data on all websites** (`<all_urls>`):
  - To capture selected text from any webpage
  - To inject the writing coach overlay
  - To extract page content for summarization
  - ⚠️ We DO NOT read passwords, cookies, or track your browsing

- **Storage**:
  - To save your notes and settings locally (offline support)
  - IndexedDB for cached notes (~50MB max)

- **Context Menus**:
  - To add "Save to Glotian" right-click option

- **Side Panel**:
  - To display the main Glotian interface

- **Alarms**:
  - For periodic sync (every 5 minutes)

### 🛠️ How to Get Started

1. **Install the extension**
2. **Create a Supabase account** (free tier available): https://supabase.com
3. **Copy your Supabase credentials** from your project dashboard
4. **Configure the extension** in Settings (click extension icon → Settings)
5. **Start learning!** Select text on any webpage and press `Ctrl+Shift+F`

### 💡 Tips & Tricks

- **Keyboard Shortcuts**:
  - `Ctrl+Shift+F`: Capture text
  - `Ctrl+Shift+S`: Summarize page
  - `Ctrl+Shift+K`: Open Writing Coach
  - `Ctrl+Shift+E`: Open Side Panel

- **Chrome Flags** (for best performance):
  - Enable Chrome Built-in AI flags at `chrome://flags`
  - Search for "Prompt API", "Summarization API", "Translation API"
  - Requires Chrome 120+ (Canary/Dev channels)

- **Offline Mode**:
  - Captured notes remain accessible offline
  - Automatic sync when internet returns
  - Manual "Sync Now" button in Activity tab

### 🆘 Support & Feedback

- **Documentation**: See README.md in the extension folder
- **Issues**: Report bugs at https://github.com/GlotianHQ/glotian/issues
- **Email**: support@glotian.app (not yet active)

### 🗺️ Roadmap

**Coming Soon**:

- Spaced repetition flashcard system
- Browser-based pronunciation practice
- Collaborative study groups
- More language pairs
- Safari and Firefox versions

### 📄 Legal

- **Privacy Policy**: See /privacy-policy
- **Terms of Service**: See /terms-of-service
- **Open Source**: MIT License (code available on GitHub)

---

## Category

**Primary**: Productivity
**Secondary**: Education

---

## Screenshots (5-8 recommended)

### Screenshot 1: Text Capture with Translation

**Caption**: "Capture any text and get instant translation with grammar explanations"
**Size**: 1280x800px (16:10 aspect ratio)
**Content**:

- Wikipedia article with selected text
- Translation snackbar appearing
- "Create Flashcards" and "View Note" buttons visible

### Screenshot 2: Page Summarization

**Caption**: "Summarize long articles at your reading level (CEFR A1-C2)"
**Size**: 1280x800px
**Content**:

- Side panel showing Summarize tab
- Three-tab view: Original, Simplified, Translation
- CEFR level selector showing B1

### Screenshot 3: Writing Coach Overlay

**Caption**: "Real-time grammar corrections and writing suggestions"
**Size**: 1280x800px
**Content**:

- Gmail compose window
- Writing coach overlay with corrections highlighted
- Sidebar showing error explanations

### Screenshot 4: Page-Based Q&A

**Caption**: "Ask questions about any webpage and get answers with sources"
**Size**: 1280x800px
**Content**:

- Technical documentation page
- Q&A tab with chat interface
- Source quotes highlighted on page

### Screenshot 5: Activity Feed & Sync

**Caption**: "Track all your learning activities and sync across devices"
**Size**: 1280x800px
**Content**:

- Activity tab showing recent actions
- Sync status header (Synced/Pending)
- Filter options (action type, date range)

### Screenshot 6: Multimodal Input (Optional)

**Caption**: "Extract text from images or transcribe audio"
**Size**: 1280x800px
**Content**:

- Media tab with image upload
- OCR result displayed
- "Translate & Save" button

### Screenshot 7: Settings Page (Optional)

**Caption**: "Customize keyboard shortcuts, languages, and AI preferences"
**Size**: 1280x800px
**Content**:

- Settings modal
- Language pair selectors
- AI fallback toggle
- Keyboard shortcut customization

### Screenshot 8: Mobile & Web Integration (Optional)

**Caption**: "Seamlessly sync with Glotian mobile and web apps"
**Size**: 1280x800px
**Content**:

- Side-by-side view of extension + mobile app
- Same note visible on both
- Sync status indicators

---

## Promotional Tile (440x280px)

**Design Elements**:

- Glotian logo (centered)
- Gradient background (blue → purple)
- Tagline: "Learn Languages While Browsing"
- Chrome Built-in AI badge (bottom right)

---

## Small Promotional Tile (marquee) (1400x560px)

**Design Elements**:

- Large Glotian logo (left)
- Key feature icons (center): Translation, Summarization, Writing Coach, Q&A
- Tagline: "AI-Powered Language Learning for Chrome"
- Chrome Web Store badge (right)

---

## Video / Demo (Optional, recommended)

**Duration**: 30-60 seconds

**Script**:

1. Open Chrome, navigate to Wikipedia article
2. Select text, press Ctrl+Shift+F
3. Translation snackbar appears instantly
4. Click "View Note" → Side panel opens
5. Switch to Summarize tab → Click "Summarize Page"
6. Show three-tab result (Original, Simplified, Translation)
7. Switch to Q&A tab → Ask question → Get answer with sources
8. Close with tagline: "Glotian - Learn Languages While Browsing"

---

## Website URL

https://glotdojo.com

---

## Support URL

https://github.com/GlotianHQ/glotian/issues

---

## Privacy Policy URL

https://glotdojo.com/privacy (see privacy-policy.md)

---

## Pricing

**Free** (with optional paid features via Supabase Pro)

---

## Target Audience

- Age: 13+
- Interests: Language learning, education, productivity, reading
- Geographies: Global (primary: US, EU, Asia)

---

## Keywords (20 max)

1. language learning
2. translation
3. flashcards
4. AI assistant
5. Chrome AI
6. writing coach
7. grammar checker
8. summarization
9. study tool
10. productivity
11. education
12. multilingual
13. vocabulary
14. CEFR
15. reading level
16. proofreading
17. OCR
18. transcription
19. offline sync
20. Supabase

---

## Developer Info

**Developer Name**: Glotian Team
**Email**: dev@glotian.app
**Website**: https://glotdojo.com
**Address**: (Required for Chrome Web Store - fill in actual address)

---

## Review Checklist

Before submission, ensure:

- [ ] All 5-8 screenshots are 1280x800px
- [ ] Promotional tiles are correct sizes (440x280, 1400x560)
- [ ] Privacy policy URL is publicly accessible
- [ ] Support email is monitored
- [ ] Description is under 16,000 characters
- [ ] All permissions are justified in description
- [ ] Demo video is uploaded (optional but recommended)
- [ ] Extension builds successfully without errors
- [ ] Manual QA passed (see tests/manual/integration.md)
- [ ] Version number matches manifest.json (1.0.0)
- [ ] Supabase credentials are NOT hardcoded
- [ ] Origin Trial tokens are updated with final extension ID

---

## Submission Notes

**Version 1.0.0 - Initial Release**

- Complete implementation of 6 user stories
- Chrome Built-in AI integration with OpenAI/Gemini fallback
- Offline-first architecture with sync
- Cross-platform compatibility (extension + mobile + web)
- Privacy-focused: on-device AI processing
- Performance optimized: <1.2s translation, <2.5s summarization

**Known Limitations**:

- Chrome 120+ required for Built-in AI (fallback works on older versions)
- Some websites may block content script injection (e.g., Chrome Web Store itself)
- Incognito mode requires explicit user permission
- Writing coach overlay may not work on iframe-based editors (e.g., Google Docs)

**Post-Launch Plan**:

- Monitor user feedback via GitHub Issues
- Address compatibility issues reported by users
- Expand language support based on demand
- Integrate spaced repetition flashcard system (Phase 10)

---

## Localization (Optional)

**Korean Translation** (한국어 번역):

### 이름

Glotian - AI 언어 학습 도우미

### 부제

AI 기반 번역과 학습 도구로 웹 브라우징을 학습의 순간으로 변화시키세요

### 짧은 설명

웹페이지에서 텍스트를 캡처하고 즉시 번역하며 플래시카드를 생성하세요. Chrome 내장 AI로 브라우징하며 언어를 배우세요!

### 상세 설명

Glotian은 일상적인 웹 브라우징을 강력한 언어 학습의 순간으로 변화시킵니다. 즉시 번역을 캡처하고, 읽기 수준에 맞춰 기사를 요약하며, 실시간 작문 도움을 받으세요. 모두 Chrome 내장 AI로 빠르고 개인정보를 보호하는 성능을 제공합니다.

**🎯 이상적인 사용자:**

- 실제 콘텐츠에서 배우고 싶은 언어 학습자
- 브라우징 중 낯선 단어를 마주치는 이중언어 사용자
- 외국어를 공부하는 학생
- 제2 언어로 작문 실력을 향상시키고 싶은 모든 사람

### ✨ 주요 기능

#### 🔤 **즉시 텍스트 캡처 및 번역** (우선순위: 높음)

- 모든 웹페이지의 텍스트 선택
- `Ctrl+Shift+F`을 누르거나 우클릭으로 "Glotian에 저장"
- 문법 설명과 함께 즉시 번역 제공
- 쉬운 정렬을 위한 자동 태그 생성
- **성능**: Chrome 내장 AI를 사용하여 1.2초 미만

#### 📄 **스마트 페이지 요약** (우선순위: 높음)

- 한 번의 클릭으로 긴 기사 요약
- 읽기 수준 조정 (A1-C2 CEFR)
- 세 가지 버전 제공: 원문, 간단한 버전, 번역본
- 연구 및 학습에 최적

#### ✍️ **AI 작문 코치** (우선순위: 중간)

- 실시간 문법 및 철자 교정
- 톤 조정 (정중함 ↔ 캐주얼)
- Gmail, Notion, YouTube 댓글 등에서 작동
- 개인정보 보호 중심: 처리는 기기 내에서 수행
- **성능**: 교정에 2초 미만

#### 💬 **페이지 기반 질문 및 답변** (우선순위: 중간)

- 현재 웹페이지에 대한 질문
- 출처 인용이 강조된 답변
- 복잡한 문서 이해에 완벽
- 맥락을 포함한 멀티턴 대화

#### 🎤 **멀티모달 입력** (우선순위: 낮음)

- OCR: 이미지에서 텍스트 추출 (2초 미만)
- 음성 변환: 음성을 텍스트로 변환 (8초 미만)
- 캡처된 콘텐츠 즉시 번역

#### 📊 **활동 피드 및 동기화** (우선순위: 중간)

- 모든 학습 활동 추적
- 모바일 및 웹 앱 간 노트 동기화
- 오프라인 우선: 인터넷 없이 작동, 온라인 시 동기화
- 수동 동기화 제어 및 상태 모니터링

### 🚀 성능 및 개인정보 보호

**번개같은 빠른 성능**:

- 번역: 1.2초 미만 (기기 내 AI) vs. 5초 (서버 대체)
- 요약: 5,000자 페이지의 경우 2.5초 미만
- 작문 코치: 교정에 2초 미만
- 모두 Chrome 내장 AI로 구동

**개인정보 보호**:

- **기기 내 AI**: Chrome 내장 AI 사용 시 데이터가 컴퓨터를 떠나지 않음
- **추적 없음**: 검색 기록이나 개인정보 수집 안 함
- **투명한 동기화**: 캡처된 노트만 Supabase 계정으로 동기화 (선택사항)
- **시크릿 모드**: 옵트인 전용

### 🔧 기술 하이라이트

**Chrome 내장 AI 통합**:

- 즉시 번역용 Translator API
- 콘텐츠 요약용 Summarizer API
- 질문 및 OCR용 Prompt API
- 작문 지원용 Writer, Rewriter, Proofreader API

**오프라인 지원**:

- 오프라인에서 노트 및 플래시카드 볼 수 있음
- 온라인 복구 시 자동 동기화
- 스마트 충돌 해결 (마지막 쓰기 우선)

**크로스 플랫폼 동기화**:

- Glotian 모바일 및 웹 앱과 완벽하게 작동
- 공유 Supabase 데이터베이스
- 모든 플랫폼에서 동일한 계정

### 📚 지원 언어

**UI 언어**: 영어, 한국어

**학습 언어** (총 13개):
영어, 스페인어, 중국어 (간체), 중국어 (번체), 프랑스어, 독일어, 일본어, 한국어, 이탈리아어, 포르투갈어, 러시아어, 아랍어, 힌디어

### 🎓 사용 사례

**학생을 위해**:

- 연구논문에서 어휘 캡처
- 읽기 수준에 맞는 학술 기사 요약
- AI 피드백으로 에세이 작문 연습

**전문가를 위해**:

- 비즈니스 이메일 및 문서 번역
- 발송 전 중요 메시지 교정
- 외국어로 업계 용어 학습

**여행객을 위해**:

- 외국 웹사이트 및 예약 페이지 이해
- 리뷰 및 추천 번역
- 목적지에 대한 어휘 구축

**콘텐츠 크리에이터를 위해**:

- 여러 언어의 주제 연구
- AI 제안으로 작문 품질 개선
- 국제 출처에서 배우기

### 🔐 권한 설명

**이러한 권한이 필요한 이유:**

- **모든 웹사이트의 데이터 읽기 및 변경** (`<all_urls>`):
  - 모든 웹페이지에서 선택한 텍스트 캡처
  - 작문 코치 오버레이 주입
  - 요약용 페이지 콘텐츠 추출
  - ⚠️ 비밀번호, 쿠키 또는 브라우징 추적 안 함

- **저장소**:
  - 로컬 노트 및 설정 저장 (오프라인 지원)
  - 캐시된 노트용 IndexedDB (~최대 50MB)

- **컨텍스트 메뉴**:
  - "Glotian에 저장" 우클릭 옵션 추가

- **측면 패널**:
  - Glotian 주 인터페이스 표시

- **알람**:
  - 정기적 동기화 (5분마다)

### 🛠️ 시작하기

1. **확장 프로그램 설치**
2. **Supabase 계정 생성** (무료 계층 제공): https://supabase.com
3. **Supabase 자격증명 복사** (프로젝트 대시보드에서)
4. **확장 프로그램 구성** (확장 프로그램 아이콘 클릭 → 설정)
5. **학습 시작!** 모든 웹페이지에서 텍스트를 선택하고 `Ctrl+Shift+F` 누르기

### 💡 팁과 트릭

- **키보드 단축키**:
  - `Ctrl+Shift+F`: 텍스트 캡처
  - `Ctrl+Shift+S`: 페이지 요약
  - `Ctrl+Shift+K`: 작문 코치 열기
  - `Ctrl+Shift+E`: 측면 패널 열기

- **Chrome 플래그** (최고 성능):
  - `chrome://flags`에서 Chrome 내장 AI 플래그 활성화
  - "Prompt API", "Summarization API", "Translation API" 검색
  - Chrome 120+ (Canary/Dev 채널)

- **오프라인 모드**:
  - 캡처된 노트는 오프라인에서 접근 가능
  - 인터넷 복구 시 자동 동기화
  - 활동 탭의 수동 "지금 동기화" 버튼

### 🆘 지원 및 피드백

- **문서**: 확장 프로그램 폴더의 README.md 참조
- **문제 보고**: https://github.com/GlotianHQ/glotian/issues
- **이메일**: support@glotian.app (아직 활성화 안 함)

### 🗺️ 로드맵

**곧 출시:**

- 간격 반복 플래시카드 시스템
- 브라우저 기반 발음 연습
- 협력 학습 그룹
- 더 많은 언어 쌍
- Safari 및 Firefox 버전

### 📄 법적 사항

- **개인정보 보호정책**: /privacy-policy 참조
- **서비스 약관**: /terms-of-service 참조
- **오픈소스**: MIT 라이선스 (GitHub에서 코드 제공)

### 🖼️ 스크린샷

#### 스크린샷 1: 번역이 포함된 텍스트 캡처

**설명**: "텍스트를 캡처하고 문법 설명과 함께 즉시 번역받기"

#### 스크린샷 2: 페이지 요약

**설명**: "긴 기사를 읽기 수준(CEFR A1-C2)에 맞춰 요약"

#### 스크린샷 3: 작문 코치 오버레이

**설명**: "실시간 문법 교정 및 작문 제안"

#### 스크린샷 4: 페이지 기반 질문 및 답변

**설명**: "모든 웹페이지에 대해 질문하고 출처와 함께 답변받기"

#### 스크린샷 5: 활동 피드 및 동기화

**설명**: "모든 학습 활동 추적 및 기기 간 동기화"

#### 스크린샷 6: 멀티모달 입력 (선택사항)

**설명**: "이미지에서 텍스트 추출 또는 음성 변환"

#### 스크린샷 7: 설정 페이지 (선택사항)

**설명**: "키보드 단축키, 언어 및 AI 선호도 맞춤화"

#### 스크린샷 8: 모바일 및 웹 통합 (선택사항)

**설명**: "Glotian 모바일 및 웹 앱과 완벽하게 동기화"

---

**END OF STORE LISTING DRAFT**
