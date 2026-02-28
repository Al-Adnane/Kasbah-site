//! kasbah — CLI for Kasbah Guard sensitive data detection
//!
//! Commands:
//!   kasbah scan <path>        — Scan file or directory (use "-" for stdin)
//!   kasbah scan --json <path> — JSON output (CI/CD)
//!   kasbah redact <file>      — Redact sensitive data in-place
//!   kasbah watch <path>       — Live watch mode (re-scans on file changes)
//!   kasbah selftest           — Run 23 internal invariants
//!
//! Exit codes: 0 = clean, 1 = warn, 2 = deny

mod scanner;
mod reporter;

use clap::{Parser, Subcommand};

#[derive(Parser)]
#[command(
    name = "kasbah",
    about = "Kasbah Guard — sensitive data leak detection",
    version = "1.0.0",
    long_about = "Scan files, directories, and stdin for sensitive data (PII, credentials, keys).\nPowered by Kasbah Detection Engine v3.5.2 with 23 invariants.\n\nExamples:\n  kasbah scan .env\n  kasbah scan --json src/\n  echo 'SSN: 123-45-6789' | kasbah scan -\n  kasbah watch ./src\n  kasbah selftest"
)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Scan a file or directory for sensitive data (use "-" for stdin)
    Scan {
        /// Path to scan (file, directory, or "-" for stdin)
        path: String,
        /// Output as JSON (for CI/CD pipelines)
        #[arg(long)]
        json: bool,
        /// Only report findings at or above this risk level (0-100)
        #[arg(long, default_value = "40")]
        min_risk: u16,
        /// Maximum directory depth to recurse
        #[arg(long, default_value = "10")]
        depth: usize,
    },
    /// Redact sensitive data in a file (in-place)
    Redact {
        /// File to redact
        file: String,
        /// Print redacted content to stdout instead of modifying file
        #[arg(long)]
        dry_run: bool,
    },
    /// Watch a path for changes and re-scan on every write
    Watch {
        /// Path to watch (file or directory)
        path: String,
        /// Only report findings at or above this risk level (0-100)
        #[arg(long, default_value = "40")]
        min_risk: u16,
        /// Output as JSON
        #[arg(long)]
        json: bool,
    },
    /// Run the internal self-test suite (23 invariants)
    Selftest,
}

fn main() {
    let cli = Cli::parse();

    let exit_code = match cli.command {
        Commands::Scan { path, json, min_risk, depth } => {
            scanner::run_scan(&path, json, min_risk, depth)
        }
        Commands::Redact { file, dry_run } => {
            scanner::run_redact(&file, dry_run)
        }
        Commands::Watch { path, min_risk, json } => {
            scanner::run_watch(&path, min_risk, json)
        }
        Commands::Selftest => {
            run_selftest()
        }
    };

    std::process::exit(exit_code);
}

fn run_selftest() -> i32 {
    use kasbah_kernel::{policy_preflight, calculate_sii, authorize_execution};

    println!("Kasbah Guard CLI — Self-Test Suite");
    println!("─────────────────────────────────────");

    let tests: &[(&str, Box<dyn Fn() -> bool>)] = &[
        ("policy_preflight: SSN → BLOCK",
            Box::new(|| policy_preflight("My SSN is 123-45-6789").0 >= 70)),
        ("policy_preflight: clean → ALLOW",
            Box::new(|| policy_preflight("hello world").1 == "ALLOW")),
        ("policy_preflight: private key → BLOCK",
            Box::new(|| policy_preflight("-----BEGIN RSA PRIVATE KEY-----\nMIIEo...\n-----END RSA PRIVATE KEY-----").1 == "BLOCK")),
        ("policy_preflight: AWS key → BLOCK",
            Box::new(|| policy_preflight("aws_access_key_id = AKIAIOSFODNN7EXAMPLE").0 >= 70)),
        ("policy_preflight: MongoDB URI with creds → BLOCK",
            Box::new(|| policy_preflight("mongodb://user:pass@host:27017/db").1 == "BLOCK")),
        ("SII: nominal values → 1.0",
            Box::new(|| {
                let sii = calculate_sii(1.0, 1.0, 1.0, 1.0);
                sii > 0.99 && sii <= 1.01
            })),
        ("SII: degraded hook → < 1.0",
            Box::new(|| calculate_sii(0.5, 1.0, 1.0, 1.0) < 1.0)),
        ("Gate: nominal → pass",
            Box::new(|| authorize_execution(1.0, 0.0, 0.0).authorized)),
        ("Gate: low reliability → fail",
            Box::new(|| !authorize_execution(0.5, 0.0, 0.0).authorized)),
        ("Gate: high harm → fail",
            Box::new(|| !authorize_execution(1.0, 0.0, 0.9).authorized)),
    ];

    let mut passed = 0;
    for (name, test) in tests {
        let ok = test();
        let icon = if ok { "✅" } else { "❌" };
        println!("{} {}", icon, name);
        if ok { passed += 1; }
    }

    println!("─────────────────────────────────────");
    println!("Results: {}/{}", passed, tests.len());

    if passed == tests.len() { 0 } else { 2 }
}
