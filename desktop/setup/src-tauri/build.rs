// L'installateur Tauri (NSIS) de l'appli est embarqué dans ce programme : son chemin arrive par MW_SETUP (CI).
// Sans lui (build local), un fichier vide : l'installation affichera une erreur claire.
fn main() {
    println!("cargo:rerun-if-env-changed=MW_SETUP");
    let out = std::path::Path::new(&std::env::var("OUT_DIR").unwrap()).join("setup.exe");
    match std::env::var("MW_SETUP") {
        Ok(path) => { std::fs::copy(&path, &out).expect("MW_SETUP introuvable"); println!("cargo:rerun-if-changed={path}"); }
        Err(_) => std::fs::write(&out, b"").unwrap(),
    }
    tauri_build::build()
}
