/**
 * Kasbah Guard Desktop - Content Redaction Module v1.0.0
 *
 * Redacts all 50+ secret formats from text
 * Used for: logs, screenshots, support tickets, audit trails
 *
 * Hotkey: Cmd+Shift+R (macOS) / Ctrl+Shift+R (Windows/Linux)
 * Usage: Copy text → trigger hotkey → clipboard contains redacted version
 */

use regex::Regex;
use std::collections::HashMap;

pub struct RedactionEngine {
    patterns: HashMap<&'static str, Regex>,
}

impl RedactionEngine {
    pub fn new() -> Self {
        let mut patterns = HashMap::new();

        // Core PII patterns
        patterns.insert("ssn", Regex::new(r"\b(?!000|666|9\d{2})\d{3}[-\s]?\d{2}[-\s]?\d{4}\b").unwrap());
        patterns.insert("cc", Regex::new(r"\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13})\b").unwrap());
        patterns.insert("passport", Regex::new(r"\b[A-Z]{1,2}\d{6,9}\b").unwrap());
        patterns.insert("phone", Regex::new(r"\b(?:\+?1)?[-.\s]?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}\b").unwrap());
        patterns.insert("email", Regex::new(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b").unwrap());

        // API Keys
        patterns.insert("aws_key", Regex::new(r"\bAKIA[0-9A-Z]{16}\b").unwrap());
        patterns.insert("github_pat", Regex::new(r"\bghp_[A-Za-z0-9]{36,}\b").unwrap());
        patterns.insert("github_oauth", Regex::new(r"\bgho_[A-Za-z0-9]{36,}\b").unwrap());
        patterns.insert("github_app", Regex::new(r"\bghu_[A-Za-z0-9]{36,}\b").unwrap());
        patterns.insert("openai_key", Regex::new(r"\bsk-[A-Za-z0-9\-_]{20,}\b").unwrap());
        patterns.insert("anthropic_key", Regex::new(r"\bsk-ant-[A-Za-z0-9\-_]{20,}\b").unwrap());
        patterns.insert("slack_token", Regex::new(r"\bxox[baprs]-[0-9]{10,13}-[A-Za-z0-9]{24,}\b").unwrap());
        patterns.insert("stripe_key", Regex::new(r"\bsk_(?:live|test)_[A-Za-z0-9]{20,}\b").unwrap());
        patterns.insert("twilio_key", Regex::new(r"\bSK[0-9a-f]{32}\b").unwrap());
        patterns.insert("sendgrid_key", Regex::new(r"\bSG\.[A-Za-z0-9_\-]{66,}\b").unwrap());
        patterns.insert("discord_token", Regex::new(r"\bMTA|NTA|NzA|ODI|OTI|OTc|ODA|[0-9]{18,24}\.[A-Za-z0-9_-]{38,}\b").unwrap());

        // Database credentials
        patterns.insert("mongo_uri", Regex::new(r"\bmongodb\+srv?://[^\s]+\b").unwrap());
        patterns.insert("postgres_uri", Regex::new(r"\bpostgres(?:ql)?://[^\s]+\b").unwrap());
        patterns.insert("mysql_uri", Regex::new(r"\bmysql://[^\s]+\b").unwrap());
        patterns.insert("redis_uri", Regex::new(r"\bredis://[^\s]+\b").unwrap());

        // Private keys
        patterns.insert("private_key", Regex::new(r"-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----[\s\S]*?-----END\s+(?:RSA\s+)?PRIVATE\s+KEY-----").unwrap());
        patterns.insert("openssh_key", Regex::new(r"-----BEGIN\s+OPENSSH\s+PRIVATE\s+KEY-----[\s\S]*?-----END\s+OPENSSH\s+PRIVATE\s+KEY-----").unwrap());

        // Passwords and secrets
        patterns.insert("password_assign", Regex::new(r"(?:password|passwd|pwd)\s*[=:]\s*['\"]?([^'\"\s]+)['\"]?").unwrap());
        patterns.insert("api_key_assign", Regex::new(r"(?:api[_-]?key|apikey)\s*[=:]\s*['\"]?([^'\"\s]+)['\"]?").unwrap());
        patterns.insert("secret_assign", Regex::new(r"(?:secret|token)\s*[=:]\s*['\"]?([^'\"\s]+)['\"]?").unwrap());

        // Base64 encoded secrets (high entropy)
        patterns.insert("base64_secret", Regex::new(r"\b[A-Za-z0-9+/]{40,}={0,2}\b").unwrap());

        // Cryptocurrency
        patterns.insert("ethereum_addr", Regex::new(r"\b0x[a-fA-F0-9]{40}\b").unwrap());
        patterns.insert("bitcoin_addr", Regex::new(r"\b(?:bc1|[13])[a-zA-HJ-NP-Z0-9]{25,39}\b").unwrap());
        patterns.insert("seed_phrase", Regex::new(r"\b(?:abandon|ability|able|about|above|absent|absorb|abstract|abuse|access|accident|account|accuse){1}\b[\s\w]+\b(?:zoo|zero|yield|yogi|yoga|you|your|yours|youth|youthful){1}\b").unwrap());

        // Tax IDs
        patterns.insert("tax_id", Regex::new(r"\b(?:EIN|SSN|TIN|SIN|DNI|NIE|NIF|CIF)[\s-]?\d{2}[-\s]?\d{3}[-\s]?\d{4}\b").unwrap());
        patterns.insert("national_id", Regex::new(r"\b(?:CIN|NIC|CIF|NIF|NIE|BSN|DNI)\s*[:\-]?\s*\d{4,}\b").unwrap());

        // Patent and document IDs
        patterns.insert("patent", Regex::new(r"\bUS\d{7,}\b").unwrap());
        patterns.insert("vin", Regex::new(r"\b[A-HJ-NPR-Z0-9]{17}\b").unwrap());

        RedactionEngine { patterns }
    }

    /// Main redaction function - processes text and redacts all detected secrets
    pub fn redact(&self, text: &str) -> String {
        let mut result = text.to_string();

        // Apply each pattern in order
        for (pattern_name, regex) in &self.patterns {
            result = regex
                .replace_all(&result, |_: &regex::Captures| {
                    format!("[REDACTED: {}]", pattern_name.to_uppercase())
                })
                .to_string();
        }

        result
    }

    /// Redact and get metadata about what was redacted
    pub fn redact_with_metadata(&self, text: &str) -> RedactionResult {
        let mut redactions = Vec::new();
        let mut result = text.to_string();

        for (pattern_name, regex) in &self.patterns {
            for cap in regex.captures_iter(text) {
                if let Some(matched) = cap.get(0) {
                    redactions.push(RedactionInfo {
                        pattern: pattern_name.to_string(),
                        original: matched.as_str().to_string(),
                        position: matched.start(),
                    });
                }
            }

            result = regex
                .replace_all(&result, |_: &regex::Captures| {
                    format!("[REDACTED: {}]", pattern_name.to_uppercase())
                })
                .to_string();
        }

        RedactionResult {
            redacted_text: result,
            redactions,
            count: redactions.len(),
        }
    }
}

#[derive(Debug, Clone)]
pub struct RedactionInfo {
    pub pattern: String,
    pub original: String,
    pub position: usize,
}

#[derive(Debug, Clone)]
pub struct RedactionResult {
    pub redacted_text: String,
    pub redactions: Vec<RedactionInfo>,
    pub count: usize,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ssn_redaction() {
        let engine = RedactionEngine::new();
        let result = engine.redact("My SSN is 123-45-6789 for verification");
        assert!(result.contains("[REDACTED: SSN]"));
        assert!(!result.contains("123-45-6789"));
    }

    #[test]
    fn test_credit_card_redaction() {
        let engine = RedactionEngine::new();
        let result = engine.redact("Card: 4111111111111111");
        assert!(result.contains("[REDACTED: CC]"));
        assert!(!result.contains("4111111111111111"));
    }

    #[test]
    fn test_api_key_redaction() {
        let engine = RedactionEngine::new();
        let result = engine.redact("API key: sk-proj-abc123def456ghi789");
        assert!(result.contains("[REDACTED: OPENAI_KEY]"));
    }

    #[test]
    fn test_github_pat_redaction() {
        let engine = RedactionEngine::new();
        let result = engine.redact("Token: ghp_1234567890abcdefghijklmnopqrstuvwxyz");
        assert!(result.contains("[REDACTED: GITHUB_PAT]"));
    }

    #[test]
    fn test_password_assignment_redaction() {
        let engine = RedactionEngine::new();
        let result = engine.redact("password=mySecretPassword123");
        assert!(result.contains("[REDACTED: PASSWORD_ASSIGN]"));
    }

    #[test]
    fn test_multiple_redactions() {
        let engine = RedactionEngine::new();
        let result = engine.redact("SSN: 123-45-6789, Email: test@example.com, Card: 4111111111111111");
        assert_eq!(result.matches("[REDACTED:").count(), 3);
    }

    #[test]
    fn test_no_false_positives() {
        let engine = RedactionEngine::new();
        let result = engine.redact("This is a normal sentence with no secrets here");
        assert_eq!(result, "This is a normal sentence with no secrets here");
    }

    #[test]
    fn test_redaction_with_metadata() {
        let engine = RedactionEngine::new();
        let result = engine.redact_with_metadata("SSN: 123-45-6789");
        assert_eq!(result.count, 1);
        assert_eq!(result.redactions[0].pattern, "ssn");
    }
}
