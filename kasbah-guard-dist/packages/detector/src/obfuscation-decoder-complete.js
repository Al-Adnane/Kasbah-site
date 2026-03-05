/**
 * Kasbah Guard — Obfuscation Decoder
 * 
 * Multi-layer decoding for hidden secrets
 */

const crypto = require('crypto');

class ObfuscationDecoder {
  constructor() {
    this.homoglyphs = { 'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'у': 'y', 'х': 'x', 'α': 'a', 'ε': 'e', 'ο': 'o' };
  }

  decode(text) {
    const results = [];
    const base64Result = this.decodeBase64(text);
    if (base64Result.decoded) results.push({ type: 'base64', decoded: base64Result.decoded, confidence: 0.9 });
    const hexResult = this.decodeHex(text);
    if (hexResult.decoded) results.push({ type: 'hex', decoded: hexResult.decoded, confidence: 0.85 });
    const urlResult = this.decodeURL(text);
    if (urlResult.decoded) results.push({ type: 'url', decoded: urlResult.decoded, confidence: 0.8 });
    const caesarResults = this.decodeCaesar(text);
    caesarResults.forEach(r => results.push({ type: 'caesar', shift: r.shift, decoded: r.decoded, confidence: r.confidence }));
    const normalized = this.normalizeHomoglyphs(text);
    if (normalized !== text) results.push({ type: 'homoglyph', decoded: normalized, confidence: 0.95 });
    return results;
  }

  decodeBase64(text) {
    const base64Regex = /(?:[A-Za-z0-9+/]{4}){2,}(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?/g;
    const matches = text.match(base64Regex);
    if (!matches) return { decoded: null };
    for (const match of matches) {
      try {
        const decoded = Buffer.from(match, 'base64').toString('utf8');
        if (this.isReadable(decoded)) return { decoded, confidence: 0.9 };
      } catch (e) { continue; }
    }
    return { decoded: null };
  }

  decodeHex(text) {
    const hexRegex = /(?:0x)?[0-9a-fA-F]{16,}/g;
    const matches = text.match(hexRegex);
    if (!matches) return { decoded: null };
    for (const match of matches) {
      try {
        const hex = match.replace('0x', '');
        const decoded = Buffer.from(hex, 'hex').toString('utf8');
        if (this.isReadable(decoded)) return { decoded, confidence: 0.85 };
      } catch (e) { continue; }
    }
    return { decoded: null };
  }

  decodeURL(text) {
    if (/%[0-9A-Fa-f]{2}/.test(text)) {
      try {
        const decoded = decodeURIComponent(text);
        if (decoded !== text) return { decoded, confidence: 0.8 };
      } catch (e) { }
    }
    return { decoded: null };
  }

  decodeCaesar(text) {
    const results = [];
    for (let shift = 1; shift <= 25; shift++) {
      const decoded = text.replace(/[a-zA-Z]/g, char => {
        const base = char <= 'Z' ? 65 : 97;
        return String.fromCharCode((char.charCodeAt(0) - base + shift) % 26 + base);
      });
      if (this.isReadable(decoded)) results.push({ shift, decoded, confidence: 0.5 });
    }
    return results;
  }

  normalizeHomoglyphs(text) {
    let normalized = text;
    for (const [homoglyph, normal] of Object.entries(this.homoglyphs)) {
      normalized = normalized.replace(new RegExp(homoglyph, 'g'), normal);
    }
    return normalized;
  }

  isReadable(text) {
    const readableRatio = (text.match(/[a-zA-Z0-9\s\-_=]/g) || []).length / text.length;
    return readableRatio > 0.7 && text.length > 4;
  }
}

module.exports = { ObfuscationDecoder };
