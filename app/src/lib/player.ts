// Moteurs de lecture du web. « avancé » : libmedia (WASM) décode le fichier lui-même : MKV, HEVC, DTS/AC3, pistes audio
// et sous-titres intégrés. Il doit pouvoir lire le lien (CORS). Sinon, « navigateur » : la balise <video>, comme avant.
import { desktop, relayed } from "./desktop";
import { langCode, parseVtt, trackLabel, type Cue } from "./lang";

export type Track = { id: number; lang: string; label: string; forced?: boolean; ext?: boolean }; // ext : sous-titre d'un addon
export type Engine = {
  kind: "avance" | "navigateur" | "mpv";
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
// Décodeurs absents de libmedia, fournis par nous (compilés depuis FFmpeg par app/scripts/wasm-decodeurs.sh) : TrueHD / MLP
// (son des REMUX) et VC-1 (vidéo de Blu-ray). ponytail: versions SIMD seules (tous les navigateurs depuis 2023).
const OWN: Record<number, string> = { 86045: "truehd", 86060: "truehd", 70: "vc1" };
const WVC1 = 0x31435657; // « WVC1 » : VC-1 rangé à la Windows dans le MKV (V_MS/VFW/FOURCC), que libmedia ne reconnaît pas

let lib: Promise<any> | null = null;
/** libmedia est servie par l'appli (public/libmedia, copiée à l'installation) : ses workers et modules doivent être de la même origine. */
const loadLib = () => (lib ??= new Promise((ok, ko) => {
  const w = window as any;
  if (w.AVPlayer) return ok(w.AVPlayer.default ?? w.AVPlayer);
  const s = document.createElement("script");
  s.src = "/libmedia/avplayer.js";
  s.onload = () => {
    const AV = w.AVPlayer.default ?? w.AVPlayer, ok1 = AV.prototype.isCodecIdSupported, get = AV.prototype.getResource;
    AV.prototype.isCodecIdSupported = function (id: number, ...a: any[]) { return id in OWN || ok1.call(this, id, ...a); };
    // getWasm remplace toute la table d'URL de libmedia : on ne le pose que le temps de demander l'un de nos décodeurs.
    AV.prototype.getResource = function (type: string, id: number, ...a: any[]) {
      if (type !== "decoder" || !(id in OWN)) return get.call(this, type, id, ...a);
      this.options.getWasm = () => `/wasm/${OWN[id]}-simd.wasm`;
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
  for (const s of streams) if (s.mediaType === "Video" && !s.codecparProxy.codecId && s.codecparProxy.codecTag === WVC1) s.codecparProxy.codecId = 70;
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
  let start: number | null = 0; // position demandée avant la première lecture (null : déjà lancé)
  const eng: Engine = {
    kind: "avance", info: infoOf(defAudio),
    time: () => Number(p.currentTime) / 1000,
    duration: () => Number(p.getDuration()) / 1000,
    // Un saut avant la première lecture fait échouer libmedia (« player status is not loaded ») : la reprise à une
    // position passait pour du son bloqué et le choix de langue se perdait. On saute juste après le lancement.
    play: async () => { await p.play(); const s = start; start = null; if (s) eng.seek(s); },
    pause: () => { p.pause(); },
    seek: s => { if (start !== null) start = s; else p.seek(BigInt(Math.max(0, Math.round(s * 1000)))); },
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

// --- mpv (appli Windows) ----------------------------------------------------------------------------
// La fenêtre de l'appli est transparente : mpv y dessine la vidéo, la page (rendue transparente jusqu'au lecteur) garde
// nos contrôles par-dessus. Tous les formats, carte graphique, lien lu directement (pas de CORS).

const MPV_CODECS: Record<string, string> = { h264: "H264", hevc: "HEVC", vc1: "VC-1", av1: "AV1", vp9: "VP9", mpeg2video: "MPEG-2",
  truehd: "TrueHD", ac3: "AC3", eac3: "E-AC3", dts: "DTS", aac: "AAC", opus: "Opus", flac: "FLAC", mp3: "MP3" };
const PROPS = { "time-pos": "double", duration: "double", "track-list": "node" };
let mpvGone: Promise<unknown> = Promise.resolve(); // une seule instance par fenêtre : la suivante attend la fin de la précédente

async function mpv(box: HTMLDivElement, url: string): Promise<Engine> {
  const t = (window as any).__TAURI__;
  const inv = (cmd: string, a: object = {}) => t.core.invoke(`plugin:libmpv|${cmd}`, { windowLabel: "main", ...a });
  const set = (name: string, value: string | number | boolean) => inv("set_property", { name, value });
  const props: Record<string, any> = {};
  let loaded: (ok: boolean) => void = () => {};
  const ready = new Promise<boolean>(ok => (loaded = ok));
  await mpvGone;
  const off = await t.event.listen("mpv-event-main", ({ payload: e }: any) => {
    if (e.event === "property-change") props[e.name] = e.data;
    else if (e.event === "file-loaded") loaded(true);
    else if (e.event === "end-file" && e.reason === "error") loaded(false);
  });
  await inv("init", { mpvConfig: { initialOptions: { vo: "gpu-next", hwdec: "auto-safe", "keep-open": "yes", "force-window": "yes",
    pause: "yes", ytdl: "no", osc: "no", "input-default-bindings": "no", "sub-auto": "no", "audio-display": "no" }, observedProperties: PROPS } });
  const fail = async (m: string) => { off(); await inv("destroy").catch(() => {}); throw new Error(m); };
  await inv("command", { name: "loadfile", args: [url] });
  if (!(await Promise.race([ready, new Promise<boolean>(ok => setTimeout(() => ok(false), 30000))]))) return fail("mpv n'a pas pu ouvrir ce lien");

  // La page devient transparente du lecteur jusqu'à la fenêtre (restaurée à la fermeture).
  const opaque: [HTMLElement, string][] = [];
  for (let el: HTMLElement | null = box; el; el = el.parentElement) { opaque.push([el, el.style.background]); el.style.background = "transparent"; }

  const list: any[] = (await inv("get_property", { name: "track-list", format: "node" }).catch(() => null)) ?? props["track-list"] ?? [];
  const label = (x: any, extras: string[]) => trackLabel(langCode(x.lang, x.title), x.title, extras);
  const audio: Track[] = list.filter(x => x.type === "audio").map(x => ({ id: x.id, lang: langCode(x.lang, x.title),
    label: label(x, [MPV_CODECS[x.codec] ?? String(x.codec ?? "").toUpperCase(), CHANNELS[x["demux-channel-count"]] ?? ""]) }));
  const subs: Track[] = list.filter(x => x.type === "sub").map(x => ({ id: x.id, lang: langCode(x.lang, x.title), forced: !!x.forced,
    label: label(x, [x.forced ? "Forcés" : ""]) }));
  const video = list.find(x => x.type === "video" && x.selected);
  const infoOf = (aid: number) => {
    const a = list.find(x => x.type === "audio" && x.id === aid);
    return [[MPV_CODECS[video?.codec] ?? video?.codec, video?.["demux-h"] ? `${video["demux-h"]}p` : ""].filter(Boolean).join(" "),
      [MPV_CODECS[a?.codec] ?? a?.codec, CHANNELS[a?.["demux-channel-count"]] ?? ""].filter(Boolean).join(" ")].filter(Boolean).join(" · ");
  };
  const aid = list.find(x => x.type === "audio" && x.selected)?.id ?? audio[0]?.id ?? -1;
  const cues = cueLayer(box, () => eng.time());
  const eng: Engine = {
    kind: "mpv", info: infoOf(aid),
    time: () => props["time-pos"] ?? 0,
    duration: () => props.duration ?? 0,
    play: async () => { await set("pause", false); },
    pause: () => { set("pause", true); },
    seek: s => { inv("command", { name: "seek", args: [Math.max(0, s), "absolute"] }); },
    setRate: r => { set("speed", r); },
    setVolume: v => { set("volume", Math.round(v * 100)); },
    audio, subs, audioId: aid, subId: -1,
    selectAudio: async id => { await set("aid", id); eng.audioId = id; eng.info = infoOf(id); },
    // Sous-titres du fichier : dessinés par mpv ; ceux des addons : par notre calque, comme dans les autres lecteurs.
    selectSub: async id => { await set("sid", id >= 0 && !cues.has(id) ? id : "no"); cues.show(id); eng.subId = id; },
    addSub: async (url, lang, label) => { const id = await cues.add(url); eng.subs.push({ id, lang, label, ext: true }); return id; },
    canDelay: true, setSubDelay: s => { set("sub-delay", s); cues.setDelay(s); },
    suspended: () => false, resume: async () => {},
    resize: () => {},
    destroy: () => { off(); cues.destroy(); mpvGone = inv("destroy").catch(() => {}); for (const [el, bg] of opaque) el.style.background = bg; },
  };
  return eng;
}

/** Appli Windows : mpv. Sinon lecteur avancé si le lien le permet, sinon celui du navigateur. */
export async function createEngine(box: HTMLDivElement, url: string, file: string | undefined, onError: (m: string) => void): Promise<Engine> {
  let why: Engine["why"] = "cors";
  let detail: string | undefined;
  if (desktop?.mpv) try { return await mpv(box, url); } catch (e) { console.warn("mpv :", e); detail = `mpv : ${String((e as Error)?.message ?? e).slice(0, 200)}`; }
  // Appli Windows : si le serveur du debrid refuse le lecteur avancé, le relais local lit le lien à sa place.
  const relay = relayed(url), name = file || new URL(url).pathname; // format deviné d'après le lien d'origine
  const direct = await readable(url);
  if (!direct && relay && (await readable(relay))) url = relay;
  if (direct || url === relay) {
    why = "echec";
    const inner = document.createElement("div");
    Object.assign(inner.style, { position: "absolute", inset: "0" });
    box.appendChild(inner);
    try { return await avance(inner, url, name); } catch (e) { console.warn("libmedia :", e); detail = String((e as Error)?.message ?? e).slice(0, 200); inner.remove(); }
  }
  return Object.assign(await navigateur(box, url, onError), { why, detail });
}
