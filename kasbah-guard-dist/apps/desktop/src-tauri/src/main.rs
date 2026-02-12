#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod guard;

use std::process::Command;

#[tauri::command]
fn install_extension(app: tauri::AppHandle) -> Result<String, String> {
    // 1. Find the bundled extension in the app resources
    //    Tauri v2 bundles resources alongside the binary
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let exe_dir = exe.parent().ok_or("No parent dir")?;

    // In macOS .app bundle: Contents/MacOS/<binary>
    // Resources are at: Contents/Resources/extension/
    let resources_dir = exe_dir
        .parent() // Contents
        .ok_or("No Contents")?
        .join("Resources")
        .join("extension");

    // Fallback: check next to binary (dev mode)
    let ext_source = if resources_dir.exists() {
        resources_dir
    } else {
        // Dev mode: look in src-tauri/extension
        let dev_path = exe_dir.join("extension");
        if dev_path.exists() {
            dev_path
        } else {
            return Err("Extension bundle not found. Rebuild the app.".to_string());
        }
    };

    // 2. Copy to a stable user-writable location
    let home = std::env::var("HOME").map_err(|e| e.to_string())?;
    let ext_dest = std::path::PathBuf::from(&home)
        .join("Library")
        .join("Application Support")
        .join("KasbahGuard")
        .join("extension");

    // Always refresh
    if ext_dest.exists() {
        let _ = std::fs::remove_dir_all(&ext_dest);
    }
    copy_dir_all(&ext_source, &ext_dest).map_err(|e| e.to_string())?;

    // 3. Copy extension path to clipboard
    let ext_path_str = ext_dest.to_string_lossy().to_string();
    let _ = Command::new("pbcopy")
        .stdin(std::process::Stdio::piped())
        .spawn()
        .and_then(|mut child| {
            use std::io::Write;
            if let Some(ref mut stdin) = child.stdin {
                let _ = stdin.write_all(ext_path_str.as_bytes());
            }
            child.wait()
        });

    // 4. Open chrome://extensions in the detected browser
    let _ = open_browser_extensions_page();

    Ok(ext_path_str)
}

#[tauri::command]
fn get_extension_path() -> Result<String, String> {
    let home = std::env::var("HOME").map_err(|e| e.to_string())?;
    let ext_dest = std::path::PathBuf::from(&home)
        .join("Library")
        .join("Application Support")
        .join("KasbahGuard")
        .join("extension");
    if ext_dest.exists() {
        Ok(ext_dest.to_string_lossy().to_string())
    } else {
        Err("Extension not installed yet".to_string())
    }
}

#[tauri::command]
fn open_chrome_extensions() -> Result<(), String> {
    open_browser_extensions_page().map_err(|e| e.to_string())
}

fn open_browser_extensions_page() -> Result<(), Box<dyn std::error::Error>> {
    let browsers: &[(&str, &str)] = &[
        ("/Applications/Google Chrome.app", "chrome://extensions"),
        ("/Applications/Microsoft Edge.app", "edge://extensions"),
        ("/Applications/Opera.app", "opera://extensions"),
        ("/Applications/Brave Browser.app", "brave://extensions"),
    ];

    for (app_path, ext_url) in browsers {
        if std::path::Path::new(app_path).exists() {
            Command::new("open")
                .arg("-a")
                .arg(app_path)
                .arg(ext_url)
                .spawn()?;
            return Ok(());
        }
    }

    // Fallback
    Command::new("open").arg("chrome://extensions").spawn()?;
    Ok(())
}

fn copy_dir_all(src: &std::path::Path, dst: &std::path::Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let dst_path = dst.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir_all(&entry.path(), &dst_path)?;
        } else {
            std::fs::copy(entry.path(), &dst_path)?;
        }
    }
    Ok(())
}

fn main() {
    guard::spawn_guard_service();
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            install_extension,
            get_extension_path,
            open_chrome_extensions
        ])
        .run(tauri::generate_context!())
        .expect("error while running Kasbah Guard");
}
