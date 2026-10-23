import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Icon } from "../../../components/Icon";
import { C, font, genreList } from "../../../components/theme";
import { describe, fetchMeta, fetchStreamsFor, imdbEquivalent, type FoundStream, type Meta, type Video } from "../../../lib/addons";
import { api, type Translation } from "../../../lib/api";
import { getProgress, setAmbiance, useStore } from "../../../lib/store";

const epLabel = (v: Video) => `S${v.season} · É${v.episode}`;
const back = () => (router.canGoBack() ? router.back() : router.replace("/"));

/** Page d'un titre, façon Stremio : grande image, infos à gauche, épisodes puis flux dans la colonne de droite. */
export default function Title() {
  const { type, id, name, poster } = useLocalSearchParams<{ type: string; id: string; name?: string; poster?: string }>();
  const addons = useStore(s => s.addons);
  const [meta, setMeta] = useState<Meta>({ id, type, name: name ?? "", poster });
  const lang = useStore(s => s.lang);
  const canTranslate = useStore(s => !!s.user?.translate);
  const [fr, setFr] = useState<Translation | null>(null);
  useEffect(() => { fetchMeta(addons, type, id).then(m => m && setMeta(p => ({ ...p, ...m }))); }, [addons, type, id]);
  useEffect(() => {
    setFr(null);
    if (canTranslate && lang !== "en" && /^tt\d+$/.test(id)) api<Translation>(`/api/translate?type=${type}&id=${id}&lang=${lang}`).then(setFr, () => {});
  }, [type, id, lang, canTranslate]);
  // Les textes traduits remplacent ceux de l'addon quand ils existent ; images et identifiants ne changent pas.
  const t = (key: "name" | "description") => fr?.[key] || meta[key];
  const epName = (e: Video) => fr?.episodes[`${e.season}:${e.episode}`]?.name || e.name || e.title;
  useEffect(() => { setAmbiance(undefined); }, []);
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && back();
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, []);

  const saved = getProgress(id);
  // Animés (Kitsu…) : épisodes souvent numérotés sans saison → saison 1.
  const episodes = useMemo(() => (meta.videos ?? []).filter(v => v.season !== undefined || v.episode !== undefined)
    .map(v => (v.season === undefined ? { ...v, season: 1 } : v)).sort((a, b) => a.season! - b.season! || (a.episode ?? 0) - (b.episode ?? 0)), [meta.videos]);
  const seasons = [...new Set(episodes.map(v => v.season!))].sort((a, b) => (a || 99) - (b || 99)); // spéciaux (saison 0) en dernier
  const isSeries = type !== "movie" && episodes.length > 0; // séries, animés, chaînes à épisodes
  const resumeEp = episodes.find(e => e.id === saved?.videoId);
  const [season, setSeason] = useState<number>();
  const [video, setVideo] = useState<Video | null>(null); // épisode ouvert dans la colonne (sinon : liste des épisodes)
  useEffect(() => { if (isSeries && season === undefined) setSeason(resumeEp?.season ?? seasons[0]); }, [isSeries]);

  const videoId = isSeries ? video?.id : id;
  const [streams, setStreams] = useState<FoundStream[] | null>(null);
  useEffect(() => {
    if (!videoId) return;
    let on = true; setStreams(null);
    fetchStreamsFor(addons, type, videoId, imdbEquivalent(meta, isSeries ? video : null)).then(s => on && setStreams(s));
    return () => { on = false; };
  }, [addons, type, videoId, meta.imdb_id]);
  const shown = (streams ?? []).filter(s => s.url || s.externalUrl);
  const torrents = (streams ?? []).length - shown.length;
  const playable = shown.filter(s => s.url).length; // les flux sans vidéo (avis d'addon, lien externe) ne sont jamais « Meilleur »

  const play = (s: FoundStream, v: Video | null = video) => {
    if (!s.url) return s.externalUrl && Linking.openURL(s.externalUrl);
    const vid = v?.id ?? id;
    router.push({ pathname: "/play", params: {
      url: s.url, id, type, name: meta.name, poster: meta.poster ?? "", background: meta.background ?? "",
      videoId: vid, label: v ? epLabel(v) : "", start: String(saved?.videoId === vid ? Math.floor(saved!.time) : 0),
    } });
  };
  // Bouton principal : reprend l'épisode en cours, sinon le premier ; ouvre ses flux dans la colonne.
  const main = isSeries ? resumeEp ?? episodes.find(e => e.season === seasons[0]) : null;
  const mainLabel = saved ? `Reprendre${saved.label ? ` ${saved.label}` : ""}` : isSeries && main ? `Regarder ${epLabel(main)}` : "Lecture";
  const onMain = () => (isSeries ? main && (setSeason(main.season), setVideo(main)) : shown.find(s => s.url) && play(shown.find(s => s.url)!, null));
  const trailer = meta.trailerStreams?.[0]?.ytId;

  return (
    <View style={st.root}>
      {meta.background ? <Image source={meta.background.replace("/medium/", "/large/")} style={StyleSheet.absoluteFill} contentFit="cover" transition={400} /> : null}
      {/* Voile uniforme sur toute la largeur (un dégradé partiel laissait une cassure sur grand écran). */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(8,8,10,0.62)" }]} />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={st.info}>
        <Pressable onPress={back} accessibilityLabel="Retour" style={({ hovered }: any) => [st.back, hovered && { backgroundColor: "rgba(255,255,255,0.12)" }]}>
          <Icon name="back" color={C.ink} size={22} />
        </Pressable>
        {meta.logo ? <Image source={meta.logo} style={st.logo} contentFit="contain" contentPosition="left" accessibilityLabel={meta.name} />
          : <Text style={[font(700, 44), { marginBottom: 24 }]}>{t("name")}</Text>}
        <View style={st.facts}>
          {[meta.runtime, meta.releaseInfo].filter(Boolean).map(t => <Text key={t} style={font(600, 16)}>{t}</Text>)}
          {meta.imdbRating ? <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><Text style={font(600, 16)}>{meta.imdbRating}</Text><Text style={st.imdb}>IMDb</Text></View> : null}
        </View>
        {fr?.genres?.length || meta.genres?.length ? <Chips title="Genres" items={fr?.genres?.length ? fr.genres : genreList(meta.genres)} /> : null}
        {meta.cast?.length ? <Chips title="Distribution" items={meta.cast.slice(0, 6)} /> : null}
        {t("description") ? (
          <>
            <Text style={st.label}>Résumé</Text>
            <Text style={[font(400, 16, C.soft), { lineHeight: 24, maxWidth: 720 }]}>{t("description")}</Text>
          </>
        ) : null}
        <View style={st.actions}>
          <Pressable onPress={onMain} style={({ hovered }: any) => [st.play, hovered && { opacity: 0.9 }]}>
            <Icon name="play" color={C.ink} />
            <Text style={font(700, 16)}>{mainLabel}</Text>
          </Pressable>
          {trailer ? (
            <Pressable onPress={() => Linking.openURL(`https://www.youtube.com/watch?v=${trailer}`)} style={({ hovered }: any) => [st.ghost, hovered && { backgroundColor: "rgba(255,255,255,0.18)" }]}>
              <Text style={font(600, 15)}>Bande-annonce</Text>
            </Pressable>
          ) : null}
        </View>
      </ScrollView>

      <View style={st.side}>
        {isSeries && !video ? (
          <>
            <SeasonPicker seasons={seasons} value={season} onChange={setSeason} />
            <ScrollView contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 24 }}>
              {episodes.filter(e => e.season === season).map(e => (
                <Pressable key={e.id} onPress={() => setVideo(e)} style={({ hovered }: any) => [st.ep, hovered && st.epHover]}>
                  {e.thumbnail ? <Image source={e.thumbnail} style={st.thumb} contentFit="cover" /> : <View style={[st.thumb, { backgroundColor: C.raised }]} />}
                  <View style={{ flex: 1 }}>
                    <Text style={font(600, 14)} numberOfLines={2}>{e.episode}. {epName(e) ?? `Épisode ${e.episode}`}</Text>
                    {e.released ? <Text style={font(400, 12, C.faint)}>{new Date(e.released).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}</Text> : null}
                    {saved?.videoId === e.id && saved.duration ? <View style={st.track}><View style={[st.fill, { width: `${Math.round((saved.time / saved.duration) * 100)}%` }]} /></View> : null}
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          </>
        ) : (
          <>
            <View style={st.sideHead}>
              {isSeries ? <Pressable onPress={() => setVideo(null)} accessibilityLabel="Épisodes" style={st.iconBtn}><Icon name="back" color={C.ink} size={18} /></Pressable> : null}
              <Text style={[font(600, 14), { flex: 1 }]} numberOfLines={1}>{video ? `${epLabel(video)} ${epName(video) ?? ""}` : "Flux des addons"}</Text>
              {streams ? <Text style={font(500, 13, C.mute)}>{playable}</Text> : null}
            </View>
            <ScrollView contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 24 }}>
              {!streams ? <ActivityIndicator color={C.red} style={{ marginTop: 24 }} /> : null}
              {streams && !playable ? <Text style={[font(400, 14, C.mute), { padding: 8 }]}>Aucun flux lisible. Ajoute un addon de flux avec ton debrid (Torrentio, AIOStreams, Comet…).</Text> : null}
              {shown.map((s, i) => {
                const d = describe(s);
                if (!s.url) return ( // avis d'un addon (« aucune source… ») ou lien externe : discret, pas un flux
                  <Pressable key={i} onPress={() => play(s)} style={({ hovered }: any) => [st.notice, hovered && { opacity: 0.85 }]}>
                    <Text style={font(600, 12, C.mute)}>{s.addon}</Text>
                    <Text style={font(400, 12, C.faint)} numberOfLines={3}>{d.source.replace(new RegExp(`^${s.addon} · `), "") || d.quality}</Text>
                  </Pressable>
                );
                return (
                  <Pressable key={i} onPress={() => play(s)} style={({ hovered, focused }: any) => [st.stream, (hovered || focused) && st.streamOn]}>
                    <View style={{ flex: 1 }}>
                      <Text style={font(700, 14)} numberOfLines={1}>{d.quality}{i === 0 ? <Text style={font(600, 12, C.red)}>   Meilleur</Text> : null}</Text>
                      <Text style={font(400, 12, C.mute)} numberOfLines={2}>{d.external ? "Lien externe · " : ""}{d.source}</Text>
                    </View>
                    {d.size ? <Text style={font(500, 12, C.soft)}>{d.size}</Text> : null}
                  </Pressable>
                );
              })}
              {torrents > 0 ? <Text style={[font(400, 12, C.faint), { padding: 8 }]}>{torrents} flux torrent masqués (Meow Watch lit les liens debrid).</Text> : null}
            </ScrollView>
          </>
        )}
      </View>
    </View>
  );
}

