# Kasbah Phase 5C: Cross-Browser Compatibility Testing

**Requirement**: All 5 browser extensions must be IDENTICAL and fully functional across platforms.

**Test Date**: March 1, 2026
**Status**: Ready for QA Testing
**Timeline**: 4-6 hours per browser (20-24 hours total)

---

## Browser Coverage (5 Extensions)

| Browser | Store | Extension ID | Status | MD5 Hash |
|---------|-------|--------------|--------|----------|
| **Chrome** | Chrome Web Store | `TBD` | ✅ Ready | `054ff81a...` |
| **Firefox** | Mozilla AMO | `TBD` | ✅ Ready | `054ff81a...` |
| **Edge** | Microsoft Store | `TBD` | ✅ Ready | `054ff81a...` |
| **Opera** | Opera Add-ons | `TBD` | ✅ Ready | `054ff81a...` |
| **Safari** | Safari App Store | `TBD` | ✅ Ready | `054ff81a...` |

---

## Core Functionality Test Matrix

### 1. Detector.js Verification (ALL 6 COPIES IDENTICAL)

**Test**: Core detection engine works identically across all platforms.

```
Test Case: detector.js selfTest()
Expected: 29/29 PASS on all browsers
File: kasbah-guard-dist/extensions/*/src/detector.js
MD5: 054ff81a84955026444b945bffd1d0d8 (exact match on all 6 copies)
```

**Test Procedures**:

1. **Chrome Extension**
   - [ ] Open `chrome://extensions`
   - [ ] Enable "Developer mode"
   - [ ] Load unpacked: `kasbah-guard-dist/extensions/chrome/`
   - [ ] Open DevTools console
   - [ ] Execute: `detector.selfTest()`
   - [ ] ✅ Expect: `29/29 PASS`

2. **Firefox Extension**
   - [ ] Open `about:debugging#/runtime/this-firefox`
   - [ ] Click "Load Temporary Add-on"
   - [ ] Select `kasbah-guard-dist/extensions/firefox/manifest.json`
   - [ ] Open Browser Console (Ctrl+Shift+K)
   - [ ] Execute: `detector.selfTest()`
   - [ ] ✅ Expect: `29/29 PASS`

3. **Edge Extension**
   - [ ] Open `edge://extensions`
   - [ ] Enable "Developer mode"
   - [ ] Click "Load unpacked"
   - [ ] Select `kasbah-guard-dist/extensions/edge/`
   - [ ] Open DevTools console
   - [ ] Execute: `detector.selfTest()`
   - [ ] ✅ Expect: `29/29 PASS`

4. **Opera Extension**
   - [ ] Open `opera://extensions`
   - [ ] Enable "Developer mode"
   - [ ] Click "Load unpacked extension"
   - [ ] Select `kasbah-guard-dist/extensions/opera/`
   - [ ] Open DevTools console
   - [ ] Execute: `detector.selfTest()`
   - [ ] ✅ Expect: `29/29 PASS`

5. **Safari Extension** (macOS only)
   - [ ] Open Safari → Develop → Allow Unsigned Extensions
   - [ ] Load extension from `kasbah-guard-dist/extensions/safari/`
   - [ ] Open Web Inspector
   - [ ] Execute: `detector.selfTest()`
   - [ ] ✅ Expect: `29/29 PASS`

---

### 2. Content.js Egress Gate (18 MOATS)

**Test**: Content script properly intercepts all exfiltration vectors.

```
Test Case: 18-Moat Egress Gate
File: kasbah-guard-dist/extensions/*/src/content.js
MD5: 51961596422dd31bf0b1ce6e016e413a (exact match on all 7 copies)
Requirement: All moats must be active and not blocking legitimate traffic
```

**Test Procedures**:

#### Moat 1: document_start + MAIN world
- [ ] Verify manifest.json has `"run_at": "document_start"`
- [ ] Verify manifest.json has `"world": "MAIN"`
- [ ] Navigate to ChatGPT, Claude, Gemini, DeepSeek
- [ ] ✅ Expect: No console errors, extension loads before page scripts

