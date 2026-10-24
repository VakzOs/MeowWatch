//! Meow Watch pour Windows : une fenêtre sans barre Windows qui ouvre le site (l'interface se met à jour avec lui),
//! un relais local pour le lecteur avancé, et des mises à jour de l'appli téléchargées en fond.
mod relay;

use std::sync::Mutex;
use tauri::{webview::Color, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_updater::{Update, UpdaterExt};

const SITE: &str = "https://meowwatch.vkzdev.com";

/// Secours : si le site n'affiche pas sa barre (ancienne version, page en erreur), boutons de la fenêtre et zone pour la
/// déplacer, ajoutés par l'appli au bout de 4 s. Sinon la fenêtre sans bordure ne pourrait ni bouger ni se fermer.
const FALLBACK_BAR: &str = r#"
setTimeout(function () {
  if (document.querySelector('[data-mw-caption]') || !window.__TAURI__) return;
  var w = window.__TAURI__.window.getCurrentWindow();
  var bar = document.createElement('div');
  bar.setAttribute('data-tauri-drag-region', '');
  bar.style.cssText = 'position:fixed;top:0;left:0;right:0;height:32px;z-index:2147483647;display:flex;justify-content:flex-end';
  [['M0 5.5h10', function () { w.minimize(); }], ['M.5 .5h9v9h-9z', function () { w.toggleMaximize(); }], ['M0 0l10 10M10 0L0 10', function () { w.close(); }, true]].forEach(function (b) {
    var e = document.createElement('div');
    e.style.cssText = 'width:46px;height:32px;display:grid;place-items:center;color:#e8e8e8;background:rgba(0,0,0,.35)';
    e.innerHTML = '<svg width="10" height="10" viewBox="0 0 10 10"><path d="' + b[0] + '" stroke="currentColor" fill="none"/></svg>';
    e.onmouseenter = function () { e.style.background = b[2] ? '#C42B1C' : 'rgba(255,255,255,.12)'; };
    e.onmouseleave = function () { e.style.background = 'rgba(0,0,0,.35)'; };
    e.onclick = b[1];
    bar.appendChild(e);
  });
  document.body.appendChild(bar);
}, 4000);
"#;

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
                "window.__MW_DESKTOP__ = {{ relay: 'http://127.0.0.1:{}/?t={}&u=', version: '{}' }};{}",
                relay.port,
                relay.token,
                app.package_info().version,
                FALLBACK_BAR
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
