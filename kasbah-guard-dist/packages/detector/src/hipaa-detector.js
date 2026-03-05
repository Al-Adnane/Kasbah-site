/**
 * Kasbah Guard — HIPAA PHI Detector (v1.0.0)
 *
 * Standalone HIPAA Protected Health Information (PHI) detection module.
 * Implements all 18 HIPAA Safe Harbor identifier types per 45 CFR §164.514(b).
 *
 * Derived from hospital-guardian-complete.js with standalone export interface.
 */

'use strict';

// ── 18 HIPAA Safe Harbor Identifier Patterns ──

const HIPAA_PATTERNS = {
  // 1. Names (with clinical context markers)
  names: /\b(?:patient|mr\.|mrs\.|ms\.|dr\.|prof\.)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/gi,

  // 2. Geographic data — zip codes and city+state combos
  geographic: /\b\d{5}(?:-\d{4})?\b|\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,\s*(?:AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)\b/g,

  // 3. Dates — DOB, admission, discharge
  dates: /\b(?:dob|date\s+of\s+birth|admission|discharge|admit(?:ted)?|born)\s*[:\/\-]?\s*(?:0[1-9]|1[0-2])[-\/](?:0[1-9]|[12][0-9]|3[01])[-\/](?:19|20)\d{2}\b/gi,

  // 4. Phone numbers
  phone: /\b(?:\+1[-.\s]?)?(?:\(?\d{3}\)?)[-.\s]?\d{3}[-.\s]?\d{4}\b/g,

  // 5. Fax numbers (with fax label)
  fax: /\b[Ff]ax[:\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,

  // 6. Email addresses in clinical context
  email: /\b(?:patient|provider|physician|nurse|clinic)\b[\s\S]{0,40}?\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b|\b[A-Za-z0-9._%+-]+@(?:hospital|clinic|health|medical|care|med)[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/gi,

  // 7. Social Security Numbers
  ssn: /\b(?!000|666|9\d{2})\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g,

  // 8. Medical Record Numbers (MRN)
  mrn: /\bMRN[:\s]?\s*[A-Z0-9\-]{6,}\b|\bMedical\s+Record(?:\s+Number)?[:\s]?\s*[A-Z0-9\-]{6,}\b/gi,

  // 9. Health plan beneficiary numbers (policy/plan/member numbers)
  healthPlan: /\b(?:policy|plan|member|beneficiary|subscriber|group)\s*(?:no\.?|number|#|id)[:\s]?\s*[A-Z0-9\-]{6,}\b|\b(?:BCBS|AETNA|UHC|CIGNA|HUMANA|KAISER|ANTHEM)[-:\s]?\s*\d{6,}\b/gi,

  // 10. Account numbers
  account: /\b(?:account|acct)(?:\s+no\.?|\s+number|\s+#)?[:\s]?\s*\d{8,}\b/gi,

  // 11. Certificate/license numbers (medical professionals)
  certificate: /\b(?:MD|DO|RN|LPN|NP|PA|license|certificate|cert|dea)\s*(?:no\.?|number|#)?[:\s]?\s*[A-Z0-9]{6,}\b/gi,

  // 12. Vehicle identifiers (VIN)
  vehicle: /\b(?:VIN|vehicle\s+identification\s+number)[:\s]?\s*[A-HJ-NPR-Z0-9]{17}\b/gi,

  // 13. Device identifiers (serial numbers — medical devices)
  device: /\b(?:device|implant|pacemaker|defibrillator|serial)\s*(?:no\.?|number|#|id|s\/n)[:\s]?\s*[A-Z0-9\-]{10,}\b/gi,

  // 14. URLs in clinical context
  urls: /\bhttps?:\/\/[^\s]*(?:patient|portal|health|medical|ehr|emr|chart|record)[^\s]*/gi,

  // 15. IP addresses
  ip: /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g,

  // 16. Biometric identifiers
  biometric: /\b(?:fingerprint|retinal\s+scan|retina|iris\s+scan|iris|voiceprint|voice\s+print|facial\s+recognition|dna\s+sample|dna\s+test|genome)\b/gi,

  // 17. Full-face photographs (base64 image data)
  photos: /\bdata:image\/(?:jpeg|jpg|png|gif|bmp|webp);base64,[A-Za-z0-9+\/]{100,}={0,2}\b/gi,

  // 18. Any other unique identifying numbers (catch-all for labeled IDs)
  other: /\b(?:unique|identifier|patient\s+id|pid|encounter|claim\s+(?:number|id|no))[:\s]?\s*[A-Z0-9\-]{8,}\b/gi
};

// Identifier type labels for human-readable output
const IDENTIFIER_LABELS = {
  names: 'Patient/Provider Names',
  geographic: 'Geographic Data',
  dates: 'Dates (DOB/Admission/Discharge)',
  phone: 'Phone Numbers',
  fax: 'Fax Numbers',
  email: 'Email Addresses (clinical context)',
  ssn: 'Social Security Numbers',
  mrn: 'Medical Record Numbers (MRN)',
  healthPlan: 'Health Plan Beneficiary Numbers',
  account: 'Account Numbers',
  certificate: 'Certificate/License Numbers',
  vehicle: 'Vehicle Identifiers (VIN)',
  device: 'Device Identifiers',
  urls: 'URLs (clinical context)',
  ip: 'IP Addresses',
  biometric: 'Biometric Identifiers',
  photos: 'Full-Face Photographs',
  other: 'Unique Identifying Numbers'
};

/**
 * Detect HIPAA PHI in text.
 *
 * @param {string} text - Text to scan for PHI
 * @returns {{ hasHIPAA: boolean, identifiers: string[], riskScore: number }}
 *   - hasHIPAA: true if any PHI identifier was found
 *   - identifiers: array of human-readable identifier type labels found
 *   - riskScore: 0-100 cumulative risk score (15 points per identifier type, capped at 100)
 */
function detectHIPAA(text) {
  if (!text || typeof text !== 'string') {
    return { hasHIPAA: false, identifiers: [], riskScore: 0 };
  }

  const foundIdentifiers = [];

  for (const [category, pattern] of Object.entries(HIPAA_PATTERNS)) {
    // Reset lastIndex for global patterns (stateful regex)
    if (pattern.global) {
      pattern.lastIndex = 0;
    }
    const matches = text.match(pattern);
    if (matches && matches.length > 0) {
      foundIdentifiers.push(IDENTIFIER_LABELS[category] || category);
    }
  }

  const hasHIPAA = foundIdentifiers.length > 0;
  // 15 points per unique identifier type found, capped at 100
  const riskScore = Math.min(foundIdentifiers.length * 15, 100);

  return {
    hasHIPAA,
    identifiers: foundIdentifiers,
    riskScore
  };
}

module.exports = { detectHIPAA, HIPAA_PATTERNS, IDENTIFIER_LABELS };
