import AsyncStorage from "@react-native-async-storage/async-storage";
import { Image } from "expo-image";
import { router } from "expo-router";
import { createElement, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { describe, epLabel, fetchMeta, fetchStreamsFor, fetchSubtitles, imdbEquivalent, nextEpisode, pickNextStream, type FoundStream, type Meta } from "../lib/addons";
import { fromAniSkip, fromChapters, fromIntroDb, type Markers } from "../lib/skip";
import { chooseTracks, DEFAULT_PREFS, flagOf, langCode, langName } from "../lib/lang";
import { desktop, win, openExternal } from "../lib/desktop";
import { createEngine, type Engine, type Track } from "../lib/player";
import { saveProgress, useStore, visibleAddons } from "../lib/store";
import { Icon, type IconName } from "./Icon";
import { C, font } from "./theme";

/** subType/subVid : identifiant pour les addons de sous-titres (équivalent IMDb des animés) ; anime : règle animés. */
export type PlayParams = { url: string; file?: string; binge?: string; addon?: string; subType?: string; subVid?: string; anime?: string; vo?: string; id: string; type: string; name: string; poster: string; background: string; videoId: string; label: string; start: string };

// Réglages du lecteur, retenus sur l'appareil.
type Prefs = { volume: number; muted: boolean; size: number; color: string; bg: string; blur: boolean; autoNext: boolean };
const PREFS_KEY = "meowwatch:lecteur";
const ENGINE = { avance: "Lecteur avancé", navigateur: "Lecteur du navigateur", mpv: "Lecteur mpv" };
const DELAY_KEY = "meowwatch:decalage:"; // + identifiant du titre (la série, pas l'épisode)
const DEFAULT: Prefs = { volume: 1, muted: false, size: 1, color: "", bg: "", blur: false, autoNext: true };
const SIZES = [{ k: 0.8, label: "Petit" }, { k: 1, label: "Normal" }, { k: 1.3, label: "Grand" }, { k: 1.6, label: "Très grand" }];
const COLORS = [{ k: "", label: "D'origine" }, { k: "#FFFFFF", label: "Blanc" }, { k: "#FFE14D", label: "Jaune" }];
const BGS = [{ k: "", label: "Aucun" }, { k: "rgba(0,0,0,0.55)", label: "Léger" }, { k: "rgba(0,0,0,0.9)", label: "Noir" }];
const RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];
const WHY = { cors: "(Lecteur avancé impossible : le serveur du lien ne l'autorise pas.)", echec: "(Lecteur avancé impossible : il n'a pas su lire ce fichier. Détail dans le menu Flux.)" };

const clock = (s: number) => {
  if (!isFinite(s) || s < 0) s = 0;
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = Math.floor(s % 60);
  return `${h ? `${h}:` : ""}${h ? String(m).padStart(2, "0") : m}:${String(x).padStart(2, "0")}`;
};

/** CSS commun (barres de défilement) et apparence des sous-titres de libmedia (éléments .ASS-dialogue). */
function useCss(prefs: Prefs) {
  useEffect(() => {
    const id = "mw-player-css";
    let el = document.getElementById(id) as HTMLStyleElement | null;
    if (!el) { el = document.createElement("style"); el.id = id; document.head.appendChild(el); }
    el.textContent = `
      .mw-range { -webkit-appearance: none; appearance: none; background: transparent; cursor: pointer; margin: 0; height: 18px; }
      .mw-range::-webkit-slider-runnable-track { height: 4px; border-radius: 2px; background: linear-gradient(to right, ${C.red} var(--v), rgba(255,255,255,0.25) var(--v)); }
      .mw-range::-moz-range-track { height: 4px; border-radius: 2px; background: rgba(255,255,255,0.25); }
      .mw-range::-moz-range-progress { height: 4px; border-radius: 2px; background: ${C.red}; }
      .mw-range::-webkit-slider-thumb { -webkit-appearance: none; width: 14px; height: 14px; border-radius: 7px; background: #fff; margin-top: -5px; }
      .mw-range::-moz-range-thumb { width: 14px; height: 14px; border: 0; border-radius: 7px; background: #fff; }
      .mw-range:focus-visible { outline: 2px solid ${C.red}; outline-offset: 2px; }
      .mw-player [data-subs="off"] .ASS-box { visibility: hidden; }
      .mw-player .mw-cues { position: absolute; left: 5%; right: 5%; bottom: 5vh; display: flex; flex-direction: column; align-items: center; gap: 0.15em; pointer-events: none; transform: translateY(calc(var(--mw-lift, 0px) + 3vh)); transition: transform 250ms; }
      .mw-player .mw-cues span { font: 500 calc(3.6vh * ${prefs.size}) "InstrumentSans_500Medium", "Instrument Sans", Arial, sans-serif; color: ${prefs.color || "#fff"}; text-align: center; white-space: pre-wrap;
        ${prefs.blur ? "backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);" : ""}
        ${prefs.bg || prefs.blur ? `background: ${prefs.bg || "transparent"}; padding: 0.05em 0.35em; border-radius: 6px;` : ""}
        ${prefs.bg ? "" : "text-shadow: 1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 0 1px 0 #000, 0 -1px 0 #000, 0 0 4px rgba(0,0,0,0.8);"} }
      .mw-player .ASS-box { transform: translateY(var(--mw-lift, 0px)); transition: transform 250ms; }
      .mw-player .ASS-dialogue span { font-size: calc(var(--ass-scale) * var(--ass-real-fs) * ${prefs.size}px) !important;
        ${prefs.color ? `--ass-fill-color: ${prefs.color} !important;` : ""}
        ${prefs.bg ? `background: ${prefs.bg} !important;` : ""} ${prefs.blur ? "backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); display: inline-block;" : ""}
        ${prefs.bg || prefs.blur ? "padding: 0.05em 0.3em; border-radius: 6px; box-decoration-break: clone; -webkit-box-decoration-break: clone;" : ""} }
    `;
  }, [prefs.size, prefs.color, prefs.bg, prefs.blur]);
}

