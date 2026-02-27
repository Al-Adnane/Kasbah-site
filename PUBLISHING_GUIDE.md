# Kasbah Guard Extension Publishing Guide

**Status**: Publishing to all 5 major browser extension stores
**Version**: v1.2.0+ (varies by store)
**Last Updated**: 2026-02-27

---

## Overview

This guide covers publishing Kasbah Guard to:
1. ✅ **Chrome Web Store** (ALREADY PUBLISHED)
2. **Firefox Add-ons (AMO)**
3. **Edge Add-ons Store**
4. **Opera Add-ons Store**
5. **Safari App Store**

---

## Store Status

| Store | Status | URL | Notes |
|-------|--------|-----|-------|
| Chrome Web Store | ✅ Published | https://chromewebstore.google.com/detail/kasbah-guard/idikjiajiomhekkkpfkhnpfepfgknokc | ID: `idikjiajiomhekkkpfkhnpfepfgknokc` |
| Firefox AMO | ⏳ Ready to Publish | https://addons.mozilla.org/en-US/firefox/ | Needs Mozilla account |
| Edge Add-ons | ⏳ Ready to Publish | https://microsoftedge.microsoft.com/addons/ | Needs Microsoft account |
| Opera Add-ons | ⏳ Ready to Publish | https://addons.opera.com/ | Needs Opera account |
| Safari App Store | ⏳ Ready to Publish | https://apps.apple.com/ | Needs Apple Developer account |

---

## 1. CHROME WEB STORE (✅ ALREADY PUBLISHED)

**Status**: Live and working
**URL**: https://chromewebstore.google.com/detail/kasbah-guard/idikjiajiomhekkkpfkhnpfepfgknokc

### To verify:
```bash
cd kasbah-guard-dist/extensions/chrome
# Extension is ready to use from the Web Store
```

---

## 2. FIREFOX ADD-ONS (AMO)

### Prerequisites:
- Mozilla Firefox Developer account: https://addons.mozilla.org/
- Create account if needed (free)
- Email verification required

### Manifest Details:
```json
{
  "manifest_version": 3,
  "name": "Kasbah Guard",
  "version": "2.0.0",
  "browser_specific_settings": {
    "gecko": {
      "id": "guard@bekasbah.com",
      "strict_min_version": "109.0"
    }
  }
}
```

### Publishing Steps:

1. **Prepare the extension**:
   ```bash
   cd kasbah-guard-dist/extensions/firefox
   # Create a ZIP file of the extension
   zip -r kasbah-guard-firefox-2.0.0.zip .
   ```

2. **Sign in to AMO**:
   - Visit: https://addons.mozilla.org/en-US/developers/
   - Sign in with your Firefox account
   - Click "Submit a new add-on"

3. **Upload the extension**:
   - Select "Upload your version"
   - Choose the ZIP file: `kasbah-guard-firefox-2.0.0.zip`
   - Accept the terms of service

4. **Fill in the listing**:
   - **Name**: Kasbah Guard
   - **Version**: 2.0.0
   - **Category**: Security
   - **Description**:
     ```
     Local-first guard that intercepts prompts and actions on AI chat
     services to prevent leaks and enforce user control.

     ✓ 22-pattern detector for secrets, credentials, and personal data
     ✓ 18-moat egress gate blocking data exfiltration
     ✓ Local-only processing (no data sent to servers)
     ✓ Supports 15+ languages
     ✓ 100% free and open-source
     ```
   - **Homepage**: https://bekasbah.com
   - **Support Email**: yo@bekasbah.com
   - **License**: GPL-3.0 (or your chosen license)

5. **Provide permissions justification**:
   - **activeTab**: "To analyze content on active tab for data leaks"
   - **storage**: "To persist user detection preferences locally"
   - **host_permissions**: "To monitor AI chat platforms for credential and secret patterns"

6. **Add screenshots** (minimum 2):
   - Screenshot 1: Extension popup showing detected patterns
   - Screenshot 2: Features overview
   - Screenshots should be 1280x800 or similar

7. **Submit for review**:
   - Mozilla review typically takes 3-7 days
   - You'll receive email updates
   - Approval email will contain the AMO listing URL

8. **After approval**:
   - Listed on: https://addons.mozilla.org/en-US/firefox/addon/kasbah-guard/
   - Update website links to this URL

---

