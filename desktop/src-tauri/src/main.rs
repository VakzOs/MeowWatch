// Pas de fenêtre de console en plus de l'appli sous Windows.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    meow_watch_lib::run()
}
