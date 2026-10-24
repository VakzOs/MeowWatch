// Moteurs de lecture du web. « avancé » : libmedia (WASM) décode le fichier lui-même : MKV, HEVC, DTS/AC3, pistes audio
// et sous-titres intégrés. Il doit pouvoir lire le lien (CORS). Sinon, « navigateur » : la balise <video>, comme avant.
import { relayed } from "./desktop";
import { langCode, parseVtt, trackLabel, type Cue } from "./lang";

export type Track = { id: number; lang: string; label: string; forced?: boolean; ext?: boolean }; // ext : sous-titre d'un addon
export type Engine = {
  kind: "avance" | "navigateur";
  why?: "cors" | "echec"; // pourquoi le lecteur avancé n'a pas servi
  detail?: string; // message d'erreur du lecteur avancé
  info?: string; // « H264 1080p · AC3 5.1 »
  time(): number; duration(): number;
  play(): Promise<void>; pause(): void; seek(s: number): void;
  setRate(r: number): void; setVolume(v: number): void;
  audio: Track[]; subs: Track[]; audioId: number; subId: number; // subId -1 : sous-titres désactivés
  selectAudio(id: number): Promise<void>; selectSub(id: number): Promise<void>;
  addSub(url: string, lang: string, label: string): Promise<number>; // sous-titre externe (WebVTT) → identifiant de piste
  canDelay: boolean; setSubDelay(s: number): void;
  suspended(): boolean; resume(): Promise<void>; // son bloqué par le navigateur tant qu'on n'a pas cliqué
  resize(): void; destroy(): void;
};

const FORCED = 0x40, SDH = 0x80; // AV_DISPOSITION_* de FFmpeg
const CHANNELS: Record<number, string> = { 1: "Mono", 2: "Stéréo", 6: "5.1", 8: "7.1" };
// Identifiants de codecs de FFmpeg (AVCodecID) les plus courants dans les fichiers des debrids.
const CODECS: Record<number, string> = { 2: "MPEG-2", 12: "MPEG-4", 27: "H264", 70: "VC-1", 167: "VP9", 173: "HEVC", 225: "AV1",
  86017: "MP3", 86018: "AAC", 86019: "AC3", 86020: "DTS", 86021: "Vorbis", 86028: "FLAC", 86045: "MLP", 86056: "E-AC3", 86060: "TrueHD", 86076: "Opus" };
// libmedia n'a pas de décodeur TrueHD / MLP (son des REMUX) : on fournit le nôtre, compilé depuis FFmpeg par
// app/scripts/truehd-wasm.sh. ponytail: version SIMD seule (tous les navigateurs depuis 2023) ; un navigateur sans SIMD n'aura pas le son.
const TRUEHD = new Set([86045, 86060]), TRUEHD_WASM = "/wasm/truehd-simd.wasm";

