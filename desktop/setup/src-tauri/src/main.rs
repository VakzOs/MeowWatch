// Installateur au design de Meow Watch : il lance en silence l'installateur Tauri (NSIS) embarqué, qui reste celui
// des mises à jour et de la désinstallation, puis règle les options choisies (raccourci, démarrage de Windows).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::PathBuf;
use std::process::Command;

const SETUP: &[u8] = include_bytes!(concat!(env!("OUT_DIR"), "/setup.exe"));

/// Commande sans fenêtre de console (PowerShell, reg).
fn hidden(program: &str) -> Command {
    #[allow(unused_mut)]
    let mut c = Command::new(program);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        c.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    c
}

/// L'exécutable de l'appli installée (%LocalAppData%\Meow Watch\*.exe, hors désinstalleur).
fn app_exe() -> Option<PathBuf> {
    let dir = PathBuf::from(std::env::var("LOCALAPPDATA").ok()?).join("Meow Watch");
    std::fs::read_dir(dir).ok()?.flatten().map(|e| e.path()).find(|p| {
        let name = p.file_name().and_then(|n| n.to_str()).unwrap_or("").to_lowercase();
        name.ends_with(".exe") && !name.starts_with("uninstall")
    })
}

fn run(c: &mut Command) -> Result<(), String> {
    let s = c.status().map_err(|e| e.to_string())?;
    if s.success() { Ok(()) } else { Err(format!("code de sortie {:?}", s.code())) }
}

fn install_blocking(desktop: bool, launch: bool, startup: bool) -> Result<(), String> {
    if SETUP.is_empty() {
        return Err("Cet installateur a été construit sans l'appli (build local).".into());
    }
    let dir = std::env::temp_dir().join("meow-watch-setup");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let setup = dir.join("Meow Watch setup.exe");
    std::fs::write(&setup, SETUP).map_err(|e| e.to_string())?;
    // /S : silencieux ; /R : lance l'appli à la fin (en tant que l'utilisateur, pas en tant que l'installateur).
    let mut args = vec!["/S"];
    if launch { args.push("/R"); }
    let result = run(Command::new(&setup).args(&args)).map_err(|e| format!("L'installation de Meow Watch a échoué ({e})."));
    let _ = std::fs::remove_file(&setup);
    result?;

    let exe = app_exe().ok_or("Meow Watch est introuvable après l'installation.")?.to_string_lossy().into_owned();
    let ps_exe = exe.replace('\'', "''"); // apostrophes doublées pour PowerShell
    // Raccourci sur le Bureau (dossier réel, même redirigé vers OneDrive) : créé ou retiré selon la case.
    let ps = if desktop {
        format!("$d=[Environment]::GetFolderPath('Desktop'); $s=(New-Object -ComObject WScript.Shell).CreateShortcut(\"$d\\Meow Watch.lnk\"); $s.TargetPath='{ps_exe}'; $s.Save()")
    } else {
        "$d=[Environment]::GetFolderPath('Desktop'); Remove-Item -ErrorAction SilentlyContinue \"$d\\Meow Watch.lnk\"".into()
    };
    let _ = run(hidden("powershell").args(["-NoProfile", "-NonInteractive", "-Command", &ps]));
    // Démarrage de Windows : clé Run du compte (retirée par le désinstalleur, voir windows/hooks.nsh de l'appli).
    let key = r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run";
    let _ = if startup {
        run(hidden("reg").args(["add", key, "/v", "Meow Watch", "/t", "REG_SZ", "/d", &format!("\"{exe}\""), "/f"]))
    } else {
        run(hidden("reg").args(["delete", key, "/v", "Meow Watch", "/f"]))
    };
    Ok(())
}

#[tauri::command]
async fn install(desktop: bool, launch: bool, startup: bool) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || install_blocking(desktop, launch, startup)).await.map_err(|e| e.to_string())?
}

#[tauri::command]
fn open_app(app: tauri::AppHandle) {
    if let Some(exe) = app_exe() { let _ = Command::new(exe).spawn(); }
    app.exit(0);
}

#[tauri::command]
fn quit(app: tauri::AppHandle) { app.exit(0); }

#[tauri::command]
fn version(app: tauri::AppHandle) -> String { app.package_info().version.to_string() }

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![install, open_app, quit, version])
        .run(tauri::generate_context!())
        .expect("installateur");
}