#### Moats 2-7: API Hook Interception (fetch, XHR, beacon, WebSocket, form, window.open)
- [ ] Open https://chatgpt.com
- [ ] Open DevTools → Network tab
- [ ] Ask ChatGPT: "Analyze this image: [deepfake image]"
- [ ] ✅ Expect: Modal appears before sending
- [ ] ✅ Expect: User can choose "Allow" or "Deny"

#### Moat 8: MutationObserver (src attribute scanning)
- [ ] Open https://www.instagram.com
- [ ] Attempt to upload a deepfake image
- [ ] ✅ Expect: Upload guard modal appears
- [ ] ✅ Expect: File is scanned before upload

#### Moat 9: Base64 Decode + Pattern Scanning
- [ ] Test sending base64-encoded deepfake content
- [ ] ✅ Expect: Detector.js catches decoded payload
- [ ] ✅ Expect: Modal blocks transmission

#### Moats 10-11: Shannon Entropy + 22-Pattern Detector
- [ ] Send synthetic deepfake to ChatGPT
- [ ] ✅ Expect: Detector.js identifies as deepfake
- [ ] ✅ Expect: Confidence score displayed

#### Moat 12: <all_urls> Manifest Coverage
- [ ] Verify manifest has `"matches": ["<all_urls>"]`
- [ ] Test on random websites (e.g., reddit, github)
- [ ] ✅ Expect: Extension active on all sites
- [ ] ✅ Expect: No 404s in console

#### Moat 13: Zero-Latency Local Detection
- [ ] Disconnect from internet
- [ ] Use extension offline
- [ ] ✅ Expect: Detection still works
- [ ] ✅ Expect: No server calls made

#### Moats 14-18: Advanced Bypass Protection
- [ ] Open DevTools → Console
- [ ] Test window.name exfiltration
- [ ] Test SharedWorker bypass
- [ ] Test RTCDataChannel bypass
- [ ] ✅ Expect: All are blocked or detected

---

### 3. Dashboard Panel Rendering

**Test**: All dashboard panels render correctly and fetch data.

```
Test Panels:
1. Spatial Analysis Panel
2. Generator Attribution Panel
3. Ethics Framework Panel
4. Federation Analytics Panel
5. Admin Dashboard (Phase 4 panels maintained)
```

**Test Procedures for Each Panel**:

1. **Spatial Analysis Panel**
   - [ ] Open extension popup
   - [ ] Click "Spatial Analysis" tab
   - [ ] ✅ Expect: 4 metric cards display (Geometry, Physics, Lighting, Overall)
   - [ ] ✅ Expect: Progress bars animate
   - [ ] ✅ Expect: Real-time updates every 5 seconds
   - [ ] ✅ Expect: No console errors

2. **Generator Attribution Panel**
   - [ ] Open extension popup
   - [ ] Click "Generator Attribution" tab
   - [ ] ✅ Expect: AI generator name displays
   - [ ] ✅ Expect: Vendor name shows
   - [ ] ✅ Expect: Confidence bar shows percentage
   - [ ] ✅ Expect: Last updated timestamp displays

3. **Ethics Framework Panel**
   - [ ] Open extension popup
   - [ ] Click "Ethics Framework" tab
   - [ ] ✅ Expect: 5 Maqasid objectives display with scores
   - [ ] ✅ Expect: Color-coded severity (red=violation, green=compliant)
   - [ ] ✅ Expect: Partnership models list available

4. **Federation Analytics Panel**
   - [ ] Open extension popup
   - [ ] Click "Federation" tab
   - [ ] ✅ Expect: Participant count displays
   - [ ] ✅ Expect: Current round number shows
   - [ ] ✅ Expect: Average reputation metric displays
   - [ ] ✅ Expect: Model update count shows

---