function Range({ value, max, onChange, label, width }: { value: number; max: number; onChange: (v: number) => void; label: string; width?: number | string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return createElement("input", {
    type: "range", className: "mw-range", min: 0, max: max || 1, step: "any", value: Math.min(value, max || 1), "aria-label": label,
    onChange: (e: any) => onChange(+e.target.value), onKeyDown: (e: any) => e.stopPropagation(),
    style: { width: width ?? "100%", "--v": `${pct}%` },
  });
}

export function WebPlayer({ p }: { p: PlayParams }) {
  const rootRef = useRef<any>(null), boxRef = useRef<any>(null); // éléments DOM (react-native-web)
  const [eng, setEng] = useState<Engine | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paused, setPaused] = useState(true);
  const [time, setTime] = useState(0), [dur, setDur] = useState(0);
  const [marks, setMarks] = useState<Markers>({});
  const [menu, setMenu] = useState<null | "audio" | "subs" | "style" | "speed" | "streams">(null);
  const [ui, setUi] = useState(true);
  const [fs, setFs] = useState(false);
  const [rate, setRate] = useState(1);
  const [delay, setDelay] = useState(0);
  const [blocked, setBlocked] = useState(false); // son ou lecture bloqués tant qu'on n'a pas cliqué
  const [prefs, setPrefsState] = useState<Prefs>(DEFAULT);
  const [, refresh] = useReducer(x => x + 1, 0);
  const addons = useStore(visibleAddons);
  const langPrefs = useStore(s => s.user?.profile?.prefs) ?? DEFAULT_PREFS;
  // Sous-titres des addons : listés tout de suite, chargés (via notre serveur, en WebVTT) quand on les choisit.
  type Ext = { url: string; lang: string; label: string };
  const [ext, setExt] = useState<Ext[]>([]);
  const loaded = useRef(new Map<string, number>());
  // Épisode suivant (séries) et autres flux du même épisode.
  const [meta, setMeta] = useState<Meta | null>(null);
  useEffect(() => { if (p.videoId !== p.id) fetchMeta(addons, p.type, p.id).then(setMeta, () => {}); }, []);
  const next = useMemo(() => (meta ? nextEpisode(meta.videos, p.videoId) : null), [meta]);
  const [streams, setStreams] = useState<FoundStream[] | null>(null);
  const [nextOff, setNextOff] = useState(false); // carte fermée
  const [going, setGoing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const prefsRef = useRef(prefs); prefsRef.current = prefs;
  const setPrefs = (patch: Partial<Prefs>) => {
    const next = { ...prefsRef.current, ...patch };
    setPrefsState(next);
    AsyncStorage.setItem(PREFS_KEY, JSON.stringify(next)).catch(() => {});
  };
  useCss(prefs);
  // En quittant le lecteur, l'appli sort du plein écran (pas entre deux épisodes : le lecteur est recréé sans passer par ici).
  const back = () => {
    if (desktop) win.isFullscreen().then(f => { if (f) win.toggleFullscreen(); });
    router.canGoBack() ? router.back() : router.replace("/");
  };

  // Démarrage : réglages de l'appareil, puis moteur (avancé si possible), reprise et lecture.
  useEffect(() => {
    const box = boxRef.current as unknown as HTMLDivElement;
    let e: Engine | null = null, dead = false;
    (async () => {
      const saved = await AsyncStorage.getItem(PREFS_KEY).then(r => (r ? { ...DEFAULT, ...JSON.parse(r) } : DEFAULT), () => DEFAULT);
      setPrefsState(saved);
      const subsP = fetchSubtitles(addons, p.subType || p.type, p.subVid || p.videoId, p.file || undefined).then(list => {
        const choice = p.anime === "1" ? langPrefs.animes : langPrefs.films, rank = (l: string) => (l === choice.subs ? 0 : l === choice.subs2 ? 1 : l === "fr" ? 2 : l === "en" ? 3 : 4);
        const n: Record<string, number> = {};
        // Langue inconnue : écartés (Vakz) ; ceux des langues voulues d'abord.
        const out = list.map(x => ({ ...x, lang: langCode(x.lang) })).filter(x => x.lang).sort((a, b) => rank(a.lang) - rank(b.lang)).slice(0, 60)
          .map(x => ({ url: `/api/subtitle.vtt?v=2&url=${encodeURIComponent(x.url)}` /* v : change quand la conversion change (cache du navigateur) */, lang: x.lang, label: `${langName(x.lang)} · ${x.addon} ${(n[x.lang + x.addon] = (n[x.lang + x.addon] ?? 0) + 1)}` }));
        if (!dead) setExt(out);
        return out;
      }, () => [] as Ext[]);
      const x = await createEngine(box, p.url, p.file || undefined, setError);
      if (dead) return x.destroy();
      e = x;
      x.setVolume(saved.muted ? 0 : saved.volume);
      // Décalage des sous-titres retenu pour ce titre (souvent le même sur toute une série).
      const d = Number(await AsyncStorage.getItem(DELAY_KEY + p.id).catch(() => null)) || 0;
      if (d) { setDelay(d); x.setSubDelay(d); }
      if (+p.start > 0) x.seek(+p.start);
      try { await x.play(); setPaused(false); } catch { setBlocked(true); }
      if (x.suspended()) setBlocked(true);
      // Une seule piste audio sans langue (souvent l'anglais des MULTi) : c'est très probablement la VO du titre (TMDB).
      const blank = x.audio.filter(t => !t.lang);
      if (blank.length === 1 && p.vo) Object.assign(blank[0], { lang: p.vo, label: blank[0].label.replace(langName(""), `${langName(p.vo)} (VO probable)`) });
      x.resize();
      setEng(x);
      // Langues préférées du profil (règle à part pour les animés) : audio et sous-titres du fichier tout de suite ; sinon
      // sous-titres des addons dès qu'ils arrivent (OpenSubtitles peut être lent), sauf si on en a choisi entre-temps.
      const choice = p.anime === "1" ? langPrefs.animes : langPrefs.films;
      const first = chooseTracks(choice, x.audio, x.audioId, x.subs, []);
      if (first.audio !== undefined) await x.selectAudio(first.audio);
      if (first.sub && "id" in first.sub) await x.selectSub(first.sub.id);
      refresh();
      if (first.sub || !choice.subs) return;
      const extList = await subsP;
      if (dead || picked.current) return;
      const late = chooseTracks(choice, x.audio, x.audioId, x.subs, extList).sub;
      if (late && "ext" in late) { await useExt(x, extList[late.ext]); refresh(); }
    })().catch(err => !dead && setError(err?.message ?? String(err)));
    return () => { dead = true; e?.destroy(); };
  }, [p.url]);

  // Temps affiché, et position enregistrée toutes les 5 s (« Reprendre »).
  useEffect(() => {
    if (!eng) return;
    const tick = setInterval(() => { if (Date.now() - target.current.at > 1000) setTime(eng.time()); setDur(eng.duration()); }, 250);
    const save = setInterval(() => {
      const t = eng.time(), d = eng.duration();
      if (t < 5 || !d) return;
      saveProgress({
        meta: { id: p.id, type: p.type, name: p.name, poster: p.poster || undefined, background: p.background || undefined },
        videoId: p.videoId, label: p.label || undefined, time: t, duration: d, updatedAt: Date.now(), binge: p.binge || undefined, addon: p.addon || undefined,
      });
    }, 5000);
    return () => { clearInterval(tick); clearInterval(save); };
  }, [eng]);

  const goNext = async () => {
    if (!next || going) return;
    setGoing(true);
    const alt = meta ? imdbEquivalent(meta, next) : null;
    const s = pickNextStream(await fetchStreamsFor(addons, p.type, next.id, alt).catch(() => []), p.binge, p.addon);
    if (!s?.url) { setGoing(false); setNotice("Aucun flux lisible pour l'épisode suivant. Choisis-en un sur la page du titre."); return; }
    router.replace({ pathname: "/play", params: { ...p, url: s.url, file: s.behaviorHints?.filename ?? "", binge: s.behaviorHints?.bingeGroup ?? "", addon: s.addon, videoId: next.id, label: epLabel(next), subType: alt?.type ?? p.type, subVid: alt?.id ?? next.id, start: "0" } });
  };
  const openStreams = () => {
    setMenu(menu === "streams" ? null : "streams");
    if (!streams) fetchStreamsFor(addons, p.type, p.videoId, p.subVid && p.subVid !== p.videoId ? { type: p.subType || p.type, id: p.subVid } : null).then(l => setStreams(l.filter(s => s.url)), () => setStreams([]));
  };
  const switchStream = (s: FoundStream) => {
    if (s.url === p.url) return setMenu(null);
    router.replace({ pathname: "/play", params: { ...p, url: s.url!, file: s.behaviorHints?.filename ?? "", binge: s.behaviorHints?.bingeGroup ?? "", addon: s.addon, start: String(Math.floor(time)) } });
  };
  // Repères : chapitres nommés du fichier, complétés par TheIntroDB (IMDb) ou AniSkip (animé Kitsu).
  const known = eng && dur > 60;
  useEffect(() => {
    if (!known) return;
    const own = fromChapters(eng.chapters(), dur);
    setMarks(own);
    if (!own.intro || own.credits === undefined) (p.videoId.startsWith("kitsu:") ? fromAniSkip : fromIntroDb)(p.videoId).then(a => setMarks({ ...a, ...own }), () => {});
  }, [known]);
  // Fin d'épisode : carte « Épisode suivant » au début du générique de fin s'il est repéré, sinon dans les 20 dernières
  // secondes ; lancement auto 10 s après le début du générique, ou à la fin (compte à rebours des 10 dernières secondes).
  const left = dur - time;
  const inCredits = marks.credits !== undefined && time >= marks.credits && time < dur;
  const until = inCredits ? Math.min(left, marks.credits! + 10 - time) : left;
  const nextCard = !!next && dur > 60 && (left <= 20 || inCredits) && !nextOff && !menu;
  const countdown = nextCard && prefs.autoNext && until <= 10 ? Math.max(0, Math.ceil(until)) : null;
  useEffect(() => { if (nextCard && prefs.autoNext && until <= 0.6) goNext(); }, [nextCard && until <= 0.6]);
  const within = (r?: [number, number]) => !!r && time >= r[0] && time < r[1] - 1 && !menu;
  const skipTo = within(marks.recap) ? { label: "Passer le récap", to: marks.recap![1] } : within(marks.intro) ? { label: "Passer l'intro", to: marks.intro![1] } : null;

  const toggle = async () => {
    if (!eng) return;
    if (blocked) { await eng.resume(); setBlocked(false); }
    if (paused) { await eng.play().catch(() => {}); setPaused(false); } else { eng.pause(); setPaused(true); }
  };
  // Déplacements regroupés : plusieurs sauts d'affilée perdent libmedia, on n'envoie que le dernier (200 ms après).
  const seekTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const seek = (s: number) => {
    if (!eng) return;
    const t = Math.max(0, Math.min(s, eng.duration() || s));
    setTime(t); target.current = { t, at: Date.now() };
    clearTimeout(seekTimer.current); seekTimer.current = setTimeout(() => eng.seek(t), 200);
  };
  // Sauts de 10 s : depuis la dernière position demandée si on enchaîne vite (le lecteur met un instant à s'y placer).
  const target = useRef({ t: 0, at: 0 });
  const skip = (d: number) => eng && seek((Date.now() - target.current.at < 1500 ? target.current.t : eng.time()) + d);
  const volume = (v: number) => { const x = Math.max(0, Math.min(1, v)); eng?.setVolume(x); setPrefs({ volume: x, muted: x === 0 }); };
  const mute = () => { const m = !prefs.muted; eng?.setVolume(m ? 0 : prefs.volume || 1); setPrefs({ muted: m, volume: prefs.volume || 1 }); };
  const pickAudio = async (t: Track) => { await eng?.selectAudio(t.id); refresh(); };
  const picked = useRef(false); // choix fait à la main : le choix automatique n'y touche plus
  const pickSub = async (id: number) => { picked.current = true; await eng?.selectSub(id); refresh(); };
  async function useExt(e: Engine, s: Ext) {
    let id = loaded.current.get(s.url);
    if (id === undefined) { id = await e.addSub(s.url, s.lang, s.label); loaded.current.set(s.url, id); }
    await e.selectSub(id);
  }
  const pickExt = async (s: Ext) => { picked.current = true; if (eng) { await useExt(eng, s).catch(() => {}); refresh(); } };
  const lastSub = useRef(-1);
  const toggleSubs = () => { if (!eng?.subs.length) return; if (eng.subId >= 0) { lastSub.current = eng.subId; pickSub(-1); } else pickSub(lastSub.current >= 0 ? lastSub.current : eng.subs[0].id); };
  const changeDelay = (d: number) => {
    const x = Math.round(d * 10) / 10;
    setDelay(x); eng?.setSubDelay(x);
    (x ? AsyncStorage.setItem(DELAY_KEY + p.id, String(x)) : AsyncStorage.removeItem(DELAY_KEY + p.id)).catch(() => {});
  };
  const changeRate = (r: number) => { setRate(r); eng?.setRate(r); };
  const fullscreen = () => {
    // Appli Windows : plein écran de la fenêtre (celui du HTML ne remplirait que la fenêtre).
    if (desktop) return win.toggleFullscreen().then(() => win.isFullscreen()).then(setFs);
    const el = rootRef.current as unknown as HTMLElement;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); else el.requestFullscreen?.().catch(() => {});
  };

  // Raccourcis clavier, comme sur les lecteurs habituels.
  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  keys.current = e => {
    if ((e.target as HTMLElement)?.tagName === "INPUT" && !(e.target as HTMLInputElement).classList.contains("mw-range")) return;
    const k = e.key.toLowerCase(), act: Record<string, () => void> = {
      " ": toggle, k: toggle, arrowleft: () => skip(-10), arrowright: () => skip(10), j: () => skip(-10), l: () => skip(10),
      arrowup: () => volume(prefs.volume + 0.1), arrowdown: () => volume(prefs.volume - 0.1), f: fullscreen, m: mute, c: toggleSubs,
      escape: () => (menu ? setMenu(null) : desktop && fs ? fullscreen() : undefined), n: goNext,
    };
    if (act[k]) { e.preventDefault(); act[k](); poke(); }
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keys.current(e);
    const onFs = () => { setFs(!!document.fullscreenElement); setTimeout(() => eng?.resize(), 100); };
    const onResize = () => eng?.resize();
    window.addEventListener("keydown", onKey);
    document.addEventListener("fullscreenchange", onFs);
    window.addEventListener("resize", onResize);
    return () => { window.removeEventListener("keydown", onKey); document.removeEventListener("fullscreenchange", onFs); window.removeEventListener("resize", onResize); };
  }, [eng]);

  // Les contrôles se cachent après 3 s sans bouger la souris pendant la lecture.
  const hide = useRef<ReturnType<typeof setTimeout>>(undefined);
  const poke = () => { setUi(true); clearTimeout(hide.current); hide.current = setTimeout(() => setUi(false), 3000); };
  useEffect(() => {
    const el = rootRef.current as unknown as HTMLElement;
    el.classList.add("mw-player"); // react-native-web ignore className : cible du CSS des sous-titres
    el.addEventListener("mousemove", poke);
    return () => { el.removeEventListener("mousemove", poke); clearTimeout(hide.current); };
  }, []);
  const show = ui || paused || !!menu || !eng;
  // Les sous-titres remontent au-dessus des contrôles quand ils sont affichés.
  useEffect(() => {
    (rootRef.current as HTMLElement | null)?.style.setProperty("--mw-lift", show && eng ? "-110px" : "-3vh");
  }, [show, eng]);
  useEffect(() => { eng?.setSubStyle?.({ size: prefs.size, color: prefs.color, bg: prefs.bg, lift: show }); }, [eng, prefs.size, prefs.color, prefs.bg, show]);

  return (
    <View ref={rootRef} style={[st.root, !show && ({ cursor: "none" } as any)]}>
      <View ref={boxRef} style={StyleSheet.absoluteFill} />
      <Pressable style={StyleSheet.absoluteFill} onPress={() => (menu ? setMenu(null) : toggle())} {...({ onDoubleClick: fullscreen } as any)} accessibilityLabel={paused ? "Lecture" : "Pause"} />

      {!eng && !error ? <ActivityIndicator color={C.red} size="large" style={st.center} /> : null}
      {eng && (paused || blocked) && !menu ? (
        <Pressable onPress={toggle} style={({ hovered }: any) => [st.big, hovered && { transform: [{ scale: 1.06 }] }]} accessibilityLabel={blocked ? "Activer le son" : "Lecture"}>
          <Icon name="play" size={34} color={C.ink} />
          {blocked ? <Text style={[font(600, 13), { position: "absolute", bottom: -30, width: 200, textAlign: "center" }]}>Clique pour lancer avec le son</Text> : null}
        </Pressable>
      ) : null}

      {/* Haut : retour, titre, moteur utilisé */}
      <View style={[st.top, desktop && { paddingRight: 160 }, !show && st.hidden]} pointerEvents={show ? "box-none" : "none"}>
        <Pressable onPress={back} style={({ hovered }: any) => [st.round, hovered && st.roundOn]} accessibilityLabel="Retour"><Icon name="back" color={C.ink} /></Pressable>
        <Text style={[font(600, 17), { flex: 1 }]} numberOfLines={1}>{p.name}{p.label ? ` · ${p.label}` : ""}</Text>
      </View>

      {/* Bas : barre de progression et boutons */}
      {eng ? (
        <View style={[st.bottom, !show && st.hidden]} pointerEvents={show ? "box-none" : "none"}>
          <View style={st.seekRow}>
            <Text style={[font(500, 13), st.time]}>{clock(time)}</Text>
            <View style={{ flex: 1 }}><Range value={time} max={dur} onChange={seek} label="Position" /></View>
            <Text style={[font(500, 13, C.soft), st.time]}>{clock(dur)}</Text>
          </View>
          <View style={st.bar}>
            <Btn icon={paused ? "play" : "pause"} label={paused ? "Lecture (espace)" : "Pause (espace)"} onPress={toggle} />
            <Btn icon="rewind" label="Reculer de 10 s (←)" onPress={() => skip(-10)} />
            <Btn icon="forward" label="Avancer de 10 s (→)" onPress={() => skip(10)} />
            <Btn icon={prefs.muted || prefs.volume === 0 ? "mute" : "volume"} label="Couper le son (M)" onPress={mute} />
            <Range value={prefs.muted ? 0 : prefs.volume} max={1} onChange={volume} label="Volume" width={110} />
            <View style={{ flex: 1 }} />
            {next ? <Btn icon="skip" label="Épisode suivant (N)" onPress={goNext} /> : null}
            <Btn icon="layers" label="Changer de flux" onPress={openStreams} on={menu === "streams"} />
            <Btn icon="audio" label="Langue audio" onPress={() => setMenu(menu === "audio" ? null : "audio")} on={menu === "audio"} />
            <Btn icon="cc" label="Sous-titres (C)" onPress={() => setMenu(menu === "subs" || menu === "style" ? null : "subs")} on={menu === "subs" || menu === "style" || eng.subId >= 0} />
            <Btn icon="speed" label="Vitesse" onPress={() => setMenu(menu === "speed" ? null : "speed")} on={menu === "speed" || rate !== 1} />
            <Btn icon={fs ? "shrink" : "fullscreen"} label="Plein écran (F)" onPress={fullscreen} />
          </View>
        </View>
      ) : null}

      {/* Menus */}
      {eng && menu ? (
        <View style={st.menu}>
          <ScrollView style={{ maxHeight: 460 }} contentContainerStyle={{ padding: 8 }}>
            {menu === "audio" ? (
              <>
                <Text style={st.menuTitle}>Langue audio</Text>
                {eng.audio.length ? eng.audio.map(t => <Item key={t.id} on={t.id === eng.audioId} label={t.label} flag={t.lang} onPress={() => pickAudio(t)} />)
                  : <Text style={st.empty}>{eng.kind !== "navigateur" ? "Une seule piste audio." : `Le lecteur du navigateur ne peut pas changer la langue de ce fichier. ${WHY[eng.why ?? "cors"]}`}</Text>}
              </>
            ) : null}
            {menu === "subs" ? (
              <>
                <Text style={st.menuTitle}>Sous-titres</Text>
                <Item on={eng.subId < 0} label="Désactivés" onPress={() => pickSub(-1)} />
                {eng.subs.some(t => !t.ext) && ext.length ? <Text style={st.group}>Du fichier</Text> : null}
                {eng.subs.filter(t => !t.ext).map(t => <Item key={t.id} on={t.id === eng.subId} label={t.label} flag={t.lang} onPress={() => pickSub(t.id)} />)}
                {ext.length ? <Text style={st.group}>Des addons</Text> : null}
                {ext.map(s => <Item key={s.url} on={loaded.current.get(s.url) === eng.subId} label={s.label} flag={s.lang} onPress={() => pickExt(s)} />)}
                {!eng.subs.some(t => !t.ext) && !ext.length ? <Text style={st.empty}>{eng.kind !== "navigateur" ? "Ce fichier n'a pas de sous-titres." : `Le lecteur du navigateur ne voit pas les sous-titres de ce fichier. ${WHY[eng.why ?? "cors"]}`}</Text> : null}
                {eng.canDelay && eng.subId >= 0 ? (
                  <View style={st.delay}>
                    <Text style={[font(500, 13, C.soft), { flex: 1 }]}>Décalage (par 0,5 s)</Text>
                    <Small label="−" a11y="Sous-titres plus tôt (0,5 s)" onPress={() => changeDelay(delay - 0.5)} />
                    <Text style={[font(600, 13), { minWidth: 54, textAlign: "center" }]}>{delay > 0 ? "+" : ""}{delay.toFixed(1).replace(".", ",")} s</Text>
                    <Small label="+" a11y="Sous-titres plus tard (0,5 s)" onPress={() => changeDelay(delay + 0.5)} />
                  </View>
                ) : null}
                <Item label="Apparence des sous-titres" chevron onPress={() => setMenu("style")} />
                <Text style={st.empty}>Choix automatique : règle « {p.anime === "1" ? "Animés" : "Films et séries"} » (Réglages &gt; Lecture).</Text>
              </>
            ) : null}
            {menu === "style" ? (
              <>
                <Pressable onPress={() => setMenu("subs")} style={st.menuBack}><Icon name="back" size={16} color={C.soft} /><Text style={st.menuTitleInline}>Apparence des sous-titres</Text></Pressable>
                <Choice title="Taille" items={SIZES} value={prefs.size} onChange={size => setPrefs({ size })} />
                <Choice title="Couleur" items={COLORS} value={prefs.color} onChange={color => setPrefs({ color })} />
                <Choice title="Fond" items={BGS} value={prefs.bg} onChange={bg => setPrefs({ bg })} />
                <Choice title="Flou derrière le texte" items={[{ k: 0, label: "Non" }, { k: 1, label: "Léger" }]} value={prefs.blur ? 1 : 0} onChange={b => setPrefs({ blur: !!b })} />
              </>
            ) : null}
            {menu === "streams" ? (
              <>
                <Text style={st.menuTitle}>Flux</Text>
                {!streams ? <ActivityIndicator color={C.red} style={{ margin: 12 }} /> : !streams.length ? <Text style={st.empty}>Aucun autre flux.</Text> : streams.map((s, i) => {
                  const d = describe(s);
                  const extra = [...d.chips.filter(c => !d.quality.includes(c)), d.multi ? "MULTi" : ""].filter(Boolean).join(" · ");
                  return <Item key={i} on={s.url === p.url} label={`${d.quality}${d.size ? ` · ${d.size}` : ""}\n${extra || d.source}`} onPress={() => switchStream(s)} />;
                })}
                <Text style={st.empty}>Le nouveau flux reprend à la même position.</Text>
                <Text style={st.empty}>{ENGINE[eng.kind]}{eng.info ? ` · ${eng.info}` : ""}{eng.detail ? `\nErreur : ${eng.detail}` : ""}</Text>
              </>
            ) : null}
            {menu === "speed" ? (
              <>
                <Text style={st.menuTitle}>Vitesse</Text>
                {RATES.map(r => <Item key={r} on={r === rate} label={r === 1 ? "Normale" : `${String(r).replace(".", ",")}×`} onPress={() => changeRate(r)} />)}
              </>
            ) : null}
          </ScrollView>
        </View>
      ) : null}

      {skipTo ? (
        <Pressable onPress={() => seek(skipTo.to)} style={({ hovered }: any) => [st.skip, hovered && { backgroundColor: "rgba(255,255,255,0.95)" }]} accessibilityLabel={skipTo.label}>
          {({ hovered }: any) => <Text style={font(700, 15, hovered ? "#111" : C.ink)}>{skipTo.label}</Text>}
        </Pressable>
      ) : null}
      {nextCard && next ? (
        <View style={st.next}>
          <Image source={next.thumbnail ?? p.background} style={st.nextImg} contentFit="cover" />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={font(600, 12, C.mute)}>Épisode suivant</Text>
            <Text style={font(700, 15)} numberOfLines={2}>{epLabel(next)}{next.name || next.title ? ` · ${next.name || next.title}` : ""}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 }}>
              <Pressable onPress={goNext} style={({ hovered }: any) => [st.nextBtn, hovered && { opacity: 0.9 }]}>
                {going ? <ActivityIndicator color={C.ink} size="small" /> : <Icon name="play" size={16} color={C.ink} />}
                <Text style={font(700, 14)}>{countdown !== null ? `Lecture dans ${countdown} s` : "Lire"}</Text>
              </Pressable>
              <Small label="Fermer" onPress={() => setNextOff(true)} />
            </View>
            <Pressable onPress={() => setPrefs({ autoNext: !prefs.autoNext })} style={{ marginTop: 6 }}>
              <Text style={font(500, 12, C.mute)}>Lancement automatique : {prefs.autoNext ? "activé" : "désactivé"}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
      {notice ? <Pressable onPress={() => setNotice(null)} style={st.notice}><Text style={font(500, 14)}>{notice}</Text></Pressable> : null}

      {error ? (
        <View style={st.error}>
          <Text style={[font(700, 20), { marginBottom: 8 }]}>Ce flux ne se lit pas ici</Text>
          <Text style={[font(400, 15, C.soft), { lineHeight: 22, marginBottom: 20 }]}>
            Le lecteur avancé n'a pas pu lire ce lien, et le navigateur ne connaît pas ce format. Essaie un autre flux, ou ouvre le lien dans VLC.{error ? `\n\nDétail : ${error}` : ""}
          </Text>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <Pressable onPress={back} style={[st.btn, { backgroundColor: C.red }]}><Text style={font(700, 15)}>Choisir un autre flux</Text></Pressable>
            <Pressable onPress={() => openExternal(p.url)} style={[st.btn, { backgroundColor: "rgba(255,255,255,0.14)" }]}><Text style={font(700, 15)}>Ouvrir le lien</Text></Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function Btn({ icon, label, onPress, on }: { icon: IconName; label: string; onPress: () => void; on?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityLabel={label} {...({ title: label } as any)} style={({ hovered }: any) => [st.btnIcon, (hovered || on) && st.roundOn]}>
      <Icon name={icon} size={22} color={on ? C.ink : C.soft} />
    </Pressable>
  );
}
function Item({ label, on, flag, onPress, chevron }: { label: string; on?: boolean; flag?: string; onPress: () => void; chevron?: boolean }) {
  const f = flag && flagOf(flag);
  return (
    <Pressable onPress={onPress} aria-selected={!!on} style={({ hovered }: any) => [st.item, hovered && { backgroundColor: "rgba(255,255,255,0.08)" }]}>
      {f ? <Image source={`https://flagcdn.com/w40/${f}.png`} style={st.flag} contentFit="cover" /> : null}
      <Text style={[font(on ? 700 : 500, 14, on ? C.ink : C.soft), { flex: 1 }]} numberOfLines={2}>{label}</Text>
      {on ? <Icon name="check" size={16} color={C.red} /> : chevron ? <Icon name="next" size={16} color={C.mute} /> : null}
    </Pressable>
  );
}
function Small({ label, onPress, a11y }: { label: string; onPress: () => void; a11y?: string }) {
  return <Pressable onPress={onPress} accessibilityLabel={a11y} style={({ hovered }: any) => [st.small, hovered && { backgroundColor: "rgba(255,255,255,0.16)" }]}><Text style={font(600, 12)}>{label}</Text></Pressable>;
}
function Choice<T extends string | number>({ title, items, value, onChange }: { title: string; items: { k: T; label: string }[]; value: T; onChange: (k: T) => void }) {
  return (
    <View style={{ paddingHorizontal: 8, paddingVertical: 8 }}>
      <Text style={[font(500, 12, C.mute), { marginBottom: 8 }]}>{title}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {items.map(i => (
          <Pressable key={String(i.k)} onPress={() => onChange(i.k)} aria-selected={i.k === value} style={({ hovered }: any) => [st.small, i.k === value && { backgroundColor: C.red }, hovered && i.k !== value && { backgroundColor: "rgba(255,255,255,0.16)" }]}>
            <Text style={font(600, 13)}>{i.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000", overflow: "hidden" },
  center: { position: "absolute", top: "50%", left: "50%", marginLeft: -18, marginTop: -18 },
  big: { position: "absolute", top: "50%", left: "50%", width: 84, height: 84, marginLeft: -42, marginTop: -42, borderRadius: 42, backgroundColor: "rgba(214,24,42,0.92)", alignItems: "center", justifyContent: "center", paddingLeft: 5 },
  hidden: { opacity: 0 },
  top: { position: "absolute", top: 0, left: 0, right: 0, flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 24, paddingTop: 20, paddingBottom: 40, backgroundImage: "linear-gradient(rgba(0,0,0,0.7), transparent)", transitionProperty: "opacity", transitionDuration: "250ms" } as any,
  bottom: { position: "absolute", bottom: 0, left: 0, right: 0, paddingHorizontal: 24, paddingBottom: 16, paddingTop: 48, backgroundImage: "linear-gradient(transparent, rgba(0,0,0,0.8))", transitionProperty: "opacity", transitionDuration: "250ms" } as any,
  seekRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  time: { minWidth: 56, textAlign: "center", fontVariant: ["tabular-nums"] },
  bar: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 },
  round: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.35)" },
  roundOn: { backgroundColor: "rgba(255,255,255,0.14)" },
  btnIcon: { width: 44, height: 44, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  menu: { position: "absolute", right: 24, bottom: 112, width: 340, borderRadius: 14, backgroundColor: "rgba(20,20,23,0.96)", boxShadow: "0 16px 40px rgba(0,0,0,0.6)" } as any,
  menuTitle: { ...font(700, 15), paddingHorizontal: 10, paddingTop: 8, paddingBottom: 10 },
  menuTitleInline: font(700, 15),
  menuBack: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 10, paddingTop: 8, paddingBottom: 6 },
  item: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 10, paddingVertical: 10, borderRadius: 8 },
  flag: { width: 22, height: 15, borderRadius: 2 },
  group: { ...font(600, 12, C.mute), paddingHorizontal: 10, paddingTop: 10, paddingBottom: 4 },
  empty: { ...font(400, 13, C.mute), paddingHorizontal: 10, paddingVertical: 8, lineHeight: 19 },
  delay: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 10, marginTop: 4, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.08)" },
  small: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.08)" },
  skip: { position: "absolute", right: 24, bottom: 110, paddingHorizontal: 22, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.6)", backgroundColor: "rgba(20,20,22,0.75)", zIndex: 6 },
  next: { position: "absolute", right: 24, bottom: 112, width: 420, flexDirection: "row", gap: 14, padding: 14, borderRadius: 14, backgroundColor: "rgba(20,20,23,0.96)", boxShadow: "0 16px 40px rgba(0,0,0,0.6)" } as any,
  nextImg: { width: 150, aspectRatio: 16 / 9, borderRadius: 8, backgroundColor: C.raised },
  nextBtn: { flexDirection: "row", alignItems: "center", gap: 8, height: 36, paddingHorizontal: 14, borderRadius: 9, backgroundColor: C.red },
  notice: { position: "absolute", top: 80, alignSelf: "center", paddingHorizontal: 18, paddingVertical: 12, borderRadius: 10, backgroundColor: "rgba(20,20,23,0.96)" },
  error: { position: "absolute", alignSelf: "center", top: "30%", maxWidth: 520, padding: 28, borderRadius: 14, backgroundColor: C.raised },
  btn: { height: 46, paddingHorizontal: 20, borderRadius: 10, justifyContent: "center" },
});
