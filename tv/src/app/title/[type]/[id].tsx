import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, ScrollView, StyleSheet, Text, View } from "react-native";
import { Icon } from "../../../../../app/src/components/Icon";
import { C, font, genreList } from "../../../../../app/src/components/theme";
import { describe, epLabel, fetchMeta, fetchStreamsFor, imdbEquivalent, pickNextStream, sortedEpisodes, type FoundStream, type Meta, type Video } from "../../../../../app/src/lib/addons";
import { api, type Translation } from "../../../../../app/src/lib/api";
import { isAnime } from "../../../../../app/src/lib/lang";
import { getProgress, toggleLibrary, useStore, visibleAddons } from "../../../../../app/src/lib/store";
import { Focus } from "../../../components/Focus";
import { Backdrop } from "../../../components/Hero";

// Échelle de SeriesGraph, comme sur le site.
const SCALE: [number, string, string][] = [[9, "#186A3B", C.ink], [8, "#28B463", C.ink], [7, "#F4D03F", "#111"], [6, "#F39C12", "#111"], [5, "#E74C3C", C.ink], [0, "#8E44AD", C.ink]];

/** Page d'un titre (maquette 3) : bouton principal sélectionné d'office, saisons et épisodes en rangée, puis flux. */
export default function Title() {
  const { type, id } = useLocalSearchParams<{ type: string; id: string }>();
  const addons = useStore(visibleAddons);
  const inLibrary = useStore(s => !!s.library[id] && !s.library[id].removed);
  const spoil = useStore(s => !!s.user?.profile?.prefs?.spoil);
  const canTranslate = useStore(s => !!s.user?.translate), lang = useStore(s => s.lang);
  const [meta, setMeta] = useState<Meta>({ id, type, name: "" });
  const [fr, setFr] = useState<Translation | null>(null);
  const [ratings, setRatings] = useState<Record<string, number>>({});
  useEffect(() => { fetchMeta(addons, type, id).then(m => m && setMeta(p => ({ ...p, ...m }))); }, [addons, type, id]);
  useEffect(() => { if (canTranslate && lang !== "en" && /^tt\d+$/.test(id)) api<Translation>(`/api/translate?type=${type}&id=${id}&lang=${lang}`).then(setFr, () => {}); }, [id]);
  useEffect(() => { if (type !== "movie" && /^tt\d+$/.test(id)) api<Record<string, number>>(`/api/ratings?id=${id}`).then(setRatings, () => {}); }, [id]);

  const saved = getProgress(id);
  const episodes = useMemo(() => sortedEpisodes(meta.videos), [meta.videos]);
  const seasons = [...new Set(episodes.map(v => v.season!))].sort((a, b) => (a || 99) - (b || 99));
  const isSeries = type !== "movie" && episodes.length > 0;
  const resumeEp = episodes.find(e => e.id === saved?.videoId);
  const seen = resumeEp ? episodes.indexOf(resumeEp) : -1;
  const [season, setSeason] = useState<number>();
  useEffect(() => { if (isSeries && season === undefined) setSeason(resumeEp?.season ?? seasons[0]); }, [isSeries]);
  const anime = isAnime(type, id, meta.genres, meta.country, fr?.originalLanguage);
  const epName = (e: Video) => fr?.episodes[`${e.season}:${e.episode}`]?.name || e.name || e.title;

  // Choix du flux d'une vidéo (film ou épisode) : liste, ou lancement direct pour « Reprendre ».
  const [picking, setPicking] = useState<{ video: Video | null; list: FoundStream[] | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const streamsOf = (v: Video | null) => fetchStreamsFor(addons, type, v?.id ?? id, imdbEquivalent(meta, v)).catch(() => [] as FoundStream[]);
  const play = (s: FoundStream, v: Video | null) => {
    const vid = v?.id ?? id, alt = imdbEquivalent(meta, v);
    router.push({ pathname: "/play", params: {
      url: s.url!, file: s.behaviorHints?.filename ?? "", binge: s.behaviorHints?.bingeGroup ?? "", addon: s.addon, subType: alt?.type ?? type, subVid: alt?.id ?? vid,
      anime: anime ? "1" : "", vo: fr?.originalLanguage ?? "", id, type, name: meta.name, poster: meta.poster ?? "", background: meta.background ?? "",
      videoId: vid, label: v ? epLabel(v) : "", start: String(saved?.videoId === vid ? Math.floor(saved!.time) : 0),
    } });
  };
  const pick = async (v: Video | null) => { setPicking({ video: v, list: null }); const list = await streamsOf(v); setPicking({ video: v, list: list.filter(s => s.url) }); };
  const main = isSeries ? resumeEp ?? episodes.find(e => e.season === seasons[0]) ?? null : null;
  const onMain = async () => {
    if (saved && (!isSeries || resumeEp)) {
      setBusy(true);
      const s = pickNextStream(await streamsOf(resumeEp ?? null), saved.binge, saved.addon);
      setBusy(false);
      if (s?.url) return play(s, resumeEp ?? null);
    }
    pick(main);
  };
  const mainLabel = saved ? `Reprendre${saved.label ? ` ${saved.label}` : ""}` : isSeries && main ? `Regarder ${epLabel(main)}` : "Lecture";
  const facts = [meta.runtime, meta.releaseInfo, meta.imdbRating ? `${meta.imdbRating} IMDb` : "", genreList(meta.genres ?? []).slice(0, 2).join(" · ")].filter(Boolean);

  if (picking) return (
    <View style={{ flex: 1 }}>
      <Backdrop meta={meta} />
      <View style={st.pickHead}>
        <Focus onPress={() => setPicking(null)} style={st.round} label="Retour"><Icon name="back" size={18} color={C.ink} /></Focus>
        <Text style={font(700, 20)} numberOfLines={1}>{picking.video ? `${epLabel(picking.video)} · ${epName(picking.video) ?? ""}` : meta.name}</Text>
      </View>
      {!picking.list ? <ActivityIndicator color={C.ink} style={{ marginTop: 40 }} /> : !picking.list.length ? <Text style={[font(500, 14, C.mute), { padding: 28 }]}>Aucun flux lisible pour cette vidéo avec tes addons.</Text> : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 28, paddingBottom: 40, gap: 8 }}>
          {picking.list.map((s, i) => { const d = describe(s); return (
            <Focus key={i} preferred={i === 0} onPress={() => play(s, picking.video)} style={st.stream} focusStyle={{ backgroundColor: "rgba(255,255,255,0.16)" }}>
              <Text style={font(700, 14)} numberOfLines={1}>{d.source}{d.size ? ` · ${d.size}` : ""}</Text>
              <Text style={[font(500, 12, C.soft), { marginTop: 3 }]} numberOfLines={1}>{[d.quality, ...d.chips, d.multi ? "MULTi" : ""].filter(Boolean).join(" · ")}</Text>
            </Focus>
          ); })}
        </ScrollView>
      )}
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      <Backdrop meta={meta} />
      <ScrollView contentContainerStyle={{ paddingTop: 36, paddingBottom: 40 }}>
        <View style={{ paddingHorizontal: 28, maxWidth: 520 }}>
          <Text style={font(700, 38)} numberOfLines={1}>{fr?.name || meta.name}</Text>
          <Text style={[font(600, 12, C.soft), { marginTop: 8 }]}>{facts.join("   ·   ")}</Text>
          {(fr?.description || meta.description) ? <Text style={[font(400, 12, C.soft), { marginTop: 10, lineHeight: 18 }]} numberOfLines={3}>{fr?.description || meta.description}</Text> : null}
          <View style={st.btns}>
            <Focus preferred onPress={onMain} style={[st.btn, { backgroundColor: C.red }]} focusStyle={{ backgroundColor: "#fff" }}>
              {f => busy ? <ActivityIndicator color={f ? "#111" : C.ink} /> : <><Icon name="play" size={16} color={f ? "#111" : C.ink} /><Text style={font(700, 14, f ? "#111" : C.ink)}>{mainLabel}</Text></>}
            </Focus>
            <Focus onPress={() => toggleLibrary(meta)} style={st.btn} focusStyle={{ backgroundColor: "#fff" }}>
              {f => <><Icon name={inLibrary ? "check" : "plus"} size={16} color={f ? "#111" : C.ink} /><Text style={font(700, 14, f ? "#111" : C.ink)}>Bibliothèque</Text></>}
            </Focus>
          </View>
        </View>
        {isSeries ? (
          <>
            <FlatList horizontal data={seasons} keyExtractor={s => String(s)} showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 28, gap: 8, paddingTop: 22, paddingBottom: 6 }}
              renderItem={({ item: s }) => (
                <Focus onPress={() => setSeason(s)} onFocus={() => setSeason(s)} style={[st.chip, s === season && { backgroundColor: C.red }]} label={`Saison ${s}`}>
                  <Text style={font(600, 12)}>{s ? `Saison ${s}` : "Spéciaux"}</Text>
                </Focus>
              )} />
            <FlatList horizontal data={episodes.filter(e => e.season === season)} keyExtractor={e => e.id} showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 28, gap: 14, paddingVertical: 10 }}
              renderItem={({ item: e }) => {
                const r = ratings[`${e.season}:${e.episode}`], [, bg, ink] = r ? SCALE.find(([min]) => r >= min)! : [];
                return (
                  <Focus onPress={() => pick(e)} style={st.ep} ring={false} label={`${epLabel(e)} ${epName(e) ?? ""}`}>
                    {focused => (
                      <>
                        <View style={[st.epImg, focused && st.focus]}>
                          {e.thumbnail ? <Image source={e.thumbnail} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={spoil && episodes.indexOf(e) > seen ? 12 : 0} /> : null}
                          {r ? <View style={[st.rate, { backgroundColor: bg }]}><Text style={font(700, 10, ink)}>{r.toFixed(1).replace(".", ",")}</Text></View> : null}
                          {saved?.videoId === e.id && saved.duration ? <View style={st.track}><View style={[st.fill, { width: `${Math.round((saved.time / saved.duration) * 100)}%` }]} /></View> : null}
                        </View>
                        <Text style={[font(600, 11, focused ? C.ink : C.soft), { marginTop: 8 }]} numberOfLines={1}>{e.episode}. {epName(e) ?? `Épisode ${e.episode}`}</Text>
                        {e.released ? <Text style={font(400, 10, C.faint)}>{new Date(e.released).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}</Text> : null}
                      </>
                    )}
                  </Focus>
                );
              }} />
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  btns: { flexDirection: "row", gap: 10, marginTop: 18 },
  btn: { flexDirection: "row", alignItems: "center", gap: 8, height: 40, paddingHorizontal: 18, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.14)", borderWidth: 0 },
  chip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 99, backgroundColor: "rgba(255,255,255,0.1)", borderWidth: 2, borderColor: "transparent" },
  ep: { width: 200, borderWidth: 0 },
  epImg: { width: 200, aspectRatio: 16 / 9, borderRadius: 8, overflow: "hidden", backgroundColor: C.raised, borderWidth: 3, borderColor: "transparent" },
  focus: { borderColor: "#fff", transform: [{ scale: 1.06 }] },
  rate: { position: "absolute", right: 6, bottom: 6, minWidth: 28, height: 18, paddingHorizontal: 4, borderRadius: 4, alignItems: "center", justifyContent: "center" },
  track: { position: "absolute", left: 8, right: 40, bottom: 8, height: 3, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.3)" },
  fill: { height: 3, borderRadius: 2, backgroundColor: C.red },
  pickHead: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 28, paddingTop: 28, paddingBottom: 16 },
  round: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.12)", borderWidth: 2, borderColor: "transparent" },
  stream: { padding: 12, borderRadius: 10, backgroundColor: "rgba(20,20,23,0.85)", borderWidth: 2, borderColor: "transparent", maxWidth: 640 },
});
