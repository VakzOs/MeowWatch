fn main() {
    // Commandes de l'appli appelables par le site (autorisées dans capabilities/site.json).
    let manifest = tauri_build::AppManifest::new().commands(&["update_status", "install_update"]);
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(manifest)).expect("tauri-build");
}