const seasonName = (n: number) => (n ? `Saison ${n}` : "Spéciaux");

/** ‹ Saison 5 › ; un clic sur le nom déplie toutes les saisons (pratique au-delà de quelques saisons). */
function SeasonPicker({ seasons, value, onChange }: { seasons: number[]; value?: number; onChange: (n: number) => void }) {
  const [open, setOpen] = useState(false);
  const i = Math.max(0, seasons.indexOf(value ?? seasons[0]));
  const go = (d: number) => seasons[i + d] !== undefined && onChange(seasons[i + d]);
  const n = seasons.filter(Boolean).length;
  if (seasons.length < 2) return <View style={st.picker}><Text style={font(700, 15)}>Épisodes</Text></View>;
  return (
    <View style={st.picker}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Pressable onPress={() => go(-1)} disabled={i === 0} accessibilityLabel="Saison précédente" style={[st.iconBtn, i === 0 && { opacity: 0.3 }]}><Icon name="back" color={C.ink} size={18} /></Pressable>
        <Pressable onPress={() => setOpen(o => !o)} style={({ hovered }: any) => [st.pickerName, hovered && { backgroundColor: "rgba(255,255,255,0.1)" }]}>
          <Text style={font(700, 15)}>{seasonName(seasons[i])}</Text>
          <Icon name={open ? "up" : "down"} color={C.mute} size={16} />
        </Pressable>
        <Pressable onPress={() => go(1)} disabled={i === seasons.length - 1} accessibilityLabel="Saison suivante" style={[st.iconBtn, i === seasons.length - 1 && { opacity: 0.3 }]}><Icon name="next" color={C.ink} size={18} /></Pressable>
        <Text style={[font(500, 13, C.faint), { marginLeft: "auto" as any }]}>{n} saison{n > 1 ? "s" : ""}</Text>
      </View>
      {open ? (
        <View style={st.grid}>
          {seasons.map(n => (
            <Pressable key={n} onPress={() => { onChange(n); setOpen(false); }} style={({ hovered }: any) => [st.chip, n === seasons[i] ? st.chipOn : hovered && { backgroundColor: "rgba(255,255,255,0.16)" }]}>
              <Text style={font(600, 13, n === seasons[i] ? C.ink : C.soft)}>{n || "Sp."}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function Chips({ title, items }: { title: string; items: string[] }) {
  return (
    <>
      <Text style={st.label}>{title}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 6 }}>
        {[...new Set(items)].filter(Boolean).map(t => <View key={t} style={st.tag}><Text style={font(500, 13)}>{t}</Text></View>)}
      </View>
    </>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, flexDirection: "row", backgroundColor: "#08080A" },
  info: { padding: 40, paddingTop: 28, paddingBottom: 48, minHeight: "100%" as any, justifyContent: "flex-end" },
  back: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", marginBottom: "auto" as any },
  logo: { width: 420, height: 150, marginTop: 32, marginBottom: 28 },
  facts: { flexDirection: "row", alignItems: "center", gap: 28, marginBottom: 20 },
  imdb: { ...font(700, 11, "#000"), backgroundColor: "#F5C518", paddingHorizontal: 5, paddingVertical: 1, borderRadius: 3 },
  label: { ...font(600, 12, C.mute), marginTop: 14, marginBottom: 8 },
  tag: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.1)" },
  actions: { flexDirection: "row", gap: 12, marginTop: 32 },
  play: { height: 50, paddingHorizontal: 26, borderRadius: 12, backgroundColor: C.red, flexDirection: "row", alignItems: "center", gap: 10 },
  ghost: { height: 50, paddingHorizontal: 22, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.1)", justifyContent: "center" },
  side: { width: 400, backgroundColor: "rgba(8,8,10,0.78)" },
  sideHead: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 18 },
  iconBtn: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.08)" },
  chip: { minWidth: 44, alignItems: "center", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.08)" },
  picker: { padding: 16, gap: 12 },
  pickerName: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, height: 36, borderRadius: 10 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chipOn: { backgroundColor: C.red },
  ep: { flexDirection: "row", gap: 12, padding: 8, borderRadius: 10, alignItems: "center" },
  epHover: { backgroundColor: "rgba(255,255,255,0.07)" },
  thumb: { width: 120, aspectRatio: 16 / 9, borderRadius: 8 },
  track: { height: 3, borderRadius: 2, backgroundColor: "#333", marginTop: 6, overflow: "hidden" },
  fill: { height: 3, backgroundColor: C.red },
  stream: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.06)", marginBottom: 8 },
  notice: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.03)", marginBottom: 8, gap: 2 },
  streamOn: { backgroundColor: "rgba(255,255,255,0.12)", outlineColor: C.red, outlineWidth: 2, outlineOffset: -2, outlineStyle: "solid" } as any,
});
