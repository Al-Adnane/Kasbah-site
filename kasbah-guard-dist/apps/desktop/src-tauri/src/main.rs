#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod guard;
mod moats;
mod handlers;
mod quantum_crypto;

use std::env;

#[tauri::command]
fn preflight_text(text: String) -> serde_json::Value {
  let (risk, decision, reason) = guard::policy_preflight(&text);
  serde_json::json!({
    "risk": risk,
    "decision": decision,
    "reason": reason,
    "len": text.len()
  })
}

/// Tauri IPC command: restore session from persistent file + Keychain.
/// This is called by the webview JS on startup to bypass HTTP fetch issues.
/// Returns {ok: true, user: {...}} or {ok: false}.
#[tauri::command]
fn get_session() -> serde_json::Value {
  match guard::get_persistent_session() {
    Some(session) => {
      let email = session.get("email").and_then(|e| e.as_str()).unwrap_or("");
      let name = session.get("name").and_then(|n| n.as_str()).unwrap_or("");
      let role = session.get("role").and_then(|r| r.as_str()).unwrap_or("owner");
      let uid = session.get("user_id").and_then(|u| u.as_i64()).unwrap_or(1);
      serde_json::json!({
        "ok": true,
        "user": {"email": email, "name": name, "role": role, "id": uid},
        "source": "tauri_ipc"
      })
    }
    None => serde_json::json!({"ok": false})
  }
}

fn main() {
  eprintln!("KASBAH_GUARD_BOOT");

  // CLI self-test (bypass UI/hotkeys)
  {
    let args: Vec<String> = env::args().collect();
    if args.len() >= 2 && args[1] == "--selftest" {
      let text = if args.len() >= 3 {
        args[2..].join(" ")
      } else {
        "sk-test-THIS_IS_NOT_REAL_1234567890".to_string()
      };
      eprintln!("KASBAH_SELFTEST_INPUT_LEN={}", text.len());
      let (risk, decision, reason) = guard::policy_preflight(&text);
      eprintln!(
        "KASBAH_SELFTEST risk={:?} decision={:?} reason={:?}",
        risk, decision, reason
      );
      std::process::exit(0);
    }
  }

  // Start the guard HTTP service on 127.0.0.1:8788
  guard::spawn_guard_service();
  eprintln!("KASBAH_GUARD_SERVICE_SPAWNED port=8788");

  // Wait for the guard HTTP server to be ready (webview loads from it)
  for i in 0..50 {
    if std::net::TcpStream::connect("127.0.0.1:8788").is_ok() {
      eprintln!("KASBAH_GUARD_READY after {}ms", i * 100);
      break;
    }
    std::thread::sleep(std::time::Duration::from_millis(100));
  }

  // Initialize quantum crypto engine (may fail on some systems, continue anyway)
  let quantum_engine = quantum_crypto::QuantumCryptoEngine::new()
    .unwrap_or_else(|e| {
      eprintln!("KASBAH_QUANTUM_INIT_WARNING: {}", e);
      // Return a dummy engine if initialization fails
      quantum_crypto::QuantumCryptoEngine::new().unwrap()
    });

  tauri::Builder::default()
    .plugin(tauri_plugin_clipboard_manager::init())
    // Register moat state (Mutex-wrapped for thread safety)
    .manage(moats::MoatTelemetry(std::sync::Mutex::new(
        kasbah_moats::telemetry::TelemetryBuffer::new(),
    )))
    .manage(moats::MoatEvolution(std::sync::Mutex::new(
        kasbah_moats::evolution::EvolutionEngine::new(),
    )))
    .manage(moats::MoatCapabilities(std::sync::Mutex::new(Vec::new())))
    .manage(quantum_engine)
    .invoke_handler(tauri::generate_handler![
        preflight_text,
        get_session,
        // Moat F: System Integrity Index
        moats::get_system_integrity,
        // Moat O: Three-Gate Execution
        moats::check_execution_gates,
        // Moat K: Capability-Based ABAC
        moats::grant_capability,
        moats::authorize_data_request,
        // Moat N: Privacy Telemetry
        moats::record_detection_event,
        moats::get_telemetry_metrics,
        moats::export_telemetry,
        moats::clear_telemetry,
        // Moat H: Pattern Evolution
        moats::record_pattern_feedback,
        moats::get_pattern_stats,
        moats::get_pattern_priority_order,
        moats::export_pattern_evolution,
        // Redaction + Audit
        moats::redact_content,
        moats::audit_event,
        // Quantum Crypto Handlers (PHASE A Task 1)
        handlers::quantum_handler::sign_detection,
        handlers::quantum_handler::verify_detection,
        handlers::quantum_handler::export_audit_proof,
    ])
    .plugin(tauri_plugin_dialog::init())
    .setup(|app| {
      #[cfg(desktop)]
      {
        use tauri_plugin_clipboard_manager::ClipboardExt;
        #[allow(unused_imports)]
        use tauri_plugin_dialog::DialogExt;
        use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

        let sk = if cfg!(target_os = "macos") {
          Shortcut::new(Some(Modifiers::META | Modifiers::SHIFT), Code::KeyK)
        } else {
          Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyK)
        };

        app.handle().plugin(
          tauri_plugin_global_shortcut::Builder::new()
            .with_handler(move |app, shortcut, event| {
              if shortcut == &sk {
                if let ShortcutState::Pressed = event.state() {
                  let txt = app.clipboard().read_text().unwrap_or_default();
                  eprintln!("KASBAH_GS_HANDLER clip_len={}", txt.len());
                  let (risk, decision, reason) = guard::policy_preflight(&txt);
                  eprintln!("KASBAH_GS_PREFLIGHT risk={:?} decision={:?} reason={:?}", risk, decision, reason);
                  if decision != "ALLOW" {
                    let _body = format!("Decision: {}\nRisk: {}\nReason: {}", decision, risk, reason);
                  }
                }
              }
            })
            .build(),
        )?;

        app.global_shortcut().register(sk)?;
        eprintln!("KASBAH_GS_READY");
      }

      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

// Billing Kernel Integration
use kasbah_kernel::BillingKernel;

fn init_billing() -> BillingKernel {
    BillingKernel::new("kasbah.db").expect("Failed to initialize billing kernel")
}

#[allow(dead_code)]
fn check_and_enforce(user_id: &str, action: &str, receipt_hash: &str) -> Result<String, String> {
    let billing = init_billing();
    let (allowed, _reason) = billing.consume_guard(user_id, action, receipt_hash)
        .map_err(|e| e.to_string())?;
    if !allowed {
        return Ok("GUARDS_EXHAUSTED".to_string());
    }
    Ok("ENFORCED".to_string())
}
