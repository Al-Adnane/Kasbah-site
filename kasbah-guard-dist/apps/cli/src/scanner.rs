//! File and directory scanner using kasbah-kernel policy_preflight

use kasbah_kernel::{policy_preflight, redact_text};
use std::fs;
use std::io::{self, Read};
use walkdir::WalkDir;
use colored::*;

const TEXT_EXTENSIONS: &[&str] = &[
    "ts", "tsx", "js", "jsx", "mjs", "cjs",
    "py", "rb", "go", "rs", "java", "cpp", "c", "h",
    "json", "yaml", "yml", "toml", "env", "ini", "cfg",
    "md", "txt", "log", "sql", "sh", "bash", "zsh",
    "html", "css", "xml", "csv",
];

const CHUNK_SIZE: usize = 4096;

/// Constitutional AI service URL
const CONSTITUTIONAL_AI_URL: &str = "https://api.bekasbah.com/api/validate-intent";

#[derive(serde::Serialize)]
pub struct ScanResult {
    pub path: String,
    pub risk: u16,
    pub decision: String,
    pub reason: String,
    pub line_count: usize,
    pub chunks_scanned: usize,
}

#[derive(serde::Serialize, serde::Deserialize, Debug)]
pub struct IntentValidationResult {
    pub valid: bool,
    pub risk_score: f64,
    pub reasoning: String,
    pub blocked_rules: Vec<String>,
    pub requires_approval: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
}

/// Scan a single file in chunks, return the worst finding.
pub fn scan_file(path: &str) -> ScanResult {
    let content = match fs::read_to_string(path) {
        Ok(c) => c,
        Err(_) => return ScanResult { path: path.to_string(), risk: 0, decision: "ALLOW".to_string(), reason: "unreadable".to_string(), line_count: 0, chunks_scanned: 0 },
    };
    scan_content(path, &content)
}

/// Scan arbitrary text content, return the worst finding.
pub fn scan_content(label: &str, content: &str) -> ScanResult {
    let line_count = content.lines().count();
    let bytes = content.as_bytes();
    let mut max_risk = 0u16;
    let mut worst_decision = "ALLOW".to_string();
    let mut worst_reason = String::new();
    let mut chunks_scanned = 0;

    let mut i = 0;
    while i < bytes.len() {
        let end = std::cmp::min(i + CHUNK_SIZE, bytes.len());
        let chunk = std::str::from_utf8(&bytes[i..end]).unwrap_or("");
        let (risk, decision, reason) = policy_preflight(chunk);
        chunks_scanned += 1;
        if risk > max_risk {
            max_risk = risk;
            worst_decision = decision;
            worst_reason = reason;
        }
        if max_risk >= 100 { break; }
        i += CHUNK_SIZE;
    }

    // Handle empty input
    if chunks_scanned == 0 {
        return ScanResult { path: label.to_string(), risk: 0, decision: "ALLOW".to_string(), reason: "empty".to_string(), line_count: 0, chunks_scanned: 0 };
    }

    ScanResult { path: label.to_string(), risk: max_risk, decision: worst_decision, reason: worst_reason, line_count, chunks_scanned }
}

fn is_text_file(path: &str) -> bool {
    let ext = std::path::Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    TEXT_EXTENSIONS.contains(&ext.as_str())
}

fn is_ignored(name: &str) -> bool {
    matches!(name, "node_modules" | "target" | ".git" | "dist" | "build" | ".next")
}

/// Run a scan on a path (file, directory, or "-" for stdin). Returns exit code.
pub fn run_scan(path: &str, json_output: bool, min_risk: u16, max_depth: usize) -> i32 {
    // Handle stdin: `kasbah scan -`
    if path == "-" {
        let mut content = String::new();
        match io::stdin().read_to_string(&mut content) {
            Ok(_) => {}
            Err(e) => { eprintln!("Error reading stdin: {}", e); return 2; }
        }
        let result = scan_content("<stdin>", &content);
        let results = if result.risk >= min_risk { vec![result] } else { vec![] };
        if json_output {
            println!("{}", serde_json::to_string_pretty(&results).unwrap_or_default());
        } else {
            crate::reporter::print_results(&results);
        }
        let max_risk = results.iter().map(|r| r.risk).max().unwrap_or(0);
        return if max_risk >= 70 { 2 } else if max_risk >= 40 { 1 } else { 0 };
    }

    let metadata = match fs::metadata(path) {
        Ok(m) => m,
        Err(e) => { eprintln!("Error: {}", e); return 2; }
    };

    let mut results: Vec<ScanResult> = Vec::new();

    if metadata.is_file() {
        let r = scan_file(path);
        if r.risk >= min_risk { results.push(r); }
    } else {
        for entry in WalkDir::new(path).max_depth(max_depth).into_iter().flatten() {
            let p = entry.path();
            if let Some(name) = p.file_name().and_then(|n| n.to_str()) {
                if is_ignored(name) { continue; }
            }
            if p.is_file() {
                let ps = p.to_str().unwrap_or("");
                if is_text_file(ps) {
                    let r = scan_file(ps);
                    if r.risk >= min_risk { results.push(r); }
                }
            }
        }
    }

    results.sort_by(|a, b| b.risk.cmp(&a.risk));

    if json_output {
        println!("{}", serde_json::to_string_pretty(&results).unwrap_or_default());
    } else {
        crate::reporter::print_results(&results);
    }

    // Exit codes: 0 = all clean, 1 = warn, 2 = deny
    let max_risk = results.iter().map(|r| r.risk).max().unwrap_or(0);
    if max_risk >= 70 { 2 } else if max_risk >= 40 { 1 } else { 0 }
}

