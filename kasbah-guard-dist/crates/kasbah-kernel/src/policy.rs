pub fn policy_preflight(text: &str) -> (u16, String, String) {
    let t = text;
    let lower = t.to_lowercase();
    let len = t.len().max(1) as f64;

    // --- Shannon entropy ---
    let mut freq = std::collections::HashMap::<u8, u32>::new();
    for b in t.as_bytes() {
        *freq.entry(*b).or_insert(0) += 1;
    }
    let mut entropy = 0.0_f64;
    for (_k, c) in freq.iter() {
        let p = (*c as f64) / len;
        entropy -= p * p.log2();
    }

    // --- Ratios ---
    let mut special = 0usize;
    let mut digits = 0usize;
    let mut upper = 0usize;
    for ch in t.chars() {
        if ch.is_ascii_digit() {
            digits += 1;
        }
        if ch.is_ascii_uppercase() {
            upper += 1;
        }
        if !(ch.is_ascii_alphanumeric() || ch.is_whitespace()) {
            special += 1;
        }
    }
    let special_ratio = (special as f64) / len;
    let digit_ratio = (digits as f64) / len;
    let upper_ratio = (upper as f64) / len;

    // --- Pattern detectors ---
    let has_private_key = t.contains("-----BEGIN") && t.contains("PRIVATE KEY-----");
    let has_openai_key = t.contains("sk-") && t.len() >= 14;
    let has_api_key_word =
        lower.contains("api-key") || lower.contains("apikey") || lower.contains("api_key");
    let has_password_assign =
        lower.contains("password=") || lower.contains("password:") || lower.contains("pwd=");
    let has_jwt = t.contains("eyJ") && t.matches('.').count() >= 2;
    let has_conn = lower.contains("mongodb://")
        || lower.contains("postgres://")
        || lower.contains("mysql://")
        || lower.contains("redis://")
        || lower.contains("amqp://");
    let has_url = lower.contains("http://") || lower.contains("https://");

    // base64-ish: long token of base64 chars
    let mut has_base64 = false;
    {
        let mut run = 0usize;
        for ch in t.chars() {
            let ok = ch.is_ascii_alphanumeric()
                || ch == '+'
                || ch == '/'
                || ch == '='
                || ch == '_'
                || ch == '-';
            if ok {
                run += 1;
            } else {
                run = 0;
            }
            if run >= 60 {
                has_base64 = true;
                break;
            }
        }
    }

    // suspicious ngrams / keywords
    let suspicious = [
        "secret",
        "token",
        "bearer",
        "credential",
        "private",
        "ssh",
        "pem",
        "apikey",
        "api-key",
        "inject",
        "bypass",
        "jailbreak",
        "override",
        "ignore previous",
        "system prompt",
        "developer message",
        "rm -rf",
        "drop table",
        "format c:",
        "powershell",
        "curl http",
        "wget http",
    ];
    let mut ngram_score = 0u32;
    for k in suspicious.iter() {
        if lower.contains(k) {
            ngram_score += 1;
        }
    }

    // keyword count (rough)
    let mut keyword_hits = 0u32;
    for k in [
        "secret",
        "password",
        "token",
        "api",
        "key",
        "auth",
        "credential",
        "private",
    ]
    .iter()
    {
        keyword_hits += lower.matches(k).count() as u32;
    }

    // --- Risk scoring (0..100-ish) ---
    let mut score: i32 = 0;
    let mut reasons: Vec<&'static str> = Vec::new();

    // Critical indicators
    if has_private_key {
        score += 90;
        reasons.push("private key detected");
    }
    if (has_openai_key || has_api_key_word) && entropy > 3.5 {
        score += 50;
        reasons.push("high-entropy API key");
    }
    if has_conn {
        score += 45;
        reasons.push("database connection string");
    }
    if has_jwt {
        score += 40;
        reasons.push("JWT token");
    }
    if has_password_assign {
        score += 35;
        reasons.push("password assignment");
    }

    // High indicators
    if has_base64 && entropy > 4.5 {
        score += 30;
        reasons.push("encoded high-entropy data");
    }
    if ngram_score >= 5 {
        score += 25;
        reasons.push("multiple secret/injection patterns");
    }
    if keyword_hits >= 5 {
        score += 20;
        reasons.push("many suspicious keywords");
    }

    // Medium indicators
    if entropy > 4.5 {
        score += 15;
        reasons.push("high entropy");
    }
    if digit_ratio > 0.40 {
        score += 10;
        reasons.push("high digit ratio");
    }
    if special_ratio > 0.30 {
        score += 10;
        reasons.push("unusual character distribution");
    }
    if upper_ratio > 0.25 {
        score += 5;
        reasons.push("high uppercase ratio");
    }
    if has_url && ngram_score > 0 {
        score += 10;
        reasons.push("url + suspicious keywords");
    }

    if score < 0 {
        score = 0;
    }
    if score > 100 {
        score = 100;
    }

    let risk = score as u16;

    // Decision mapping (keep your existing semantics)
    let (decision, reason) = if risk >= 85 {
        (
            "BLOCK".to_string(),
            format!(
                "Critical: {}",
                reasons.into_iter().take(3).collect::<Vec<_>>().join(", ")
            ),
        )
    } else if risk >= 60 {
        (
            "CHALLENGE".to_string(),
            format!(
                "High: {}",
                reasons.into_iter().take(3).collect::<Vec<_>>().join(", ")
            ),
        )
    } else if risk >= 30 {
        (
            "WARN".to_string(),
            format!(
                "Medium: {}",
                reasons.into_iter().take(3).collect::<Vec<_>>().join(", ")
            ),
        )
    } else {
        ("ALLOW".to_string(), "No issues".to_string())
    };

    (risk, decision, reason)
}