### 4. API Endpoint Availability

**Test**: All 28 Kasbah API endpoints are accessible and return proper responses.

```
Base URL: https://api.bekasbah.com
Endpoints: 28 across 9 feature groups
```

**Test Procedures**:

```bash
# Health check
curl https://api.bekasbah.com/health
# Expected: {"ok":true}

# Spatial endpoints
curl -X POST https://api.bekasbah.com/api/kasbah/spatial/analyze \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"image": {"base64": "..."}}'
# Expected: 200 OK, spatial analysis results

# Generator endpoints
curl https://api.bekasbah.com/api/kasbah/generator/list
# Expected: 200 OK, list of generators

# All endpoints should return 200 or appropriate error codes
```

**Checklist**:
- [ ] `/health` returns 200
- [ ] `/api/kasbah/spatial/*` returns 200
- [ ] `/api/kasbah/generator/*` returns 200
- [ ] `/api/kasbah/calibration/*` returns 200
- [ ] `/api/kasbah/ethics/*` returns 200
- [ ] `/api/kasbah/crypto/*` returns 200
- [ ] `/api/kasbah/passport/*` returns 200
- [ ] `/api/kasbah/zk/*` returns 200
- [ ] `/api/kasbah/verification/*` returns 200
- [ ] `/api/kasbah/federation/*` returns 200
- [ ] Rate limiting headers present (X-RateLimit-*)
- [ ] CORS headers correct
- [ ] Security headers present (CSP, HSTS, etc.)

---

### 5. Offline Mode Graceful Degradation

**Test**: Extension works offline with 2-minute grace period.

```
Requirement: Offline operation for 2 minutes with cached data
API calls fail gracefully when offline
```

**Test Procedures**:

1. **Disconnect Network**
   - [ ] Open extension
   - [ ] Disable internet connection
   - [ ] ✅ Expect: Extension still shows cached results
   - [ ] ✅ Expect: "Offline Mode" badge appears
   - [ ] ✅ Expect: No error popups

2. **Grace Period (120 seconds)**
   - [ ] Open extension in offline mode
   - [ ] Timer starts counting down
   - [ ] After 120 seconds
   - [ ] ✅ Expect: Warning modal appears
   - [ ] ✅ Expect: "Reconnect to internet" message

3. **Reconnection**
   - [ ] Restore internet connection
   - [ ] Open extension
   - [ ] ✅ Expect: Fresh API data fetched
   - [ ] ✅ Expect: Offline badge disappears
   - [ ] ✅ Expect: Cache updated

---

### 6. Localization (8 Languages)

**Test**: UI renders correctly in all 8 languages.

```
Languages: English, Spanish, French, German, Chinese, Japanese, Arabic, Hindi
Auto-detection based on browser language
```

**Test Procedures**:

1. **English (en)**
   - [ ] Set browser language to English
   - [ ] Open extension popup
   - [ ] ✅ Expect: All text in English
   - [ ] ✅ Expect: No [MISSING KEY] messages

2. **Spanish (es)**
   - [ ] Set browser language to Spanish
   - [ ] Open extension popup
   - [ ] ✅ Expect: Popup translates to Spanish
   - [ ] ✅ Expect: Modal messages in Spanish
   - [ ] ✅ Expect: Dashboard panels translated

3. **French (fr)**
   - [ ] Set browser language to French
   - [ ] ✅ Expect: All UI in French
   - [ ] ✅ Expect: Correct character encoding (accents, etc.)

4. **German (de)**
   - [ ] Set browser language to German
   - [ ] ✅ Expect: UI in German
   - [ ] ✅ Expect: Umlauts (ü, ö, ä) render correctly

5. **Chinese (zh)**
   - [ ] Set browser language to Chinese (Simplified or Traditional)
   - [ ] ✅ Expect: UI in Chinese
   - [ ] ✅ Expect: No character substitution
   - [ ] ✅ Expect: Proper line breaking