/// Redact a file in-place (or dry-run to stdout).
pub fn run_redact(file_path: &str, dry_run: bool) -> i32 {
    let content = match fs::read_to_string(file_path) {
        Ok(c) => c,
        Err(e) => { eprintln!("Error reading {}: {}", file_path, e); return 2; }
    };

    let findings = vec![];
    let redacted = redact_text(&content, &findings);

    if dry_run {
        println!("{}", redacted);
    } else {
        match fs::write(file_path, &redacted) {
            Ok(_) => println!("{} Redacted: {}", "✅".green(), file_path),
            Err(e) => { eprintln!("Error writing {}: {}", file_path, e); return 2; }
        }
    }
    0
}

/// Watch a path for changes and re-scan on every write event.
pub fn run_watch(path: &str, min_risk: u16, json_output: bool) -> i32 {
    use notify::{Watcher, RecursiveMode, Event, EventKind};
    use notify::event::ModifyKind;
    use std::sync::mpsc;

    let watch_path = match fs::canonicalize(path) {
        Ok(p) => p,
        Err(e) => { eprintln!("Error: cannot watch '{}': {}", path, e); return 2; }
    };

    println!("{} Watching: {}", "👁".cyan(), watch_path.display());
    println!("  Press Ctrl+C to stop.\n");

    let (tx, rx) = mpsc::channel::<notify::Result<Event>>();
    let mut watcher = match notify::recommended_watcher(tx) {
        Ok(w) => w,
        Err(e) => { eprintln!("Watcher error: {}", e); return 2; }
    };

    let recursive = if watch_path.is_dir() { RecursiveMode::Recursive } else { RecursiveMode::NonRecursive };
    if let Err(e) = watcher.watch(&watch_path, recursive) {
        eprintln!("Watch error: {}", e); return 2;
    }

    // Initial scan
    println!("{} Initial scan…", "🔍".yellow());
    run_scan(path, json_output, min_risk, 10);

    let mut last_exit = 0i32;

    for res in rx {
        match res {
            Ok(event) => {
                // Only re-scan on file modifications and creates
                let is_change = matches!(
                    event.kind,
                    EventKind::Modify(ModifyKind::Data(_)) |
                    EventKind::Modify(ModifyKind::Any) |
                    EventKind::Create(_)
                );

                if is_change {
                    for p in &event.paths {
                        let ext = p.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
                        if !TEXT_EXTENSIONS.contains(&ext.as_str()) { continue; }

                        let ps = p.to_str().unwrap_or("");
                        // Skip ignored dirs
                        if event.paths.iter().any(|pp| {
                            pp.components().any(|c| is_ignored(c.as_os_str().to_str().unwrap_or("")))
                        }) { continue; }

                        println!("\n{} Changed: {}", "📝".yellow(), ps);
                        let result = scan_file(ps);
                        let results = if result.risk >= min_risk { vec![result] } else { vec![] };

                        if json_output {
                            println!("{}", serde_json::to_string_pretty(&results).unwrap_or_default());
                        } else {
                            if results.is_empty() {
                                println!("{} Clean", "✅".green());
                            } else {
                                crate::reporter::print_results(&results);
                            }
                        }

                        let max_risk = results.iter().map(|r| r.risk).max().unwrap_or(0);
                        last_exit = if max_risk >= 70 { 2 } else if max_risk >= 40 { 1 } else { 0 };
                    }
                }
            }
            Err(e) => eprintln!("Watch event error: {}", e),
        }
    }

    last_exit
}

