import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, BackHandler, Pressable, ScrollView, StyleSheet, Text, useTVEventHandler, View } from "react-native";
import { Icon, type IconName } from "../../../app/src/components/Icon";
import { C, font } from "../../../app/src/components/theme";
import { epLabel, fetchMeta, fetchStreamsFor, fetchSubtitles, imdbEquivalent, nextEpisode, pickNextStream, type Meta } from "../../../app/src/lib/addons";
import { API, authHeaders } from "../../../app/src/lib/api";
import { chooseTracks, DEFAULT_PREFS, langCode, langName, trackLabel } from "../../../app/src/lib/lang";
import { fromAniSkip, fromChapters, fromIntroDb, type Markers } from "../../../app/src/lib/skip";
import { saveProgress, useStore, visibleAddons } from "../../../app/src/lib/store";
import { MpvPlayerView, type MpvLoaded, type MpvPlayerRef } from "../../modules/mpv-player/src/MpvPlayerView";
import { Focus } from "../components/Focus";

// Mêmes paramètres que le lecteur du site (voir PlayParams dans app/src/components/WebPlayer.tsx).
type Params = { url: string; file: string; binge: string; addon: string; subType: string; subVid: string; anime: string; vo: string; id: string; type: string; name: string; poster: string; background: string; videoId: string; label: string; start: string };
type Track = { id: number; lang: string; label: string; forced?: boolean };
type Ext = { url: string; lang: string; label: string };
const CHANNELS: Record<number, string> = { 1: "Mono", 2: "Stéréo", 6: "5.1", 8: "7.1" };

const clock = (s: number) => {
  if (!isFinite(s) || s < 0) s = 0;
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = Math.floor(s % 60);
  return `${h ? `${h}:` : ""}${h ? String(m).padStart(2, "0") : m}:${String(x).padStart(2, "0")}`;
};

/** Lecteur mpv : la télécommande (ou un toucher au téléphone) fait apparaître les commandes. Même logique que le site :
 *  langues du profil, reprise, position enregistrée, intro et récap à passer, épisode suivant. */
export default function Play() {
  const p = useLocalSearchParams<Params>();
  return <Player key={p.url} p={p} />; // nouveau lecteur à chaque flux (épisode suivant), comme sur le site
}

