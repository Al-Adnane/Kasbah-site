//! Kasbah Guard Mobile — Library entry point
//! Called by both iOS and Android app delegates.

mod moats;

#[allow(unused_imports)]
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // ── Mobile plugins ──
        .plugin(tauri_plugin_haptics::init())
        // ── Managed state (mirrors desktop pattern) ──
        .manage(moats::MoatTelemetry(std::sync::Mutex::new(
            kasbah_moats::telemetry::TelemetryBuffer::new(),
        )))
        .manage(moats::MoatEvolution(std::sync::Mutex::new(
            kasbah_moats::evolution::EvolutionEngine::new(),
        )))
        .manage(moats::MoatCapabilities(std::sync::Mutex::new(Vec::new())))
        // ── IPC command handler ──
        .invoke_handler(tauri::generate_handler![
            // Core preflight (policy_preflight via kasbah-moats)
            preflight_text,
            // Moat F: SII
            moats::get_system_integrity,
            // Moat O: Three-Gate
            moats::check_execution_gates,
            // Moat K: Capabilities
            moats::grant_capability,
            moats::authorize_data_request,
            // Moat N: Telemetry
            moats::record_detection_event,
            moats::get_telemetry_metrics,
            moats::export_telemetry,
            moats::clear_telemetry,
            // Moat H: Evolution
            moats::record_pattern_feedback,
            moats::get_pattern_stats,
            moats::get_pattern_priority_order,
            moats::export_pattern_evolution,
            // Redaction + Audit
            moats::redact_content,
            moats::audit_event,
        ])
        .setup(|app| {
            // Handle shared text from iOS Share Sheet / Android intent
            // The share plugin delivers shared content as a "shared-text" event
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                // Platform-specific share extension handling is wired through
                // tauri-plugin-share in tauri.conf.json. The plugin fires a
                // "shared-text" event which the Svelte UI listens for.
                let _ = handle; // Referenced to avoid dead code warning
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Kasbah Guard Mobile");
}

// ─── Core preflight command ───────────────────────────────────────────────

#[tauri::command]
fn preflight_text(text: String) -> serde_json::Value {
    let (risk, decision, reason) = kasbah_moats::policy_preflight(&text);
    serde_json::json!({
        "risk": risk,
        "decision": decision,
        "reason": reason,
        "len": text.len()
    })
}