// ── Constitutional AI Intent Validation ─────────────────────────────────────

/// Local fallback: 5 Constitutional AI rule patterns (mirrors validator.ts)
struct LocalPolicy {
    rule_id: &'static str,
    #[allow(dead_code)]
    description: &'static str,
    severity_score: f64,
}

const LOCAL_POLICIES: &[LocalPolicy] = &[
    LocalPolicy {
        rule_id: "injection_attack",
        description: "Prompt injection attempt detected",
        severity_score: 1.0,
    },
    LocalPolicy {
        rule_id: "jailbreak_attempt",
        description: "Jailbreak attempt detected",
        severity_score: 1.0,
    },
    LocalPolicy {
        rule_id: "data_exfiltration",
        description: "Potential data exfiltration intent",
        severity_score: 0.75,
    },
    LocalPolicy {
        rule_id: "malware_intent",
        description: "Malware development or distribution intent",
        severity_score: 1.0,
    },
    LocalPolicy {
        rule_id: "privacy_violation",
        description: "Privacy violation intent",
        severity_score: 0.75,
    },
];

/// Check a single rule against intent text using regex-equivalent patterns
fn check_rule(rule_id: &str, text: &str) -> bool {
    let lower = text.to_lowercase();
    match rule_id {
        "injection_attack" => {
            lower.contains("ignore") && lower.contains("previous")
            || lower.contains("forget")
            || lower.contains("new instructions")
            || (lower.contains("role") && lower.contains("switch"))
        }
        "jailbreak_attempt" => {
            lower.contains("jailbreak")
            || lower.contains("bypass")
            || lower.contains("circumvent")
            || (lower.contains("disable") && lower.contains("safety"))
        }
        "data_exfiltration" => {
            lower.contains("exfiltrate")
            || lower.contains("steal")
            || lower.contains("leak")
            || (lower.contains("dump") && lower.contains("data"))
            || (lower.contains("extract") && lower.contains("credentials"))
            || lower.contains("credentials")
        }
        "malware_intent" => {
            lower.contains("malware")
            || lower.contains("ransomware")
            || lower.contains("botnet")
            || lower.contains("exploit")
            || lower.contains("shellcode")
        }
        "privacy_violation" => {
            lower.contains("spy")
            || lower.contains("dox")
            || lower.contains("doxx")
            || lower.contains("stalking")
            || lower.contains("harass")
            || lower.contains("blackmail")
        }
        _ => false,
    }
}

/// Calculate Shannon entropy of text (heuristic risk component)
fn calculate_entropy(text: &str) -> f64 {
    let mut freq = std::collections::HashMap::new();
    for ch in text.chars() {
        *freq.entry(ch).or_insert(0u64) += 1;
    }
    let len = text.chars().count() as f64;
    if len == 0.0 { return 0.0; }
    freq.values().fold(0.0f64, |acc, &count| {
        let p = count as f64 / len;
        acc - p * p.log2()
    })
}

/// Calculate repetition score (heuristic risk component)
fn calculate_repetition(text: &str) -> f64 {
    let words: Vec<&str> = text.split_whitespace().collect();
    if words.is_empty() { return 0.0; }
    let mut counts = std::collections::HashMap::new();
    for w in &words {
        *counts.entry(w.to_lowercase()).or_insert(0u64) += 1;
    }
    let max_rep = counts.values().copied().max().unwrap_or(0) as f64;
    max_rep / words.len() as f64
}

/// Local Constitutional AI validation (fallback when service is unavailable)
fn validate_intent_local(text: &str, _policy: &str) -> IntentValidationResult {
    let mut blocked_rules: Vec<String> = Vec::new();
    let mut max_severity: f64 = 0.0;

    for policy in LOCAL_POLICIES {
        if check_rule(policy.rule_id, text) {
            blocked_rules.push(policy.rule_id.to_string());
            if policy.severity_score > max_severity {
                max_severity = policy.severity_score;
            }
        }
    }

    // Heuristic risk
    let mut heuristic_risk: f64 = 0.0;
    if text.len() > 5000 { heuristic_risk += 0.1; }
    let entropy = calculate_entropy(text);
    if entropy > 5.5 { heuristic_risk += 0.15; }
    let repetition = calculate_repetition(text);
    if repetition > 0.3 { heuristic_risk += 0.1; }
    heuristic_risk = heuristic_risk.min(0.5);

    let risk_score = max_severity.max(heuristic_risk);
    let valid = risk_score < 0.5;
    let requires_approval = risk_score >= 0.4;

    let reasoning = if blocked_rules.is_empty() {
        format!(
            "Intent appears safe (risk score: {:.1}%). No constitutional violations detected.",
            risk_score * 100.0
        )
    } else {
        format!(
            "Intent rejected due to policy violations: {}. Risk score: {:.1}%. Requires manual review or approval.",
            blocked_rules.join(", "),
            risk_score * 100.0
        )
    };

    IntentValidationResult {
        valid,
        risk_score,
        reasoning,
        blocked_rules,
        requires_approval,
        source: Some("local-fallback".to_string()),
    }
}

