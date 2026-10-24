# Meow Watch pour Windows

Appli Tauri 2 : une fenêtre sans barre Windows qui ouvre https://meowwatch.vkzdev.com (l'interface se met à jour avec
le site), plus ce que le navigateur ne peut pas faire :

- **relais local** (`src-tauri/src/relay.rs`) : lit les liens debrid pour le lecteur avancé malgré CORS (langue audio,
  sous-titres du fichier, MKV/HEVC/DTS), comme le serveur de streaming de Stremio. Origine vérifiée + jeton par lancement ;
- **boutons de la fenêtre** dessinés par le site (`app/src/components/TitleBar.tsx`), déplacement par `data-tauri-drag-region` ;
- **mises à jour** : vérifiées au lancement, téléchargées en fond, appliquées au redémarrage (plugin updater, signées).

## Publier une version

1. Monter `version` dans `src-tauri/tauri.conf.json` et `src-tauri/Cargo.toml`.
2. `git tag windows-vX.Y.Z && git push origin windows-vX.Y.Z` : le workflow « Appli Windows » construit l'installateur et
   publie la Release avec `latest.json`. Les applis installées la proposent au lancement suivant.

Secret GitHub requis : `TAURI_SIGNING_PRIVATE_KEY` (clé privée de signature ; la clé publique est dans `tauri.conf.json`).
Si cette clé est perdue, les applis installées ne pourront plus se mettre à jour (il faudrait réinstaller).

## Tester

- `cd src-tauri && cargo test --lib` : tests du relais.
- Sous Windows : `npm ci && npx tauri dev` (ouvre l'appli sur le site en ligne).
