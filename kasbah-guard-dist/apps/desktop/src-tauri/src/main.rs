#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod guard;

fn main() {
    guard::spawn_guard_service(); // start local authority
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running Kasbah Guard");
}
