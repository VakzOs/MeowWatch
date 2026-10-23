//! Meow Watch pour Windows : une fenêtre sans barre Windows qui ouvre le site (l'interface se met à jour avec lui),
//! un relais local pour le lecteur avancé, et des mises à jour de l'appli téléchargées en fond.
mod relay;

use std::sync::Mutex;
use tauri::{webview::Color, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_updater::{Update, UpdaterExt};

const SITE: &str = "https://meowwatch.vkzdev.com";

/// Mise à jour déjà téléchargée, installée quand on clique sur « Redémarrer ».
#[derive(Default)]
struct Pending(Mutex<Option<(Update, Vec<u8>)>>);

#[tauri::command]
fn update_status(pending: tauri::State<Pending>) -> Option<String> {
    pending.0.lock().unwrap().as_ref().map(|(u, _)| u.version.clone())
}

#[tauri::command]
fn install_update(app: tauri::AppHandle, pending: tauri::State<Pending>) -> Result<(), String> {
    let (update, bytes) = pending.0.lock().unwrap().take().ok_or("aucune mise à jour prête")?;
    update.install(bytes).map_err(|e| e.to_string())?;
    app.restart()
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(Pending::default())
        .invoke_handler(tauri::generate_handler![update_status, install_update])
        .setup(|app| {
            let relay = relay::start(SITE);
            // Le site sait qu'il tourne dans l'appli, et où trouver le relais (avant ses propres scripts).
            let init = format!(
                "window.__MW_DESKTOP__ = {{ relay: 'http://127.0.0.1:{}/?t={}&u=', version: '{}' }};",
                relay.port,
                relay.token,
                app.package_info().version
            );
            WebviewWindowBuilder::new(app, "main", WebviewUrl::External(SITE.parse().expect("adresse du site")))
                .title("Meow Watch")
                .inner_size(1280.0, 800.0)
                .min_inner_size(960.0, 600.0)
                .center()
                .decorations(false) // seuls nos 3 boutons, dessinés par le site
                .shadow(true) // ombre et coins arrondis de Windows 11
                .background_color(Color(18, 18, 20, 255)) // pas d'éclair blanc au lancement
                .initialization_script(&init)
                .build()?;

            // Mise à jour : vérifiée au lancement, téléchargée en fond, appliquée quand on veut.
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let Ok(updater) = handle.updater() else { return };
                if let Ok(Some(update)) = updater.check().await {
                    if let Ok(bytes) = update.download(|_, _| {}, || {}).await {
                        let version = update.version.clone();
                        *handle.state::<Pending>().0.lock().unwrap() = Some((update, bytes));
                        let _ = handle.emit("mw-update", version);
                    }
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Meow Watch n'a pas pu démarrer");
}
