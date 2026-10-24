// Appli Windows (Tauri) : la fenêtre ouvre le site et lui injecte window.__MW_DESKTOP__ (relais local, version, mpv).
// Hors de l'appli, tout ceci vaut null et le site se comporte normalement.
import { Linking, Platform } from "react-native";

type Desktop = { relay: string; version: string; mpv?: boolean }; // mpv : lecteur intégré (appli 1.1.0 et plus)
export const desktop: Desktop | null = typeof window !== "undefined" ? (window as any).__MW_DESKTOP__ ?? null : null;

const tauri = () => (window as any).__TAURI__;
const current = () => tauri()?.window.getCurrentWindow();

/** Boutons de la fenêtre (la barre de Windows est masquée). */
export const win = {
  minimize: () => current()?.minimize(),
  toggleMaximize: () => current()?.toggleMaximize(),
  close: () => current()?.close(),
  /** Plein écran de la fenêtre (le plein écran HTML ne remplit que la fenêtre). */
  toggleFullscreen: async () => { const w = current(); if (w) await w.setFullscreen(!(await w.isFullscreen())); },
  isFullscreen: async (): Promise<boolean> => !!(await current()?.isFullscreen()),
};

/** Lien lu par le relais local : le lecteur avancé y a droit même si le serveur du debrid refuse (CORS). */
export const relayed = (url: string) => (desktop ? desktop.relay + encodeURIComponent(url) : null);

/** Mise à jour de l'appli téléchargée en fond : appelle `cb(version)` dès qu'elle est prête. */
export function onUpdate(cb: (version: string) => void) {
  const t = tauri();
  if (!t) return () => {};
  t.core.invoke("update_status").then((v: string | null) => v && cb(v), () => {});
  const off = t.event.listen("mw-update", (e: { payload: string }) => cb(e.payload));
  return () => { off.then((f: () => void) => f()); };
}
export const installUpdate = () => tauri()?.core.invoke("install_update");

/** Ouvre un lien hors de Meow Watch. Appli Windows : navigateur par défaut (sa fenêtre n'ouvre pas de popup ;
 *  les applis d'avant 1.2.0 n'ont pas la commande, on tente alors la popup). */
export function openExternal(url: string) {
  const open = () => (Platform.OS === "web" ? void window.open(url, "_blank", "noopener") : void Linking.openURL(url));
  const t = Platform.OS === "web" ? tauri() : null;
  if (t) t.core.invoke("open_url", { url }).catch(open);
  else open();
}