## 3. EDGE ADD-ONS STORE

### Prerequisites:
- Microsoft Edge Developer account: https://partner.microsoft.com/dashboard/
- Partner Dashboard access (may require approval)
- Email verification

### Manifest Details:
```json
{
  "manifest_version": 3,
  "name": "Kasbah Guard",
  "version": "1.2.0"
}
```

### Publishing Steps:

1. **Prepare the extension**:
   ```bash
   cd kasbah-guard-dist/extensions/edge
   # Create a ZIP file of the extension
   zip -r kasbah-guard-edge-1.2.0.zip .
   ```

2. **Create/Sign into Partner Dashboard**:
   - Visit: https://partner.microsoft.com/dashboard/
   - Sign in with Microsoft account
   - Request access to "Edge Add-ons store" if needed

3. **Create new extension entry**:
   - Click "Create new extension"
   - Fill in basic info:
     - **Name**: Kasbah Guard
     - **Short description**: Prevents leaks on AI chat platforms
     - **Category**: Security and Privacy
     - **Website**: https://bekasbah.com

4. **Upload the extension**:
   - Upload package: `kasbah-guard-edge-1.2.0.zip`
   - Wait for validation (usually automatic)

5. **Fill detailed listing**:
   - **Long description**:
     ```
     Kasbah Guard protects you from accidentally leaking secrets,
     credentials, and personal data on AI chat platforms.

     Features:
     • 22-pattern detector for API keys, tokens, PII, and more
     • 18-layer egress gate blocking data exfiltration
     • Local-only processing (no server calls)
     • Support for ChatGPT, Claude, Gemini, and 25+ AI platforms
     • 15+ language support
     • 100% free and open-source
     ```
   - **Screenshots**: 1280x800+ (2-3 screenshots showing features)
   - **Video URL**: Optional (demo video if available)
   - **Privacy policy**: https://bekasbah.com/privacy

6. **Permissions explanation**:
   - Explain each permission's necessity
   - Emphasize local-only processing

7. **Submit for review**:
   - Microsoft review typically takes 1-3 business days
   - You'll get email notifications on review status

8. **After approval**:
   - Listed on: https://microsoftedge.microsoft.com/addons/detail/kasbah-guard/...
   - Update website links

---

## 4. OPERA ADD-ONS STORE

### Prerequisites:
- Opera Developer account: https://addons.opera.com/developer/
- Email verification required

### Manifest Details:
```json
{
  "manifest_version": 3,
  "name": "Kasbah Guard",
  "version": "1.2.0"
}
```

### Publishing Steps:

1. **Prepare the extension**:
   ```bash
   cd kasbah-guard-dist/extensions/opera
   # Create a ZIP file
   zip -r kasbah-guard-opera-1.2.0.zip .
   ```

2. **Create Opera Developer account**:
   - Visit: https://addons.opera.com/developer/
   - Sign up / Log in
   - Verify email

3. **Submit new extension**:
   - Click "Upload extension package"
   - Upload: `kasbah-guard-opera-1.2.0.zip`

4. **Fill in listing information**:
   - **Name**: Kasbah Guard
   - **Version**: 1.2.0
   - **Category**: Security & Privacy
   - **Description**: Same as Firefox/Edge (see above)
   - **Homepage**: https://bekasbah.com
   - **Support page**: https://bekasbah.com/privacy

5. **Add screenshots**:
   - 2-3 screenshots showing UI and features
   - 1280x800 resolution recommended

6. **Terms acceptance**:
   - Accept Opera's developer terms
   - Confirm content policies

7. **Submit for review**:
   - Opera review typically takes 3-5 business days
   - Email notification on approval

8. **After approval**:
   - Listed on: https://addons.opera.com/en/opera/extensions/details/kasbah-guard/
   - Update website links

---

## 5. SAFARI APP STORE

### Prerequisites:
- Apple Developer account: https://developer.apple.com/
- Annual membership fee ($99/year)
- Apple certificate for code signing
- macOS environment for app bundling

### Special Requirements:
Safari extensions must be distributed as native macOS apps through the App Store.

### Manifest Details:
```json
{
  "manifest_version": 3,
  "name": "Kasbah Guard",
  "version": "1.1.0",
  "background": {
    "service_worker": "background.js",
    "scripts": ["background.js"]
  }
}
```

### Publishing Steps:

1. **Enroll in Apple Developer Program**:
   - Visit: https://developer.apple.com/account
   - Enroll (requires credit card, $99/year)
   - Complete identity verification

2. **Prepare Safari app container**:
   ```bash
   cd kasbah-guard-dist/extensions/safari
   # The app is already properly structured:
   # Kasbah Guard/Kasbah Guard Extension/Resources/manifest.json
   ```

3. **Create App Store Connect record**:
   - Visit: https://appstoreconnect.apple.com/
   - "My Apps" → "New App"
   - **Platform**: macOS
   - **Name**: Kasbah Guard
   - **Bundle ID**: Must match your code signing cert (e.g., `com.bekasbah.guard`)
   - **SKU**: Unique identifier

4. **Prepare for distribution**:
   - Code sign the app with your Apple Developer certificate
   - Create App Store package (.pkg or upload directly)
   - Include privacy policy: https://bekasbah.com/privacy
   - Create macOS icon (1024x1024)

5. **Fill app information**:
   - **Category**: Utilities
   - **Description**: Same as other stores
   - **Keywords**: security, privacy, AI, protection
   - **Support URL**: https://bekasbah.com
   - **Privacy Policy**: https://bekasbah.com/privacy

6. **Submit for review**:
   - Apple review typically takes 1-3 business days
   - High scrutiny on privacy/security apps
   - Respond to any review requests quickly

7. **After approval**:
   - Available on Mac App Store
   - Update website with App Store link
   - Standard URL format: `https://apps.apple.com/app/id[APPID]`

---

## General Publishing Checklist

Before submitting to any store:

- [ ] All manifests have current version numbers
- [ ] detector.js is present in all stores (✅ Already in place)
- [ ] content.js is present in all stores (✅ Already in place)
- [ ] Icons (48px, 128px) exist in extension directory
- [ ] No hardcoded test URLs or localhost references
- [ ] Privacy policy is complete and accurate
- [ ] Terms of service reviewed and accepted for each store
- [ ] Screenshots are high-quality and show actual features
- [ ] Description matches across all stores (with platform-specific adjustments)
- [ ] Support contact info is valid and monitored

---

## Post-Publication

### Update Website

Once stores are approved, update `/Users/mac/Desktop/KasbahFinal/Kasbah-site/public/index.html`:

```html
<!-- Browser badges (lines 358-383) -->
<a href="https://chromewebstore.google.com/detail/kasbah-guard/idikjiajiomhekkkpfkhnpfepfgknokc">Chrome</a>
<a href="https://addons.mozilla.org/en-US/firefox/addon/kasbah-guard/">Firefox</a>
<a href="https://microsoftedge.microsoft.com/addons/detail/kasbah-guard/[ID]">Edge</a>
<a href="https://addons.opera.com/en/opera/extensions/details/kasbah-guard/">Opera</a>
<a href="https://apps.apple.com/app/id[APPID]">Safari</a>
```

### Update Detection Page

Update `/public/detection.html` browser support table with actual store URLs.

### Monitor for Updates

- Check each store weekly for reviews/feedback
- Respond to user reviews promptly
- Plan updates across all stores simultaneously

---

## Support References

- **Chrome**: https://developer.chrome.com/docs/webstore/
- **Firefox AMO**: https://extensionworkshop.com/documentation/publish/
- **Edge**: https://learn.microsoft.com/en-us/microsoft-edge/extensions-chromium/publish/publish-extension
- **Opera**: https://dev.opera.com/extensions/
- **Safari**: https://developer.apple.com/documentation/safariservices/safari_app_extensions

---

## Timeline Expectations

| Store | Review Time | Notes |
|-------|------------|-------|
| Chrome | Already live | Instant (already approved) |
| Firefox | 3-7 days | Can be longer if issues found |
| Edge | 1-3 days | Generally fast |
| Opera | 3-5 days | Moderate speed |
| Safari | 1-3 days | Can ask for re-review |

**Estimated total time**: 2-3 weeks to get all stores approved

---

## Next Steps

1. Gather necessary account credentials for each store
2. Follow steps for Firefox first (most detailed review)
3. Follow Edge second (quick turnaround)
4. Opera and Safari in parallel
5. Update website once stores are approved
6. Do final end-to-end testing
7. Commit and deploy

---

**Questions?** Refer to each store's developer documentation linked above.