let lib: Promise<any> | null = null;
/** libmedia est servie par l'appli (public/libmedia, copiée à l'installation) : ses workers et modules doivent être de la même origine. */
const loadLib = () => (lib ??= new Promise((ok, ko) => {
  const w = window as any;
  if (w.AVPlayer) return ok(w.AVPlayer.default ?? w.AVPlayer);
  const s = document.createElement("script");
  s.src = "/libmedia/avplayer.js";
  s.onload = () => {
    const AV = w.AVPlayer.default ?? w.AVPlayer, ok1 = AV.prototype.isCodecIdSupported, get = AV.prototype.getResource;
    AV.prototype.isCodecIdSupported = function (id: number, ...a: any[]) { return TRUEHD.has(id) || ok1.call(this, id, ...a); };
    // getWasm remplace toute la table d'URL de libmedia : on ne le pose que le temps de demander le décodeur TrueHD.
    AV.prototype.getResource = function (type: string, id: number, ...a: any[]) {
      if (type !== "decoder" || !TRUEHD.has(id)) return get.call(this, type, id, ...a);
      this.options.getWasm = () => TRUEHD_WASM;
      try { return get.call(this, type, id, ...a); } finally { delete this.options.getWasm; }
    };
    ok(AV);
  };
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
  const codec = (s: any) => CODECS[s?.codecparProxy?.codecId] ?? "";
  const audio = streams.filter(s => s.mediaType === "Audio").map(s => track(s, [codec(s), CHANNELS[s.codecparProxy?.chLayout?.nbChannels] ?? ""]));
  const video = streams.find(s => s.mediaType === "Video");
  const infoOf = (audioId: number) => {
    const a = streams.find(s => s.id === audioId);
    return [[codec(video), video?.codecparProxy?.height ? `${video.codecparProxy.height}p` : ""].filter(Boolean).join(" "),
      [codec(a), CHANNELS[a?.codecparProxy?.chLayout?.nbChannels] ?? ""].filter(Boolean).join(" ")].filter(Boolean).join(" · ");
  };
  // Avant la lecture, libmedia n'a pas encore choisi de piste : on part de celle marquée « par défaut » (AV_DISPOSITION_DEFAULT).
  const defAudio = (streams.find(s => s.mediaType === "Audio" && s.disposition & 1) ?? streams.find(s => s.mediaType === "Audio"))?.id ?? -1;
  const subs = streams.filter(s => s.mediaType === "Subtitle").map(s => track(s, [s.disposition & FORCED ? "Forcés" : "", s.disposition & SDH ? "Malentendants" : ""]));
  const eng: Engine = {
    kind: "avance", info: infoOf(defAudio),
    time: () => Number(p.currentTime) / 1000,
    duration: () => Number(p.getDuration()) / 1000,
    play: async () => { await p.play(); },
    pause: () => { p.pause(); },
    seek: s => { p.seek(BigInt(Math.max(0, Math.round(s * 1000)))); },
    setRate: r => p.setPlaybackRate(r),
    setVolume: v => p.setVolume(v),
    audio, subs,
    audioId: defAudio,
    subId: -1,
    selectAudio: async id => { await p.selectAudio(id); eng.audioId = id; eng.info = infoOf(id); },
    selectSub: async id => {
      const own = cues.has(id);
      // libmedia 1.3.1 garde les répliques déjà lues de l'ancienne piste et ne passe jamais à la nouvelle (le chinois
      // marqué « par défaut » restait affiché) : un saut sur place vide ce tampon.
      if (id >= 0 && !own && id !== p.getSelectedSubtitleStreamId()) { await p.selectSubtitle(id); p.seek(p.currentTime); }
      box.dataset.subs = id >= 0 && !own ? "on" : "off";
      cues.show(id);
      eng.subId = id;
    },
    // Sous-titres des addons : libmedia 1.3.1 n'arrive pas à les charger (« analyze stream failed », URL ou File, VTT ou
    // SRT) : affichage maison (cueLayer).
    addSub: async (url, lang, label) => { const id = await cues.add(url); eng.subs.push({ id, lang, label, ext: true }); return id; },
    canDelay: true,
    setSubDelay: s => { p.setSubtitleDelay(Math.round(s * 1000)); cues.setDelay(s); },
    suspended: () => p.isSuspended(),
    resume: () => p.resume(),
    resize: () => p.resize(box.clientWidth, box.clientHeight),
    destroy: () => { cues.destroy(); p.destroy().catch(() => {}); },
  };
  const cues = cueLayer(box, eng.time);
  // L'affichage des sous-titres ne démarre que s'il est actif au lancement, et ne repart plus après une désactivation :
  // il reste actif, masqué tant que « Désactivés » est choisi.
  p.setSubtitleEnable(true);
  box.dataset.subs = "off";
  return eng;
}

/** Sous-titres des addons affichés par nous (comme Stremio : texte blanc ombré, au-dessus des contrôles), mis à jour
 *  toutes les 100 ms. Le CSS du calque (.mw-cues) est dans WebPlayer. */
function cueLayer(box: HTMLElement, time: () => number) {
  const tracks = new Map<number, Cue[]>();
  let cur = -1, delay = 0, shown = "";
  const layer = document.createElement("div");
  layer.className = "mw-cues";
  box.appendChild(layer);
  const draw = () => {
    const t = time() - delay;
    const text = (tracks.get(cur) ?? []).filter(c => c.start <= t && t < c.end).map(c => c.text).join("\n");
    if (text === shown) return;
    shown = text;
    layer.replaceChildren(...text.split("\n").filter(Boolean).map(line => Object.assign(document.createElement("span"), { textContent: line })));
  };
  const timer = setInterval(draw, 100);
  return {
    add: async (url: string) => {
      const r = await fetch(url);
      if (!r.ok) throw new Error("sous-titres indisponibles");
      const id = 1000 + tracks.size;
      tracks.set(id, parseVtt(await r.text()));
      return id;
    },
    has: (id: number) => tracks.has(id),
    show: (id: number) => { cur = id; draw(); },
    setDelay: (s: number) => { delay = s; draw(); },
    destroy: () => { clearInterval(timer); layer.remove(); },
  };
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
        selectSub: async id => { cues.show(id); eng.subId = id; },
        addSub: async (url, lang, label) => { const id = await cues.add(url); eng.subs.push({ id, lang, label, ext: true }); return id; },
        canDelay: true, setSubDelay: s => cues.setDelay(s),
        suspended: () => false, resume: async () => {},
        resize: () => {}, destroy: () => { cues.destroy(); v.pause(); v.removeAttribute("src"); v.load(); v.remove(); },
      };
      const cues = cueLayer(box, eng.time);
      ok(eng);
    }, { once: true });
  });
}

/** Lecteur avancé si le lien le permet, sinon celui du navigateur. */
export async function createEngine(box: HTMLDivElement, url: string, file: string | undefined, onError: (m: string) => void): Promise<Engine> {
  let why: Engine["why"] = "cors";
  // Appli Windows : si le serveur du debrid refuse le lecteur avancé, le relais local lit le lien à sa place.
  const relay = relayed(url), name = file || new URL(url).pathname; // format deviné d'après le lien d'origine
  const direct = await readable(url);
  if (!direct && relay && (await readable(relay))) url = relay;
  let detail: string | undefined;
  if (direct || url === relay) {
    why = "echec";
    const inner = document.createElement("div");
    Object.assign(inner.style, { position: "absolute", inset: "0" });
    box.appendChild(inner);
    try { return await avance(inner, url, name); } catch (e) { console.warn("libmedia :", e); detail = String((e as Error)?.message ?? e).slice(0, 200); inner.remove(); }
  }
  return Object.assign(await navigateur(box, url, onError), { why, detail });
}