function Player({ p }: { p: Params }) {
  const mpv = useRef<MpvPlayerRef>(null);
  const addons = useStore(visibleAddons);
  const langPrefs = useStore(s => s.user?.profile?.prefs) ?? DEFAULT_PREFS;
  const choice = p.anime === "1" ? langPrefs.animes : langPrefs.films;
  const [tracks, setTracks] = useState<{ audio: Track[]; subs: Track[] } | null>(null);
  const [aid, setAid] = useState(-1), [sid, setSid] = useState(-1);
  const [ext, setExt] = useState<Ext[]>([]);
  const added = useRef(new Map<string, number>()), nextSubId = useRef(1);
  const picked = useRef(false); // sous-titres choisis à la main : le choix automatique n'y touche plus
  const [time, setTime] = useState(0), [dur, setDur] = useState(0), [paused, setPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [marks, setMarks] = useState<Markers>({});
  const [ui, setUi] = useState(true), [menu, setMenu] = useState<null | "audio" | "subs">(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const next = useMemo(() => (meta ? nextEpisode(meta.videos, p.videoId) : null), [meta]);
  const [going, setGoing] = useState(false), [nextOff, setNextOff] = useState(false), [notice, setNotice] = useState<string | null>(null);
  const pos = useRef({ time: 0, dur: 0 });

  useEffect(() => {
    mpv.current?.load(p.url, +p.start || 0);
    if (p.videoId !== p.id) fetchMeta(addons, p.type, p.id).then(setMeta, () => {});
    // Sous-titres des addons, langues voulues d'abord (langue inconnue écartée, comme sur le site).
    fetchSubtitles(addons, p.subType || p.type, p.subVid || p.videoId, p.file || undefined).then(list => {
      const rank = (l: string) => (l === choice.subs ? 0 : l === choice.subs2 ? 1 : l === "fr" ? 2 : l === "en" ? 3 : 4), n: Record<string, number> = {};
      setExt(list.map(x => ({ ...x, lang: langCode(x.lang) })).filter(x => x.lang).sort((a, b) => rank(a.lang) - rank(b.lang)).slice(0, 60)
        .map(x => ({ url: x.url, lang: x.lang, label: `${langName(x.lang)} · ${x.addon} ${(n[x.lang + x.addon] = (n[x.lang + x.addon] ?? 0) + 1)}` })));
    }, () => {});
  }, [p.url]);

  // Position enregistrée toutes les 5 s, et en quittant.
  useEffect(() => {
    const save = () => {
      const { time: t, dur: d } = pos.current;
      if (t < 5 || !d) return;
      saveProgress({
        meta: { id: p.id, type: p.type, name: p.name, poster: p.poster || undefined, background: p.background || undefined },
        videoId: p.videoId, label: p.label || undefined, time: t, duration: d, updatedAt: Date.now(), binge: p.binge || undefined, addon: p.addon || undefined,
      });
    };
    const i = setInterval(save, 5000);
    return () => { clearInterval(i); save(); };
  }, [p.url]);

  const onLoaded = ({ nativeEvent: x }: { nativeEvent: MpvLoaded }) => {
    const audio: Track[] = x.tracks.filter(t => t.type === "audio").map(t => {
      const lang = langCode(t.lang, t.title);
      return { id: t.id, lang, label: trackLabel(lang, t.title, [t.codec.toUpperCase(), CHANNELS[t.channels] ?? ""]) };
    });
    const subs: Track[] = x.tracks.filter(t => t.type === "sub").map(t => {
      const lang = langCode(t.lang, t.title);
      return { id: t.id, lang, forced: t.forced, label: trackLabel(lang, t.title, [t.forced ? "Forcés" : ""]) };
    });
    // Une seule piste audio sans langue (souvent l'anglais des MULTi) : très probablement la VO du titre.
    const blank = audio.filter(t => !t.lang);
    if (blank.length === 1 && p.vo) Object.assign(blank[0], { lang: p.vo, label: blank[0].label.replace(langName(""), `${langName(p.vo)} (VO probable)`) });
    const current = x.tracks.find(t => t.type === "audio" && t.selected)?.id ?? audio[0]?.id ?? -1;
    nextSubId.current = Math.max(0, ...subs.map(t => t.id)) + 1;
    setTracks({ audio, subs });
    const first = chooseTracks(choice, audio, current, subs, []);
    pickAudio(first.audio ?? current);
    if (first.sub && "id" in first.sub) selectSub(first.sub.id);
    setDur(x.duration);
    if (x.duration > 60) {
      const own = fromChapters(x.chapters, x.duration);
      setMarks(own);
      if (!own.intro || own.credits === undefined) (p.videoId.startsWith("kitsu:") ? fromAniSkip : fromIntroDb)(p.videoId).then(a => setMarks({ ...a, ...own }), () => {});
    }
  };
  // Sous-titres des addons voulus mais absents du fichier : dès que la liste arrive (OpenSubtitles peut être lent).
  useEffect(() => {
    if (!tracks || !ext.length || picked.current || sid >= 0 || !choice.subs) return;
    const late = chooseTracks(choice, tracks.audio, aid, tracks.subs, ext).sub;
    if (late && "ext" in late) useExt(ext[late.ext]);
  }, [tracks, ext]);

  const pickAudio = (id: number) => { setAid(id); if (id >= 0) mpv.current?.set("aid", String(id)); }; // en texte (comme sur Windows)
  const selectSub = (id: number) => { setSid(id); mpv.current?.set("sid", id >= 0 ? String(id) : "no"); };
  // Fichier converti en WebVTT par notre serveur (session dans l'en-tête), donné à mpv en mémoire : la session ne part
  // jamais vers les liens des debrids.
  async function useExt(s: Ext) {
    const known = added.current.get(s.url);
    if (known !== undefined) return selectSub(known);
    const r = await fetch(`${API}/api/subtitle.vtt?v=2&url=${encodeURIComponent(s.url)}`, { headers: authHeaders() });
    if (!r.ok) return setNotice("Ces sous-titres n'ont pas pu être chargés.");
    const id = nextSubId.current++;
    added.current.set(s.url, id);
    await mpv.current?.command(["sub-add", `memory://${await r.text()}`, "select", s.label, s.lang]);
    setSid(id);
  }

  const toggle = () => mpv.current?.set("pause", paused ? "no" : "yes");
  const seek = (t: number) => mpv.current?.command(["seek", String(Math.max(0, t)), "absolute"]);
  const skip = (d: number) => mpv.current?.command(["seek", String(d), "relative"]);
  const goNext = async () => {
    if (!next || going) return;
    setGoing(true);
    const alt = meta ? imdbEquivalent(meta, next) : null;
    const s = pickNextStream(await fetchStreamsFor(addons, p.type, next.id, alt).catch(() => []), p.binge, p.addon);
    if (!s?.url) { setGoing(false); setNotice("Aucun flux lisible pour l'épisode suivant. Choisis-en un sur la page du titre."); return; }
    router.replace({ pathname: "/play", params: { ...p, url: s.url, file: s.behaviorHints?.filename ?? "", binge: s.behaviorHints?.bingeGroup ?? "", addon: s.addon, videoId: next.id, label: epLabel(next), subType: alt?.type ?? p.type, subVid: alt?.id ?? next.id, start: "0" } });
  };

  // Fin d'épisode et repères : mêmes règles que le site (carte au générique, lancement auto 10 s après).
  const left = dur - time;
  const inCredits = marks.credits !== undefined && time >= marks.credits && time < dur;
  const until = inCredits ? Math.min(left, marks.credits! + 10 - time) : left;
  const nextCard = !!next && dur > 60 && (left <= 20 || inCredits) && !nextOff && !menu;
  const countdown = nextCard && until <= 10 ? Math.max(0, Math.ceil(until)) : null;
  useEffect(() => { if (nextCard && until <= 0.6) goNext(); }, [nextCard && until <= 0.6]);
  const within = (r?: [number, number]) => !!r && time >= r[0] && time < r[1] - 1 && !menu;
  const skipTo = within(marks.recap) ? { label: "Passer le récap", to: marks.recap![1] } : within(marks.intro) ? { label: "Passer l'intro", to: marks.intro![1] } : null;

  // Commandes masquées après 5 s de lecture sans rien toucher.
  const [poke, setPoke] = useState(0);
  const show = () => { setUi(true); setPoke(x => x + 1); };
  useEffect(() => {
    if (!ui || paused || menu) return;
    const t = setTimeout(() => setUi(false), 5000);
    return () => clearTimeout(t);
  }, [ui, paused, menu, poke]);
  // Télécommande : commandes cachées, gauche/droite reculent ou avancent de 10 s et OK met en pause ; touches média toujours.
  const uiRef = useRef(ui); uiRef.current = ui || !!menu;
  useTVEventHandler(e => {
    const k = e.eventType;
    if (k === "playPause") return toggle();
    if (k === "fastForward") return skip(10);
    if (k === "rewind") return skip(-10);
    if (uiRef.current) return show();
    if (k === "left") skip(-10);
    else if (k === "right") skip(10);
    else if (k === "select") toggle();
    if (["left", "right", "up", "down", "select"].includes(k)) show();
  });
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (menu) { setMenu(null); return true; }
      return false;
    });
    return () => sub.remove();
  }, [menu]);

  const bar = useRef(0);
  return (
    <View style={st.root}>
      <MpvPlayerView
        ref={mpv} style={StyleSheet.absoluteFill} onLoaded={onLoaded}
        onProgress={({ nativeEvent: x }) => { pos.current = { time: x.time, dur: x.duration }; setTime(x.time); if (x.duration) setDur(x.duration); setPaused(x.paused); }}
        onEnded={({ nativeEvent: x }) => (x.reason === "error" ? setError("Ce flux n'a pas pu être lu. Essaie-en un autre sur la page du titre.") : next ? goNext() : router.back())}
      />
      <Pressable style={StyleSheet.absoluteFill} onPress={() => (ui ? setUi(false) : show())} focusable={false} />
      {!tracks && !error ? <ActivityIndicator size="large" color={C.ink} style={st.center} /> : null}
      {error ? (
        <View style={[st.center, { gap: 16, alignItems: "center" }]}>
          <Text style={font(600, 16)}>{error}</Text>
          <Btn preferred icon="back" label="Retour" onPress={() => router.back()} />
        </View>
      ) : null}

      {skipTo && !error ? <Focus preferred={!ui} onPress={() => seek(skipTo.to)} style={st.skip}><Text style={font(700, 14, "#000")}>{skipTo.label}</Text></Focus> : null}
      {nextCard && next ? (
        <View style={st.next}>
          <Text style={font(500, 12, C.mute)}>Épisode suivant</Text>
          <Text style={font(700, 15)} numberOfLines={1}>{epLabel(next)} · {next.name ?? next.title ?? ""}</Text>
          <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
            <Btn preferred={!ui} icon="next" label={going ? "Lancement…" : countdown !== null ? `Lecture dans ${countdown} s` : "Lancer"} onPress={goNext} />
            <Btn icon="close" label="Fermer" onPress={() => setNextOff(true)} />
          </View>
        </View>
      ) : null}
      {notice ? <Pressable onPress={() => setNotice(null)} style={st.notice}><Text style={font(500, 13)}>{notice}</Text></Pressable> : null}

      {ui && !error ? (
        <>
          <View style={st.top}>
            <Btn icon="back" label="Retour" onPress={() => router.back()} />
            <Text style={font(700, 18)} numberOfLines={1}>{p.name}{p.label ? `  ${p.label}` : ""}</Text>
          </View>
          <View style={st.bottom}>
            <Pressable focusable={false} onLayout={e => (bar.current = e.nativeEvent.layout.width)} onPress={e => dur && seek((e.nativeEvent.locationX / bar.current) * dur)} style={st.track}>
              <View style={[st.fill, { width: `${dur ? Math.min(100, (time / dur) * 100) : 0}%` }]} />
            </Pressable>
            <View style={st.row}>
              <Text style={font(500, 13, C.soft)}>{clock(time)} / {clock(dur)}</Text>
              <View style={{ flex: 1 }} />
              <Btn icon="rewind" label="Reculer de 10 secondes" onPress={() => skip(-10)} />
              <Btn preferred={!skipTo && !nextCard} icon={paused ? "play" : "pause"} label={paused ? "Lecture" : "Pause"} onPress={toggle} />
              <Btn icon="forward" label="Avancer de 10 secondes" onPress={() => skip(10)} />
              <Btn icon="audio" label="Audio" onPress={() => setMenu(menu === "audio" ? null : "audio")} />
              <Btn icon="cc" label="Sous-titres" onPress={() => setMenu(menu === "subs" ? null : "subs")} />
              {next ? <Btn icon="skip" label="Épisode suivant" onPress={goNext} /> : null}
            </View>
          </View>
        </>
      ) : null}

      {menu && tracks ? (
        <View style={st.menu}>
          <Text style={[font(700, 16), { marginBottom: 8 }]}>{menu === "audio" ? "Audio" : "Sous-titres"}</Text>
          <ScrollView>
            {menu === "audio" ? tracks.audio.map((t, i) => <Row key={t.id} first={i === 0} on={t.id === aid} label={t.label} onPress={() => { pickAudio(t.id); setMenu(null); }} />) : (
              <>
                <Row first on={sid < 0} label="Désactivés" onPress={() => { picked.current = true; selectSub(-1); setMenu(null); }} />
                {tracks.subs.map(t => <Row key={t.id} on={t.id === sid} label={t.label} onPress={() => { picked.current = true; selectSub(t.id); setMenu(null); }} />)}
                {ext.length ? <Text style={[font(600, 12, C.faint), { marginTop: 12, marginBottom: 4 }]}>Des addons</Text> : null}
                {ext.map(s => <Row key={s.url} on={added.current.get(s.url) === sid} label={s.label} onPress={() => { picked.current = true; useExt(s).catch(() => {}); setMenu(null); }} />)}
              </>
            )}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

function Btn({ icon, label, onPress, preferred }: { icon: IconName; label: string; onPress: () => void; preferred?: boolean }) {
  const text = !["rewind", "forward", "play", "pause", "back"].includes(icon);
  return (
    <Focus preferred={preferred} onPress={onPress} label={label} style={[st.btn, text && { paddingHorizontal: 14 }]}>
      <Icon name={icon} size={20} color={C.ink} />
      {text ? <Text style={font(600, 13)}>{label}</Text> : null}
    </Focus>
  );
}

function Row({ label, on, onPress, first }: { label: string; on: boolean; onPress: () => void; first?: boolean }) {
  return (
    <Focus preferred={first} onPress={onPress} ring={false} style={st.item} focusStyle={{ backgroundColor: "rgba(255,255,255,0.18)" }}>
      <View style={{ width: 22 }}>{on ? <Icon name="check" size={16} color={C.red} /> : null}</View>
      <Text style={font(on ? 700 : 500, 14)} numberOfLines={1}>{label}</Text>
    </Focus>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  center: { position: "absolute", top: 0, bottom: 0, left: 0, right: 0, justifyContent: "center" },
  top: { position: "absolute", top: 0, left: 0, right: 0, flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 28, paddingTop: 20, paddingBottom: 30, backgroundColor: "rgba(0,0,0,0.55)" },
  bottom: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 28, paddingTop: 20, paddingBottom: 20, gap: 12, backgroundColor: "rgba(0,0,0,0.6)" },
  track: { height: 14, justifyContent: "center" },
  fill: { height: 4, borderRadius: 2, backgroundColor: C.red },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  btn: { flexDirection: "row", alignItems: "center", gap: 8, height: 42, minWidth: 42, paddingHorizontal: 11, borderRadius: 21, borderWidth: 2, borderColor: "transparent", backgroundColor: "rgba(255,255,255,0.12)", justifyContent: "center" },
  skip: { position: "absolute", right: 28, bottom: 120, paddingHorizontal: 18, paddingVertical: 11, borderRadius: 8, borderWidth: 2, borderColor: "transparent", backgroundColor: "#fff" },
  next: { position: "absolute", right: 28, bottom: 120, width: 340, padding: 16, borderRadius: 12, backgroundColor: "rgba(20,20,22,0.92)" },
  notice: { position: "absolute", top: 24, alignSelf: "center", paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, backgroundColor: "rgba(20,20,22,0.92)" },
  menu: { position: "absolute", top: 0, right: 0, bottom: 0, width: 340, padding: 20, backgroundColor: "rgba(14,14,16,0.95)" },
  item: { flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 10, borderRadius: 8 },
});
