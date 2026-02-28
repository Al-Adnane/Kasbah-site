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
