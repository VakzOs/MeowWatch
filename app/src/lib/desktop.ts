// Appli Windows (Tauri) : la fenêtre ouvre le site et lui injecte window.__MW_DESKTOP__ (relais local, version).
// Hors de l'appli, tout ceci vaut null et le site se comporte normalement.
type Desktop = { relay: string; version: string };
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
