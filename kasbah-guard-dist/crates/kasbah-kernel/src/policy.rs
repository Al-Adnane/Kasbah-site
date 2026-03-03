// Luhn algorithm for credit card validation
fn luhn_check(digits: &[u8]) -> bool {
    let len = digits.len();
    if !(13..=19).contains(&len) { return false; }
    let sum: u32 = digits.iter().rev().enumerate().map(|(i, &d)| {
        let d = (d - b'0') as u32;
        if i % 2 == 1 { let v = d * 2; if v > 9 { v - 9 } else { v } } else { d }
    }).sum();
    sum % 10 == 0
}

pub fn policy_preflight(text: &str) -> (u16, String, String) {
    let t = text;
    let lower = t.to_lowercase();
    let len = t.len().max(1) as f64;

    // --- Shannon entropy ---
    let mut freq = std::collections::HashMap::<u8, u32>::new();
    for b in t.as_bytes() { *freq.entry(*b).or_insert(0) += 1; }
    let mut entropy = 0.0_f64;
    for (_k, c) in freq.iter() {
        let p = (*c as f64) / len;
        entropy -= p * p.log2();
    }

    // --- Character ratios ---
    let mut special = 0usize;
    let mut digits_count = 0usize;
    let mut upper = 0usize;
    for ch in t.chars() {
        if ch.is_ascii_digit()        { digits_count += 1; }
        if ch.is_ascii_uppercase()    { upper += 1; }
        if !(ch.is_ascii_alphanumeric() || ch.is_whitespace()) { special += 1; }
    }
    let special_ratio = (special as f64) / len;
    let digit_ratio   = (digits_count as f64) / len;
    let upper_ratio   = (upper as f64) / len;

    let bytes = t.as_bytes();
    let blen  = bytes.len();

    // ── Structural pattern detectors ─────────────────────────────────

    let has_private_key = t.contains("-----BEGIN") && t.contains("PRIVATE KEY-----");
    let has_jwt = t.contains("eyJ") && t.matches('.').count() >= 2;
    let has_url = lower.contains("http://") || lower.contains("https://");

    // OpenAI sk- keys (sk- followed by 20+ chars)
    let has_openai_key = lower.find("sk-").map_or(false, |pos| t.len() > pos + 23);

    // Stripe live/test tokens
    let has_stripe_key = lower.contains("sk_live_") || lower.contains("sk_test_")
        || lower.contains("pk_live_") || lower.contains("rk_live_");

    // Slack OAuth tokens
    let has_slack_token = lower.contains("xoxb-") || lower.contains("xoxa-")
        || lower.contains("xoxe-") || lower.contains("xoxp-");

    // Slack incoming webhook URL
    let has_slack_webhook = lower.contains("hooks.slack.com/services/");

    // AWS secret access key assignment (env-style)
    let has_aws_secret_assign = (lower.contains("aws_secret_access_key=")
        || lower.contains("aws_secret_access_key =")
        || lower.contains("aws_secret_access_key:"))
        && t.len() > 40;

    // GCP service account JSON
    let has_gcp_service_acct = t.contains("\"type\"") && t.contains("\"service_account\"");

    // Azure Storage connection string
    let has_azure_storage = lower.contains("defaultendpointsprotocol=https")
        && lower.contains("accountname=") && lower.contains("accountkey=");

    // Discord bot token: [MN][A-Za-z0-9_-]{23-25}.[A-Za-z0-9_-]{6-7}.[A-Za-z0-9_-]{27-38}
    let has_discord_token = {
        let mut found = false;
        if blen >= 59 {
            for i in 0..=blen.saturating_sub(59) {
                if matches!(bytes[i], b'M' | b'N') {
                    let seg1 = bytes[i+1..].iter()
                        .take_while(|b| b.is_ascii_alphanumeric() || **b == b'_' || **b == b'-')
                        .count();
                    if (23..=25).contains(&seg1) {
                        let dot1 = i + 1 + seg1;
                        if dot1 < blen && bytes[dot1] == b'.' {
                            let seg2 = bytes[dot1+1..].iter()
                                .take_while(|b| b.is_ascii_alphanumeric() || **b == b'_' || **b == b'-')
                                .count();
                            if (6..=7).contains(&seg2) {
                                let dot2 = dot1 + 1 + seg2;
                                if dot2 < blen && bytes[dot2] == b'.' {
                                    let seg3 = bytes[dot2+1..].iter()
                                        .take_while(|b| b.is_ascii_alphanumeric() || **b == b'_' || **b == b'-')
                                        .count();
                                    if (27..=38).contains(&seg3) { found = true; break; }
                                }
                            }
                        }
                    }
                }
            }
        }
        found
    };

    // Shopify API key: shppa_, shpss_, shpat_ + 32+ alphanumeric
    let has_shopify_key = {
        let mut found = false;
        for prefix in &[b"shppa_".as_ref(), b"shpss_".as_ref(), b"shpat_".as_ref()] {
            if let Some(pos) = (0..blen.saturating_sub(prefix.len())).find(|&i| &bytes[i..i+prefix.len()] == *prefix) {
                let run = bytes[pos+prefix.len()..].iter()
                    .take_while(|b| b.is_ascii_alphanumeric()).count();
                if run >= 32 { found = true; break; }
            }
        }
        found
    };

    // PyPI upload token: pypi- + 50+ alphanumeric/-/_
    let has_pypi_token = lower.find("pypi-").map_or(false, |pos| {
        let run = bytes[pos+5..].iter()
            .take_while(|b| b.is_ascii_alphanumeric() || **b == b'-' || **b == b'_').count();
        run >= 50
    });

    // DigitalOcean personal access token: dop_v1_ + 64+ alphanumeric
    let has_do_token = lower.find("dop_v1_").map_or(false, |pos| {
        let run = bytes[pos+7..].iter()
            .take_while(|b| b.is_ascii_alphanumeric()).count();
        run >= 64
    });

    // Linear API key: lin_ + 40+ alphanumeric
    let has_linear_key = lower.find("lin_").map_or(false, |pos| {
        let run = bytes[pos+4..].iter()
            .take_while(|b| b.is_ascii_alphanumeric()).count();
        run >= 40
    });

    // Mapbox access token: pk. + 60+ alphanumeric/_/-
    let has_mapbox_token = t.find("pk.").map_or(false, |pos| {
        let run = bytes[pos+3..].iter()
            .take_while(|b| b.is_ascii_alphanumeric() || **b == b'_' || **b == b'-').count();
        run >= 60
    });

    // Pulumi access token: pul- + 60+ alphanumeric
    let has_pulumi_token = lower.find("pul-").map_or(false, |pos| {
        let run = bytes[pos+4..].iter()
            .take_while(|b| b.is_ascii_alphanumeric()).count();
        run >= 60
    });

    // Supabase JWT / service key: eyJ + 100+ base64url chars
    let has_supabase_key = t.find("eyJ").map_or(false, |pos| {
        let run = bytes[pos+3..].iter()
            .take_while(|b| b.is_ascii_alphanumeric() || **b == b'_' || **b == b'-').count();
        run >= 100
    });

    // API key assignment patterns
    let has_api_key_word = lower.contains("api-key") || lower.contains("apikey")
        || lower.contains("api_key");

    // Password / secret assignment (with optional spaces around = or :)
    let has_password_assign = lower.contains("password=") || lower.contains("password =")
        || lower.contains("password:") || lower.contains("pwd=") || lower.contains("passwd=");

    let has_secret_assign = lower.contains("secret=") || lower.contains("secret =")
        || lower.contains("client_secret") || lower.contains("api_secret");

    // Database connection strings
    let has_conn = lower.contains("mongodb://") || lower.contains("postgres://")
        || lower.contains("postgresql://") || lower.contains("mysql://")
        || lower.contains("redis://") || lower.contains("amqp://")
        || lower.contains("mssql://");
    let has_conn_creds = has_conn && t.contains('@');

    // ── Document / PII keyword detectors ─────────────────────────────

    // SSN: NNN-NN-NNNN or NNN NN NNNN, excluding 000/666/9xx prefixes
    let has_ssn = {
        let mut found = false;
        if blen >= 11 {
            for i in 0..=blen.saturating_sub(11) {
                if bytes[i].is_ascii_digit() && bytes[i+1].is_ascii_digit() && bytes[i+2].is_ascii_digit()
                    && (bytes[i+3] == b'-' || bytes[i+3] == b' ')
                    && bytes[i+4].is_ascii_digit() && bytes[i+5].is_ascii_digit()
                    && (bytes[i+6] == b'-' || bytes[i+6] == b' ')
                    && bytes[i+7].is_ascii_digit() && bytes[i+8].is_ascii_digit()
                    && bytes[i+9].is_ascii_digit() && bytes[i+10].is_ascii_digit()
                    && (i == 0 || !bytes[i-1].is_ascii_alphanumeric())
                    && (i+11 >= blen || !bytes[i+11].is_ascii_alphanumeric())
                {
                    let prefix = (bytes[i] - b'0') as u16 * 100
                        + (bytes[i+1] - b'0') as u16 * 10
                        + (bytes[i+2] - b'0') as u16;
                    if prefix != 0 && prefix != 666 && prefix < 900 { found = true; break; }
                }
            }
        }
        found
    };

    // AWS AKIA access key: AKIA + 16 uppercase alphanumeric, word-bounded
    let has_aws_key = {
        let mut found = false;
        if blen >= 20 {
            for i in 0..=blen.saturating_sub(20) {
                if &bytes[i..i+4] == b"AKIA" {
                    let rest = &bytes[i+4..i+20];
                    if rest.iter().all(|b| b.is_ascii_uppercase() || b.is_ascii_digit()) {
                        let before_ok = i == 0 || !bytes[i-1].is_ascii_alphanumeric();
                        let after_ok  = i+20 >= blen || !bytes[i+20].is_ascii_alphanumeric();
                        if before_ok && after_ok { found = true; break; }
                    }
                }
            }
        }
        found
    };

    // GitHub PAT: gh[pshoru]_ + 36+ alphanumeric
    let has_gh_pat = {
        let mut found = false;
        if blen >= 40 {
            for i in 0..=blen.saturating_sub(40) {
                if bytes[i] == b'g' && bytes[i+1] == b'h'
                    && matches!(bytes[i+2], b'p'|b's'|b'h'|b'o'|b'r'|b'u')
                    && bytes[i+3] == b'_'
                {
                    let run = bytes[i+4..].iter().take_while(|b| b.is_ascii_alphanumeric()).count();
                    if run >= 36 { found = true; break; }
                }
            }
        }
        found
    };

    // Credit card: 13–19 digit sequences (with optional - / space separators) passing Luhn.
    // Uses 'X' sentinel to flush trailing digit runs at end-of-string.
    let has_credit_card = {
        let mut found = false;
        let mut digit_buf: Vec<u8> = Vec::with_capacity(20);
        let mut buf_start = 0usize;
        let mut j = 0usize;
        while j <= blen && !found {
            let b = if j < blen { bytes[j] } else { b'X' }; // 'X' flushes trailing digit runs
            if b.is_ascii_digit() {
                if digit_buf.is_empty() { buf_start = j; }
                digit_buf.push(b);
            } else if (b == b'-' || b == b' ') && !digit_buf.is_empty() {
                // separator — continue accumulating
            } else {
                // flush on any non-digit, non-separator (or sentinel)
                if digit_buf.len() >= 13 && digit_buf.len() <= 19 {
                    let before_ok = buf_start == 0 || !bytes[buf_start-1].is_ascii_alphanumeric();
                    if before_ok && luhn_check(&digit_buf) {
                        found = true;
                    }
                }
                digit_buf.clear();
            }
            j += 1;
        }
        found
    };

    // Ethereum: 0x + 40 hex (address) or 0x + 64 hex (private key)
    let has_ethereum = lower.find("0x").map_or(false, |pos| {
        let rest = &bytes[pos+2..];
        let run = rest.iter().take_while(|b| b.is_ascii_hexdigit()).count();
        run == 64 || run == 40
    });

    // Bulk email: 5+ @ signs → email list/dump
    let email_count = t.matches('@').count();
    let has_bulk_email = email_count >= 5;

    // Passport keywords + alphanumeric sequence
    let has_passport = (lower.contains("passport") || lower.contains("pasaporte")
        || lower.contains("reisepass") || lower.contains("جواز"))
        && (t.chars().filter(|c| c.is_ascii_alphanumeric()).count() > 8);

    // Driver's license / permit keywords
    let has_drivers_license = (lower.contains("driver") && lower.contains("license"))
        || lower.contains("driving licence") || lower.contains("führerschein")
        || lower.contains("permis de conduire") || lower.contains("رخصة قيادة");

    // Medical / patient record keywords
    let has_medical = (lower.contains("diagnosis") && lower.contains("medication"))
        || (lower.contains("patient id") || lower.contains("mrn-") || lower.contains("patient id:"))
        || (lower.contains("prescription") && lower.contains("dosage"))
        || lower.contains("dossier médical") || lower.contains("historial médico");

    // IBAN bank account
    let has_iban = lower.contains("iban")
        || (lower.contains("bank account") && lower.contains("routing"));

    // Tax ID / EIN keywords followed by ID-like sequences
    let has_tax_id = (lower.contains("ein") || lower.contains("tax id")
        || lower.contains("tax identification") || lower.contains("irs form")
        || lower.contains("itin") || lower.contains("ssn") || lower.contains("social security"))
        && lower.len() > 12;

    // Insurance policy
    let has_insurance = (lower.contains("insurance") && lower.contains("policy"))
        || lower.contains("insurance policy");

    // Crypto seed phrase (BIP-39 word detection — require 6+ matches from known seed words)
    let has_seed_phrase = {
        let bip39: &[&str] = &[
            "abandon","ability","able","absent","absorb","abstract","absurd","abuse",
            "access","accident","account","accuse","achieve","acid","acoustic","acquire",
            "across","aerobic","affair","afraid","again","agent","agree","ahead",
            "alarm","album","alcohol","alert","alien","alley","almost","alone",
            "alpha","already","altar","amused","anchor","ancient","anger","animal",
        ];
        let words: Vec<&str> = lower.split_whitespace().collect();
        let hits = bip39.iter().filter(|w| words.contains(w)).count();
        hits >= 6
    };

    // Long base64 token with high entropy (lowered threshold from 60 to 24)
    let mut has_base64 = false;
    {
        let mut run = 0usize;
        for ch in t.chars() {
            let ok = ch.is_ascii_alphanumeric() || matches!(ch, '+' | '/' | '=' | '_' | '-');
            if ok { run += 1; } else { run = 0; }
            if run >= 24 { has_base64 = true; break; }
        }
    }

    // Injection / adversarial patterns
    let injection_patterns: &[&str] = &[
        "ignore previous", "ignore all previous", "system prompt", "system: override",
        "developer mode", "developer message", "disable safety", "disable all safety",
        "jailbreak", "you are now dan", "do anything now", "override instructions",
        "override previous", "reveal your system",
        // Token-boundary injection markers
        "<|im_start|>", "<|im_end|>", "<|system|>", "<|user|>", "<|assistant|>",
        "[inst]", "[/inst]", "<<sys>>", "<</sys>>",
        // Goal hijacking / indirect injection
        "ignore the above", "disregard the above", "new task:", "your new goal",
        "forget your previous", "act as if", "pretend you are",
    ];
    let injection_hits = injection_patterns.iter().filter(|p| lower.contains(*p)).count() as u32;

    // Shell / SQL dangerous commands
    let shell_patterns: &[&str] = &[
        "rm -rf", "drop table", "format c:", "powershell", "curl http", "wget http",
        "; --", "union select", "exec(",
    ];
    let shell_hits = shell_patterns.iter().filter(|p| lower.contains(*p)).count() as u32;

    // ── AI Vibe-Code Safety Patterns ─────────────────────────────────
    // Patterns common in AI-generated code that introduce security vulnerabilities

    // Unsafe eval / exec / code injection
    let has_eval_exec = t.contains("eval(") || t.contains("eval (")
        || lower.contains("new function(") || lower.contains("settimeout(\"")
        || lower.contains("setinterval(\"");

    // Python-specific dangerous patterns
    let has_py_exec = t.contains("exec(") || t.contains("os.system(")
        || t.contains("subprocess.call(") || t.contains("subprocess.run(")
        || t.contains("os.popen(") || t.contains("__import__(");

    // SQL injection via f-string / string concat (AI vibe-code antipattern)
    let has_sql_injection_pattern = (t.contains("f\"SELECT") || t.contains("f'SELECT")
        || t.contains("f\"INSERT") || t.contains("f\"UPDATE") || t.contains("f\"DELETE")
        || (lower.contains("select") && lower.contains("where") && t.contains("%s"))
        || (lower.contains("execute(") && t.contains("+")))
        && !t.contains("parameterized") && !t.contains("prepared");

    // Hardcoded credentials in code (AI vibe-code hallucination pattern)
    let has_hardcoded_creds = (lower.contains("password = \"") || lower.contains("password = '")
        || lower.contains("passwd = \"") || lower.contains("passwd = '")
        || lower.contains("api_key = \"") || lower.contains("api_key = '")
        || lower.contains("secret = \"") || lower.contains("secret = '")
        || lower.contains("token = \"") || lower.contains("token = '"))
        && !lower.contains("os.environ") && !lower.contains("process.env")
        && !lower.contains("getenv") && !lower.contains("config[");

    // Insecure deserialization
    let has_insecure_deser = t.contains("pickle.loads(") || t.contains("pickle.load(")
        || t.contains("yaml.load(") && !t.contains("Loader=")
        || t.contains("marshal.loads(") || t.contains("unserialize(");

    // Path traversal patterns
    let has_path_traversal = t.contains("../") && (lower.contains("open(") || lower.contains("readfile")
        || lower.contains("include(") || lower.contains("require("))
        || t.contains("..\\");

    // Insecure random (AI vibe-code often uses Math.random for tokens/passwords)
    let has_insecure_random = (t.contains("Math.random()") || t.contains("math.random()"))
        && (lower.contains("token") || lower.contains("password") || lower.contains("secret")
            || lower.contains("key") || lower.contains("nonce") || lower.contains("salt"));

    // Disabled TLS/cert verification (AI vibe-code antipattern)
    let has_disabled_tls = lower.contains("verify=false") || lower.contains("verify = false")
        || lower.contains("ssl_verify = false") || lower.contains("rejectunauthorized: false")
        || lower.contains("checkhostname = false") || lower.contains("verifypeer => false")
        || t.contains("InsecureRequestWarning") || lower.contains("no_verify");

    // Command injection via template literals / string formatting
    let has_cmd_injection = (t.contains("child_process") || t.contains("spawn(") || t.contains("shell=True"))
        && (t.contains("req.") || t.contains("params.") || t.contains("args.") || t.contains("input("));

    // Prototype pollution (JS vibe-code)
    let has_proto_pollution = t.contains("__proto__") || t.contains("constructor.prototype")
        || (t.contains("merge(") && t.contains("__proto__"))
        || lower.contains("object.assign") && lower.contains("userinput");

    // SSRF-prone patterns (AI often generates direct user-URL fetch)
    let has_ssrf_pattern = (t.contains("fetch(req.") || t.contains("fetch(params.")
        || t.contains("fetch(body.") || t.contains("fetch(url)")
        || lower.contains("requests.get(url)") || lower.contains("requests.post(url)"))
        && !lower.contains("allowlist") && !lower.contains("whitelist") && !lower.contains("validate_url");

    // XSS via innerHTML / document.write
    let has_xss_pattern = (t.contains("innerHTML") || t.contains("document.write(")
        || t.contains("outerHTML") || t.contains("insertAdjacentHTML"))
        && (t.contains("req.") || t.contains("params.") || t.contains("query.")
            || lower.contains("userinput") || lower.contains("user_input"));

    // Generic suspicious keyword density
    let suspicious_words: &[&str] = &[
        "secret", "token", "bearer", "credential", "private", "ssh", "pem",
        "apikey", "api-key", "inject", "bypass",
    ];
    let ngram_score = suspicious_words.iter().filter(|k| lower.contains(*k)).count() as u32;

    let mut keyword_hits = 0u32;
    for k in ["secret","password","token","api","key","auth","credential","private"] {
        keyword_hits += lower.matches(k).count() as u32;
    }

    // ── Risk scoring ──────────────────────────────────────────────────
    let mut score: i32 = 0;
    let mut reasons: Vec<&'static str> = Vec::new();

    // Critical (score 80-90)
    if has_private_key        { score += 90; reasons.push("private key"); }
    if has_ssn                { score += 80; reasons.push("SSN"); }
    if has_aws_key            { score += 80; reasons.push("AWS access key"); }
    if has_aws_secret_assign  { score += 85; reasons.push("AWS secret key assignment"); }
    if has_gh_pat             { score += 80; reasons.push("GitHub PAT"); }
    if has_credit_card        { score += 80; reasons.push("credit card (Luhn valid)"); }
    if has_ethereum           { score += 80; reasons.push("Ethereum key/address"); }
    if has_conn_creds         { score += 90; reasons.push("DB connection with credentials"); }
    else if has_conn          { score += 45; reasons.push("database connection string"); }
    if has_slack_webhook      { score += 85; reasons.push("Slack incoming webhook"); }
    if has_gcp_service_acct   { score += 85; reasons.push("GCP service account JSON"); }
    if has_azure_storage      { score += 85; reasons.push("Azure Storage connection string"); }
    if has_discord_token      { score += 80; reasons.push("Discord bot token"); }
    if has_shopify_key        { score += 80; reasons.push("Shopify API key"); }
    if has_pypi_token         { score += 80; reasons.push("PyPI upload token"); }

    // High (score 50-80)
    if has_stripe_key    { score += 70; reasons.push("Stripe API key"); }
    if has_slack_token   { score += 70; reasons.push("Slack token"); }
    if has_do_token      { score += 70; reasons.push("DigitalOcean access token"); }
    if has_linear_key    { score += 65; reasons.push("Linear API key"); }
    if has_mapbox_token  { score += 65; reasons.push("Mapbox access token"); }
    if has_pulumi_token  { score += 70; reasons.push("Pulumi access token"); }
    if has_supabase_key  { score += 65; reasons.push("Supabase JWT/service key"); }
    if has_jwt           { score += 60; reasons.push("JWT token"); }
    if (has_openai_key || has_api_key_word) && entropy > 3.5 {
                           score += 55; reasons.push("high-entropy API key"); }
    if has_passport      { score += 70; reasons.push("passport document"); }
    if has_drivers_license { score += 65; reasons.push("driver license"); }
    if has_medical       { score += 60; reasons.push("medical/patient data"); }
    if has_iban          { score += 65; reasons.push("bank account / IBAN"); }
    if has_tax_id        { score += 65; reasons.push("tax ID / SSN keyword"); }
    if has_seed_phrase   { score += 75; reasons.push("crypto seed phrase"); }

    // Medium-high (score 45-60)
    if has_password_assign { score += 50; reasons.push("password assignment"); }
    if has_secret_assign   { score += 50; reasons.push("secret assignment"); }
    if injection_hits >= 1 { score += 50; reasons.push("AI prompt injection"); }
    if shell_hits >= 1     { score += 45; reasons.push("dangerous shell/SQL"); }
    if has_bulk_email      { score += 45; reasons.push("bulk email list"); }
    if has_insurance       { score += 50; reasons.push("insurance policy"); }

    // AI Vibe-Code Safety (score 40-80)
    if has_eval_exec           { score += 60; reasons.push("unsafe eval/exec"); }
    if has_py_exec             { score += 55; reasons.push("dangerous Python exec/os.system"); }
    if has_sql_injection_pattern { score += 70; reasons.push("SQL injection via string concat"); }
    if has_hardcoded_creds     { score += 65; reasons.push("hardcoded credentials"); }
    if has_insecure_deser      { score += 75; reasons.push("insecure deserialization"); }
    if has_path_traversal      { score += 60; reasons.push("path traversal"); }
    if has_insecure_random     { score += 55; reasons.push("Math.random for security token"); }
    if has_disabled_tls        { score += 70; reasons.push("TLS verification disabled"); }
    if has_cmd_injection       { score += 75; reasons.push("command injection via user input"); }
    if has_proto_pollution     { score += 65; reasons.push("prototype pollution"); }
    if has_ssrf_pattern        { score += 60; reasons.push("SSRF-prone fetch pattern"); }
    if has_xss_pattern         { score += 65; reasons.push("XSS via innerHTML/user input"); }

    // Encoded / entropy
    if has_base64 && entropy > 4.5 { score += 30; reasons.push("encoded high-entropy data"); }
    if ngram_score >= 3  { score += 25; reasons.push("multiple secret patterns"); }
    if keyword_hits >= 5 { score += 20; reasons.push("many suspicious keywords"); }

    // Ambient signals
    if entropy > 4.5          { score += 15; reasons.push("high entropy"); }
    if digit_ratio > 0.40     { score += 10; reasons.push("high digit ratio"); }
    if special_ratio > 0.30   { score += 10; reasons.push("unusual char distribution"); }
    if upper_ratio > 0.25     { score +=  5; reasons.push("high uppercase ratio"); }
    if has_url && ngram_score > 0 { score += 10; reasons.push("url + suspicious keywords"); }

    let score = score.clamp(0, 100) as u16;

    let (decision, reason) = if score >= 85 {
        ("BLOCK".to_string(),
         format!("Critical: {}", reasons.into_iter().take(3).collect::<Vec<_>>().join(", ")))
    } else if score >= 60 {
        ("CHALLENGE".to_string(),
         format!("High: {}", reasons.into_iter().take(3).collect::<Vec<_>>().join(", ")))
    } else if score >= 40 {
        ("WARN".to_string(),
         format!("Medium: {}", reasons.into_iter().take(3).collect::<Vec<_>>().join(", ")))
    } else {
        ("ALLOW".to_string(), "No issues".to_string())
    };

    (score, decision, reason)
}