/// Try to call the Constitutional AI service via HTTP; fall back to local validation.
fn validate_intent_via_service(text: &str, policy: &str) -> IntentValidationResult {
    let body = serde_json::json!({
        "intent": text,
        "policy_id": policy,
    });

    match ureq::post(CONSTITUTIONAL_AI_URL)
        .set("Content-Type", "application/json")
        .timeout(std::time::Duration::from_secs(3))
        .send_json(&body)
    {
        Ok(response) => {
            match response.into_json::<serde_json::Value>() {
                Ok(v) => {
                    // Parse the response from the service
                    let valid = v["valid"].as_bool().unwrap_or(true);
                    let risk_score = v["risk_score"].as_f64().unwrap_or(0.0);
                    let reasoning = v["reasoning"].as_str().unwrap_or("").to_string();
                    let blocked_rules: Vec<String> = v["blocked_rules"]
                        .as_array()
                        .map(|arr| arr.iter().filter_map(|x| x.as_str().map(|s| s.to_string())).collect())
                        .unwrap_or_default();
                    let requires_approval = v["requires_approval"].as_bool().unwrap_or(false);
                    IntentValidationResult {
                        valid,
                        risk_score,
                        reasoning,
                        blocked_rules,
                        requires_approval,
                        source: Some("constitutional-ai-service".to_string()),
                    }
                }
                Err(_) => validate_intent_local(text, policy),
            }
        }
        Err(_) => {
            // Service unavailable — use local fallback silently
            validate_intent_local(text, policy)
        }
    }
}

/// Print validation result in human-readable form
fn print_validation_result(result: &IntentValidationResult) {
    println!("Kasbah Guard — Constitutional AI Validator");
    println!("──────────────────────────────────────────");

    let status_icon = if result.valid { "✅" } else { "🚫" };
    let status_text = if result.valid { "VALID".green() } else { "BLOCKED".red() };
    println!("{} Status:    {}", status_icon, status_text);

    let risk_pct = result.risk_score * 100.0;
    let risk_display = if risk_pct >= 75.0 {
        format!("{:.1}%", risk_pct).red().to_string()
    } else if risk_pct >= 40.0 {
        format!("{:.1}%", risk_pct).yellow().to_string()
    } else {
        format!("{:.1}%", risk_pct).green().to_string()
    };
    println!("   Risk:     {}", risk_display);

    if !result.blocked_rules.is_empty() {
        println!("   Blocked:  {}", result.blocked_rules.join(", ").red());
    }

    if result.requires_approval {
        println!("   Approval: {}", "Required".yellow());
    }

    println!("   Reason:   {}", result.reasoning);

    if let Some(ref src) = result.source {
        println!("   Source:   {}", src.dimmed());
    }

    println!("──────────────────────────────────────────");
}

/// Validate user intent against Constitutional AI policies.
/// Returns exit code: 0 = valid, 1 = requires approval, 2 = blocked.
pub fn validate_intent(text: &str, policy: &str, json_out: bool) -> i32 {
    let result = validate_intent_via_service(text, policy);

    if json_out {
        println!("{}", serde_json::to_string_pretty(&result).unwrap_or_default());
    } else {
        print_validation_result(&result);
    }

    if !result.valid {
        2
    } else if result.requires_approval {
        1
    } else {
        0
    }
}

/// Entry point for the validate-intent subcommand.
pub fn run_validate_intent(text: Option<String>, from_stdin: bool, policy: &str, json_out: bool) -> i32 {
    let intent_text = if from_stdin || text.is_none() {
        // Read from stdin
        let mut content = String::new();
        match io::stdin().read_to_string(&mut content) {
            Ok(_) => content.trim().to_string(),
            Err(e) => {
                eprintln!("Error reading stdin: {}", e);
                return 2;
            }
        }
    } else {
        text.unwrap()
    };

    if intent_text.is_empty() {
        eprintln!("Error: intent text is empty. Provide text as argument or via --stdin.");
        return 2;
    }

    validate_intent(&intent_text, policy, json_out)
}
