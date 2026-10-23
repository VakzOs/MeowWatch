// Moteurs de lecture du web. « avancé » : libmedia (WASM) décode le fichier lui-même : MKV, HEVC, DTS/AC3, pistes audio
// et sous-titres intégrés. Il doit pouvoir lire le lien (CORS). Sinon, « navigateur » : la balise <video>, comme avant.
import { langCode, trackLabel } from "./lang";

export type Track = { id: number; lang: string; label: string; forced?: boolean };
export type Engine = {
  kind: "avance" | "navigateur";
  time(): number; duration(): number;
  play(): Promise<void>; pause(): void; seek(s: number): void;
  setRate(r: number): void; setVolume(v: number): void;
  audio: Track[]; subs: Track[]; audioId: number; subId: number; // subId -1 : sous-titres désactivés
  selectAudio(id: number): Promise<void>; selectSub(id: number): Promise<void>;
  canDelay: boolean; setSubDelay(s: number): void;
  suspended(): boolean; resume(): Promise<void>; // son bloqué par le navigateur tant qu'on n'a pas cliqué
  resize(): void; destroy(): void;
};

const FORCED = 0x40, SDH = 0x80; // AV_DISPOSITION_* de FFmpeg
const CHANNELS: Record<number, string> = { 1: "Mono", 2: "Stéréo", 6: "5.1", 8: "7.1" };

let lib: Promise<any> | null = null;
/** libmedia est servie par l'appli (public/libmedia, copiée à l'installation) : ses workers et modules doivent être de la même origine. */
const loadLib = () => (lib ??= new Promise((ok, ko) => {
  const w = window as any;
  if (w.AVPlayer) return ok(w.AVPlayer.default ?? w.AVPlayer);
  const s = document.createElement("script");
  s.src = "/libmedia/avplayer.js";
  s.onload = () => ok(w.AVPlayer.default ?? w.AVPlayer);
  s.onerror = () => { lib = null; ko(new Error("libmedia introuvable")); };
  document.head.appendChild(s);
}));

/** Le lecteur avancé lit le fichier par morceaux : il faut que le serveur l'autorise (CORS + Range). */
export async function readable(url: string) {
  try {
    const r = await fetch(url, { headers: { Range: "bytes=0-1" }, signal: AbortSignal.timeout(10000) });
    r.body?.cancel().catch(() => {});
    return r.ok;
  } catch { return false; }
}

const ext = (url: string, file?: string) => (file || new URL(url).pathname).match(/\.(mkv|mp4|m4v|webm|mov|avi|ts|m2ts|flv)$/i)?.[1].toLowerCase();

async function avance(box: HTMLDivElement, url: string, file?: string): Promise<Engine> {
  const AV = await loadLib();
  // ponytail: workers désactivés : avec eux, libmedia 1.2 à 1.3.1 plante sur les sous-titres des MKV (division par zéro dans
  // SubtitleRender). Le démuxage passe sur le fil principal, la vidéo reste décodée par WebCodecs. À réactiver si c'est corrigé.
  const p = new AV({ container: box, enableWorker: false, enableWebCodecs: true, enableHardware: true });
  const e = ext(url, file);
  await p.load(url, e ? { ext: e } : undefined);
  const streams: any[] = p.getStreams();
  const track = (s: any, extras: string[]): Track => {
    const lang = langCode(s.metadata?.language, s.metadata?.title);
    return { id: s.id, lang, label: trackLabel(lang, s.metadata?.title, extras), forced: !!(s.disposition & FORCED) };
  };
  const audio = streams.filter(s => s.mediaType === "Audio").map(s => track(s, [CHANNELS[s.codecparProxy?.chLayout?.nbChannels] ?? ""]));
  const subs = streams.filter(s => s.mediaType === "Subtitle").map(s => track(s, [s.disposition & FORCED ? "Forcés" : "", s.disposition & SDH ? "Malentendants" : ""]));
  const eng: Engine = {
    kind: "avance",
    time: () => Number(p.currentTime) / 1000,
    duration: () => Number(p.getDuration()) / 1000,
    play: () => p.play(),
    pause: () => { p.pause(); },
    seek: s => { p.seek(BigInt(Math.max(0, Math.round(s * 1000)))); },
    setRate: r => p.setPlaybackRate(r),
    setVolume: v => p.setVolume(v),
    audio, subs,
    audioId: p.getSelectedAudioStreamId(),
    subId: -1,
    selectAudio: async id => { await p.selectAudio(id); eng.audioId = id; },
    selectSub: async id => {
      if (id >= 0 && id !== p.getSelectedSubtitleStreamId()) await p.selectSubtitle(id);
      box.dataset.subs = id >= 0 ? "on" : "off";
      eng.subId = id;
    },
    canDelay: true,
    setSubDelay: s => p.setSubtitleDelay(Math.round(s * 1000)),
    suspended: () => p.isSuspended(),
    resume: () => p.resume(),
    resize: () => p.resize(box.clientWidth, box.clientHeight),
    destroy: () => { p.destroy().catch(() => {}); },
  };
  // L'affichage des sous-titres ne démarre que s'il est actif au lancement, et ne repart plus après une désactivation :
  // il reste actif, masqué tant que « Désactivés » est choisi.
  p.setSubtitleEnable(true);
  box.dataset.subs = "off";
  return eng;
}

function navigateur(box: HTMLDivElement, url: string, onError: (m: string) => void): Promise<Engine> {
  const v = document.createElement("video");
  Object.assign(v.style, { width: "100%", height: "100%", objectFit: "contain", background: "#000" });
  v.playsInline = true;
  v.src = url;
  box.appendChild(v);
  return new Promise((ok, ko) => {
    v.addEventListener("error", () => { const m = v.error?.message || "format non pris en charge"; onError(m); ko(new Error(m)); }, { once: false });
    v.addEventListener("loadedmetadata", () => {
      // Safari seul expose les pistes audio d'un fichier ; ailleurs la liste reste vide.
      const at: any[] = Array.from((v as any).audioTracks ?? []);
      const eng: Engine = {
        kind: "navigateur",
        time: () => v.currentTime, duration: () => v.duration || 0,
        play: () => v.play(), pause: () => v.pause(), seek: s => { v.currentTime = s; },
        setRate: r => { v.playbackRate = r; }, setVolume: x => { v.volume = Math.min(1, x); },
        audio: at.map((t, i) => { const lang = langCode(t.language, t.label); return { id: i, lang, label: trackLabel(lang, t.label) }; }),
        subs: [], audioId: Math.max(0, at.findIndex(t => t.enabled)), subId: -1,
        selectAudio: async id => { at.forEach((t, i) => (t.enabled = i === id)); eng.audioId = id; },
        selectSub: async id => { eng.subId = id; },
        canDelay: false, setSubDelay: () => {},
        suspended: () => false, resume: async () => {},
        resize: () => {}, destroy: () => { v.pause(); v.removeAttribute("src"); v.load(); v.remove(); },
      };
      ok(eng);
    }, { once: true });
  });
}

/** Lecteur avancé si le lien le permet, sinon celui du navigateur. */
export async function createEngine(box: HTMLDivElement, url: string, file: string | undefined, onError: (m: string) => void): Promise<Engine> {
  if (await readable(url)) {
    const inner = document.createElement("div");
    Object.assign(inner.style, { position: "absolute", inset: "0" });
    box.appendChild(inner);
    try { return await avance(inner, url, file); } catch (e) { console.warn("libmedia :", e); inner.remove(); }
  }
  return navigateur(box, url, onError);
}
