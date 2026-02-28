//! Output formatting for kasbah-cli scan results

use colored::*;
use crate::scanner::ScanResult;

pub fn print_results(results: &[ScanResult]) {
    if results.is_empty() {
        println!("{} No sensitive data found.", "✅".green());
        return;
    }

    println!("\n{} Kasbah Guard — Scan Results", "🛡️".normal());
    println!("{}", "─".repeat(72).dimmed());

    for r in results {
        let (icon, decision_colored) = match r.decision.as_str() {
            "DENY" => ("🚫", r.decision.red().bold()),
            "WARN" => ("⚠️ ", r.decision.yellow().bold()),
            _      => ("✅", r.decision.green().bold()),
        };

        let risk_bar = render_bar(r.risk);
        println!("{} {} [{}] {}", icon, r.path.cyan(), decision_colored, risk_bar);
        println!("   {} Risk: {}/100 · Lines: {} · Chunks: {}",
            "↳".dimmed(), r.risk, r.line_count, r.chunks_scanned);
        if !r.reason.is_empty() && r.reason != "Low risk" {
            let reasons: Vec<&str> = r.reason.split("; ").take(3).collect();
            for reason in &reasons {
                println!("     {} {}", "·".dimmed(), reason.yellow());
            }
        }
        println!();
    }

    println!("{}", "─".repeat(72).dimmed());

    let deny_count = results.iter().filter(|r| r.decision == "DENY").count();
    let warn_count = results.iter().filter(|r| r.decision == "WARN").count();

    if deny_count > 0 {
        println!("{} {} file(s) with DENY-level sensitive data", "🚫".normal(), deny_count.to_string().red().bold());
    }
    if warn_count > 0 {
        println!("{} {} file(s) with WARN-level findings", "⚠️ ".normal(), warn_count.to_string().yellow().bold());
    }
}

fn render_bar(risk: u16) -> String {
    let filled = (risk as usize * 20) / 100;
    let empty = 20 - filled;
    let bar: String = format!("[{}{}]", "█".repeat(filled), "░".repeat(empty));
    match risk {
        70..=100 => bar.red().to_string(),
        40..=69  => bar.yellow().to_string(),
        _        => bar.green().to_string(),
    }
}
