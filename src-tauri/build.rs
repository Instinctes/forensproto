use std::path::Path;

fn main() {
    // Bettet das ForensProto-Projektverzeichnis (Elternordner von src-tauri/)
    // als Compile-Zeit-Konstante ein. Damit weiß die gebaute App unabhängig
    // vom Arbeitsverzeichnis, mit dem Finder/launchd sie startet, wo sich
    // package.json / npm run start befindet – analog zu PROJECT_DIR im
    // bestehenden Bash-Launcher (packaging/build-macos-app.sh).
    let manifest_dir =
        std::env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR ist nicht gesetzt");
    let project_dir = Path::new(&manifest_dir)
        .parent()
        .expect("Kein Elternordner von src-tauri/ gefunden — Projektstruktur prüfen")
        .to_string_lossy()
        .to_string();
    println!("cargo:rustc-env=FORENSPROTO_PROJECT_DIR={project_dir}");
    println!("cargo:rerun-if-changed=tauri.conf.json");

    tauri_build::build()
}