6. **Japanese (ja)**
   - [ ] Set browser language to Japanese
   - [ ] ✅ Expect: UI in Japanese
   - [ ] ✅ Expect: Hiragana/Kanji render correctly

7. **Arabic (ar)**
   - [ ] Set browser language to Arabic
   - [ ] ✅ Expect: UI in Arabic
   - [ ] ✅ Expect: RTL layout applied
   - [ ] ✅ Expect: Text reads right-to-left

8. **Hindi (hi)**
   - [ ] Set browser language to Hindi
   - [ ] ✅ Expect: UI in Hindi
   - [ ] ✅ Expect: Devanagari script renders correctly

---

### 7. Phase 4 Regression Testing

**Critical**: All Phase 4 features must continue working after Phase 5C changes.

```
Phase 4 Features to Verify:
1. Red-Team Simulator
2. Cryptographic Receipts
3. Source Integrity Index (SII)
4. Canary Deployment
5. Admin Dashboard (all panels)
```

**Test Procedures**:

1. **Red-Team Simulator**
   - [ ] Open admin dashboard
   - [ ] Click "Red-Team Simulator"
   - [ ] Generate test synthetic deepfake
   - [ ] ✅ Expect: Detection score > 0.8
   - [ ] ✅ Expect: Verdict = "deepfake"
   - [ ] ✅ Expect: Confidence properly calibrated

2. **Cryptographic Receipts**
   - [ ] Detect a deepfake
   - [ ] ✅ Expect: Receipt generated with signature
   - [ ] ✅ Expect: Receipt downloadable as PDF
   - [ ] ✅ Expect: Signature verifiable with public key

3. **Source Integrity Index (SII)**
   - [ ] Open admin dashboard
   - [ ] Navigate to source analysis
   - [ ] ✅ Expect: SII scores for each source
   - [ ] ✅ Expect: Historical trend visible
   - [ ] ✅ Expect: Risk level indicator

4. **Canary Deployment**
   - [ ] Check admin dashboard
   - [ ] ✅ Expect: Canary group badge visible
   - [ ] ✅ Expect: Beta features available
   - [ ] ✅ Expect: Rollback option present

5. **Admin Dashboard Panels**
   - [ ] Open admin dashboard (all platforms)
   - [ ] ✅ Expect: All Phase 4 panels present
   - [ ] ✅ Expect: Real-time data updating
   - [ ] ✅ Expect: No performance degradation
   - [ ] ✅ Expect: Export functionality works

---

## Test Execution Timeline

| Phase | Duration | Tasks |
|-------|----------|-------|
| **Setup** | 1 hour | Install on all 5 browsers, load extensions |
| **Core Testing** | 10 hours | Detector, content.js, panels, API, offline, localization |
| **Regression** | 4 hours | Phase 4 features, admin dashboard, cryptographic features |
| **Performance** | 3 hours | Latency, cache, memory, bundle size verification |
| **Documentation** | 2 hours | Report writing, screenshots, recommendations |
| **TOTAL** | **20-24 hours** | Full QA pass across all 5 browsers |

---

## Acceptance Criteria

- ✅ All 5 browsers: detector.js 29/29 PASS
- ✅ All 5 browsers: content.js 18 moats active
- ✅ All 5 browsers: dashboard panels render and update
- ✅ All 28 API endpoints responding
- ✅ Offline mode works 120 seconds
- ✅ All 8 languages render correctly
- ✅ All Phase 4 features working
- ✅ No console errors or warnings
- ✅ Extension overhead < 1%
- ✅ API latency < 600ms average

---

## Sign-Off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| QA Lead | — | — | — |
| Release Manager | — | — | — |
| Product Manager | — | — | — |
| CTO | — | — | — |

---

## Notes

- All test results should be documented with screenshots
- Each browser should be tested on latest stable version
- Virtual machines or actual devices may be used
- Network conditions should simulate real-world scenarios
- All failures should be logged with exact reproduction steps
