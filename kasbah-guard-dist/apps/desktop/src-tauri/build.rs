fn main() {
    // Link CoreServices for FSEvents API (real-time filesystem monitoring)
    #[cfg(target_os = "macos")]
    println!("cargo:rustc-link-lib=framework=CoreServices");

    tauri_build::build()
}
