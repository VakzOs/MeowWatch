import AsyncStorage from "@react-native-async-storage/async-storage";
import { Image } from "expo-image";
import { router } from "expo-router";
import { createElement, useEffect, useReducer, useRef, useState } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { flagOf } from "../lib/lang";
import { createEngine, type Engine, type Track } from "../lib/player";
import { saveProgress } from "../lib/store";
import { Icon, type IconName } from "./Icon";
import { C, font } from "./theme";

export type PlayParams = { url: string; file?: string; id: string; type: string; name: string; poster: string; background: string; videoId: string; label: string; start: string };

// Réglages du lecteur, retenus sur l'appareil.
type Prefs = { volume: number; muted: boolean; size: number; color: string; bg: string };
const PREFS_KEY = "meowwatch:lecteur";
const DEFAULT: Prefs = { volume: 1, muted: false, size: 1, color: "", bg: "" };
const SIZES = [{ k: 0.8, label: "Petit" }, { k: 1, label: "Normal" }, { k: 1.3, label: "Grand" }, { k: 1.6, label: "Très grand" }];
const COLORS = [{ k: "", label: "D'origine" }, { k: "#FFFFFF", label: "Blanc" }, { k: "#FFE14D", label: "Jaune" }];
const BGS = [{ k: "", label: "Aucun" }, { k: "rgba(0,0,0,0.55)", label: "Léger" }, { k: "rgba(0,0,0,0.9)", label: "Noir" }];
const RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];

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
      .mw-player .ASS-box { transform: translateY(var(--mw-lift, 0px)); transition: transform 250ms; }
      .mw-player .ASS-dialogue span { font-size: calc(var(--ass-scale) * var(--ass-real-fs) * ${prefs.size}px) !important;
        ${prefs.color ? `--ass-fill-color: ${prefs.color} !important;` : ""}
        ${prefs.bg ? `background: ${prefs.bg} !important; padding: 0.05em 0.3em; border-radius: 4px; box-decoration-break: clone; -webkit-box-decoration-break: clone;` : ""} }
    `;
  }, [prefs.size, prefs.color, prefs.bg]);
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
  const [menu, setMenu] = useState<null | "audio" | "subs" | "style" | "speed">(null);
  const [ui, setUi] = useState(true);
  const [fs, setFs] = useState(false);
  const [rate, setRate] = useState(1);
  const [delay, setDelay] = useState(0);
  const [blocked, setBlocked] = useState(false); // son ou lecture bloqués tant qu'on n'a pas cliqué
  const [prefs, setPrefsState] = useState<Prefs>(DEFAULT);
  const [, refresh] = useReducer(x => x + 1, 0);
  const prefsRef = useRef(prefs); prefsRef.current = prefs;
  const setPrefs = (patch: Partial<Prefs>) => {
    const next = { ...prefsRef.current, ...patch };
    setPrefsState(next);
    AsyncStorage.setItem(PREFS_KEY, JSON.stringify(next)).catch(() => {});
  };
  useCss(prefs);
  const back = () => (router.canGoBack() ? router.back() : router.replace("/"));

  // Démarrage : réglages de l'appareil, puis moteur (avancé si possible), reprise et lecture.
  useEffect(() => {
    const box = boxRef.current as unknown as HTMLDivElement;
    let e: Engine | null = null, dead = false;
    (async () => {
      const saved = await AsyncStorage.getItem(PREFS_KEY).then(r => (r ? { ...DEFAULT, ...JSON.parse(r) } : DEFAULT), () => DEFAULT);
      setPrefsState(saved);
      const x = await createEngine(box, p.url, p.file || undefined, setError);
      if (dead) return x.destroy();
      e = x;
      x.setVolume(saved.muted ? 0 : saved.volume);
      if (+p.start > 0) x.seek(+p.start);
      try { await x.play(); setPaused(false); } catch { setBlocked(true); }
      if (x.suspended()) setBlocked(true);
      x.resize();
      setEng(x);
    })().catch(err => !dead && setError(err?.message ?? String(err)));
    return () => { dead = true; e?.destroy(); };
  }, [p.url]);

  // Temps affiché, et position enregistrée toutes les 5 s (« Reprendre »).
  useEffect(() => {
    if (!eng) return;
    const tick = setInterval(() => { setTime(eng.time()); setDur(eng.duration()); }, 250);
    const save = setInterval(() => {
      const t = eng.time(), d = eng.duration();
      if (t < 5 || !d) return;
      saveProgress({
        meta: { id: p.id, type: p.type, name: p.name, poster: p.poster || undefined, background: p.background || undefined },
        videoId: p.videoId, label: p.label || undefined, time: t, duration: d, updatedAt: Date.now(),
      });
    }, 5000);
    return () => { clearInterval(tick); clearInterval(save); };
  }, [eng]);

  const toggle = async () => {
    if (!eng) return;
    if (blocked) { await eng.resume(); setBlocked(false); }
    if (paused) { await eng.play().catch(() => {}); setPaused(false); } else { eng.pause(); setPaused(true); }
  };
  const seek = (s: number) => { if (!eng) return; const t = Math.max(0, Math.min(s, dur || s)); eng.seek(t); setTime(t); };
  const volume = (v: number) => { const x = Math.max(0, Math.min(1, v)); eng?.setVolume(x); setPrefs({ volume: x, muted: x === 0 }); };
  const mute = () => { const m = !prefs.muted; eng?.setVolume(m ? 0 : prefs.volume || 1); setPrefs({ muted: m, volume: prefs.volume || 1 }); };
  const pickAudio = async (t: Track) => { await eng?.selectAudio(t.id); refresh(); };
  const pickSub = async (id: number) => { await eng?.selectSub(id); refresh(); };
  const lastSub = useRef(-1);
  const toggleSubs = () => { if (!eng?.subs.length) return; if (eng.subId >= 0) { lastSub.current = eng.subId; pickSub(-1); } else pickSub(lastSub.current >= 0 ? lastSub.current : eng.subs[0].id); };
  const changeDelay = (d: number) => { const x = Math.round(d * 10) / 10; setDelay(x); eng?.setSubDelay(x); };
  const changeRate = (r: number) => { setRate(r); eng?.setRate(r); };
  const fullscreen = () => {
    const el = rootRef.current as unknown as HTMLElement;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); else el.requestFullscreen?.().catch(() => {});
  };

  // Raccourcis clavier, comme sur les lecteurs habituels.
  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  keys.current = e => {
    if ((e.target as HTMLElement)?.tagName === "INPUT" && !(e.target as HTMLInputElement).classList.contains("mw-range")) return;
    const k = e.key.toLowerCase(), act: Record<string, () => void> = {
      " ": toggle, k: toggle, arrowleft: () => seek(time - 10), arrowright: () => seek(time + 10), j: () => seek(time - 10), l: () => seek(time + 10),
      arrowup: () => volume(prefs.volume + 0.1), arrowdown: () => volume(prefs.volume - 0.1), f: fullscreen, m: mute, c: toggleSubs,
      escape: () => setMenu(null),
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
  useEffect(() => { (rootRef.current as HTMLElement | null)?.style.setProperty("--mw-lift", show && eng ? "-110px" : "-3vh"); }, [show, eng]);

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
      <View style={[st.top, !show && st.hidden]} pointerEvents={show ? "box-none" : "none"}>
        <Pressable onPress={back} style={({ hovered }: any) => [st.round, hovered && st.roundOn]} accessibilityLabel="Retour"><Icon name="back" color={C.ink} /></Pressable>
        <Text style={[font(600, 17), { flex: 1 }]} numberOfLines={1}>{p.name}{p.label ? ` · ${p.label}` : ""}</Text>
        {eng ? <Text style={font(500, 12, C.mute)}>{eng.kind === "avance" ? "Lecteur avancé" : "Lecteur du navigateur"}</Text> : null}
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
            <Btn icon="rewind" label="Reculer de 10 s (←)" onPress={() => seek(time - 10)} />
            <Btn icon="forward" label="Avancer de 10 s (→)" onPress={() => seek(time + 10)} />
            <Btn icon={prefs.muted || prefs.volume === 0 ? "mute" : "volume"} label="Couper le son (M)" onPress={mute} />
            <Range value={prefs.muted ? 0 : prefs.volume} max={1} onChange={volume} label="Volume" width={110} />
            <View style={{ flex: 1 }} />
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
                  : <Text style={st.empty}>{eng.kind === "avance" ? "Une seule piste audio." : "Le lecteur du navigateur ne peut pas changer la langue de ce fichier."}</Text>}
              </>
            ) : null}
            {menu === "subs" ? (
              <>
                <Text style={st.menuTitle}>Sous-titres</Text>
                <Item on={eng.subId < 0} label="Désactivés" onPress={() => pickSub(-1)} />
                {eng.subs.map(t => <Item key={t.id} on={t.id === eng.subId} label={t.label} flag={t.lang} onPress={() => pickSub(t.id)} />)}
                {!eng.subs.length ? <Text style={st.empty}>{eng.kind === "avance" ? "Ce fichier n'a pas de sous-titres." : "Le lecteur du navigateur ne voit pas les sous-titres de ce fichier."}</Text> : null}
                {eng.canDelay && eng.subs.length ? (
                  <View style={st.delay}>
                    <Text style={[font(500, 13, C.soft), { flex: 1 }]}>Décalage</Text>
                    <Small label="−0,5 s" onPress={() => changeDelay(delay - 0.5)} />
                    <Text style={[font(600, 13), { minWidth: 54, textAlign: "center" }]}>{delay > 0 ? "+" : ""}{delay.toFixed(1).replace(".", ",")} s</Text>
                    <Small label="+0,5 s" onPress={() => changeDelay(delay + 0.5)} />
                  </View>
                ) : null}
                <Item label="Apparence des sous-titres" chevron onPress={() => setMenu("style")} />
              </>
            ) : null}
            {menu === "style" ? (
              <>
                <Pressable onPress={() => setMenu("subs")} style={st.menuBack}><Icon name="back" size={16} color={C.soft} /><Text style={st.menuTitleInline}>Apparence des sous-titres</Text></Pressable>
                <Choice title="Taille" items={SIZES} value={prefs.size} onChange={size => setPrefs({ size })} />
                <Choice title="Couleur" items={COLORS} value={prefs.color} onChange={color => setPrefs({ color })} />
                <Choice title="Fond" items={BGS} value={prefs.bg} onChange={bg => setPrefs({ bg })} />
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

      {error ? (
        <View style={st.error}>
          <Text style={[font(700, 20), { marginBottom: 8 }]}>Ce flux ne se lit pas ici</Text>
          <Text style={[font(400, 15, C.soft), { lineHeight: 22, marginBottom: 20 }]}>
            Le lecteur avancé n'a pas pu lire ce lien, et le navigateur ne connaît pas ce format. Essaie un autre flux, ou ouvre le lien dans VLC.{error ? `\n\nDétail : ${error}` : ""}
          </Text>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <Pressable onPress={back} style={[st.btn, { backgroundColor: C.red }]}><Text style={font(700, 15)}>Choisir un autre flux</Text></Pressable>
            <Pressable onPress={() => Linking.openURL(p.url)} style={[st.btn, { backgroundColor: "rgba(255,255,255,0.14)" }]}><Text style={font(700, 15)}>Ouvrir le lien</Text></Pressable>
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
function Small({ label, onPress }: { label: string; onPress: () => void }) {
  return <Pressable onPress={onPress} style={({ hovered }: any) => [st.small, hovered && { backgroundColor: "rgba(255,255,255,0.16)" }]}><Text style={font(600, 12)}>{label}</Text></Pressable>;
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
  empty: { ...font(400, 13, C.mute), paddingHorizontal: 10, paddingVertical: 8, lineHeight: 19 },
  delay: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 10, marginTop: 4, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.08)" },
  small: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.08)" },
  error: { position: "absolute", alignSelf: "center", top: "30%", maxWidth: 520, padding: 28, borderRadius: 14, backgroundColor: C.raised },
  btn: { height: 46, paddingHorizontal: 20, borderRadius: 10, justifyContent: "center" },
});
