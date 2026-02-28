//! File and directory scanner using kasbah-kernel policy_preflight

use kasbah_kernel::{policy_preflight, redact_text};
use std::fs;
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

#[derive(serde::Serialize)]
pub struct ScanResult {
    pub path: String,
    pub risk: u16,
    pub decision: String,
    pub reason: String,
    pub line_count: usize,
    pub chunks_scanned: usize,
}

/// Scan a single file in chunks, return the worst finding.
pub fn scan_file(path: &str) -> ScanResult {
    let content = match fs::read_to_string(path) {
        Ok(c) => c,
        Err(_) => return ScanResult { path: path.to_string(), risk: 0, decision: "ALLOW".to_string(), reason: "unreadable".to_string(), line_count: 0, chunks_scanned: 0 },
    };

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

    ScanResult { path: path.to_string(), risk: max_risk, decision: worst_decision, reason: worst_reason, line_count, chunks_scanned }
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

/// Run a scan on a path (file or directory). Returns exit code.
pub fn run_scan(path: &str, json_output: bool, min_risk: u16, max_depth: usize) -> i32 {
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
