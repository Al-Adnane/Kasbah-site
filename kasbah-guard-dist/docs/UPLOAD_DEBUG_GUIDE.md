# 🔍 UPLOAD Debugging Guide

Added detailed console logging to debug why passport upload isn't working.

## Steps to Debug

### 1. Reload Extension
- Open: `chrome://extensions/`
- Find "Kasbah Guard"
- Click the refresh icon

### 2. Open ChatGPT with DevTools
- Go to: https://chat.openai.com/
- Press: `F12` (Open DevTools)
- Go to: **Console** tab
- You should see: `[Kasbah Guard] Extension v1.2.0 initialized`

### 3. Try Uploading Passport
- Click the upload/attachment button
- Select: `passport.jpg` (or any image with "passport" in the name)

### 4. Watch Console Logs
You should see one of these patterns:

---

## Expected Logs (If Working ✅)

```
[Kasbah] Upload change event - target: INPUT file
[Kasbah] Upload - Detected sensitive files: Array(1)
[Kasbah] Upload - SENSITIVE FILENAMES DETECTED: ["passport.jpg"]
[Kasbah] guardFlow - verb: upload decision: DENY risk: 80
[Kasbah] guardFlow - UPLOAD with sensitive filenames: ["passport.jpg"]
```

Then a **Modal should appear** with "High Risk - Sensitive document detected"

---

## Troubleshooting Logs

### Problem 1: No logs appear at all
**Cause:** Extension not loaded or not active
**Solution:**
- Reload extension again
- Check that Kasbah Guard shows as "Enabled" (not red)
- Try uploading a file again

### Problem 2: Logs show "skipping (not file input)"
**Logs:**
```
[Kasbah] Upload change event - target: INPUT text
[Kasbah] Upload - skipping (not file input)
```
**Cause:** Clicking on a text input instead of file input
**Solution:** Make sure you're clicking the upload/attachment button

### Problem 3: Logs show file detected but no "SENSITIVE FILENAMES"
**Logs:**
```
[Kasbah] Upload change event - target: INPUT file
[Kasbah] Upload - Detected sensitive files: Array(0)
```
**Cause:** Filename not matching the regex pattern
**Solution:**
- Try file names with exact matches:
  - `passport.jpg` ✓
  - `my_passport.pdf` ✓
  - `passport_scan.png` ✓
  - `photo_of_me.jpg` ✗ (doesn't contain "passport")

### Problem 4: Logs show sensitive detected but no modal
**Logs:**
```
[Kasbah] Upload - SENSITIVE FILENAMES DETECTED: ["passport.jpg"]
[Kasbah] guardFlow - verb: upload decision: DENY risk: 80
```
But no modal appears
**Cause:** Modal creation might be failing or guardFlow decision logic broken
**Solution:**
- Check for JavaScript errors in console
- Verify `createModal()` function exists
- Try a different file to isolate issue

### Problem 5: Modal shows but says "Low risk"
**Cause:** guardFlow not detecting sensitive filenames
**Solution:**
- Check logs for: `UPLOAD with sensitive filenames` message
- If not present, the condition is failing
- Check if `extraMeta.sensitive_filenames` is being passed

---

## Quick Copy-Paste Tests

Open DevTools Console and paste these:

### Test 1: Check if detector loaded
```javascript
typeof classify
// Should return: "function"
```

### Test 2: Check if SENSITIVE_FILENAMES regex works
```javascript
var testNames = ["passport.jpg", "my_passport.pdf", "ssn.txt", "tax_return.pdf"];
// These should all return true (matched as sensitive)
```

### Test 3: Check if guardFlow exists
```javascript
typeof guardFlow
// Should return: "function"
```

### Test 4: View all extension logs
```javascript
// Filter console to only show [Kasbah] logs
// Use console filter: [Kasbah]
```

---

## File Types to Test

Try these filenames to confirm pattern matching:

**Should Block (Sensitive) ✅**
- `passport.jpg`
- `passport.pdf`
- `my_passport_scan.png`
- `passport_copy.txt`
- `ID_card.pdf`
- `driver_license.jpg`
- `ssn.txt`
- `tax_return.pdf`
- `medical_record.pdf`
- `bank_statement.pdf`

**Should Allow (Not Sensitive) ✓**
- `photo.jpg`
- `image.png`
- `document.pdf`
- `notes.txt`
- `passport_info.docx` (if contains passport + .docx not in text types)

---

## Console Filtering

To make logs easier to find:
1. Open DevTools (F12)
2. Go to Console tab
3. In the filter box at bottom, type: `[Kasbah]`
4. Now only Kasbah logs show

---

## Report If Stuck

If you see these logs, report them:

```
1. The exact logs you see when trying to upload passport.jpg
2. Whether a modal appears or not
3. If modal appears, what it says
4. What browser/version you're using
5. What file you tried uploading
```

This will help debug the issue quickly!

---

## Next: Reload and Test

1. **Reload extension**: chrome://extensions → refresh
2. **Open DevTools**: F12
3. **Go to ChatGPT**: https://chat.openai.com/
4. **Try uploading**: Click upload → Select passport.jpg
5. **Watch console**: Should see [Kasbah] logs
6. **Expected**: Modal appears with "Sensitive document detected"

Let me know what logs you see! 🔍
