import { Image } from "expo-image";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { describe, fetchMeta, fetchStreams, type FoundStream, type Meta, type Video } from "../lib/addons";
import { getProgress, setAmbiance, useStore } from "../lib/store";
import { Icon } from "./Icon";
import { C, font, genres } from "./theme";

const epLabel = (v: Video) => `S${v.season} · É${v.episode}`;

/** Panneau de droite : fiche du titre sélectionné et flux trouvés par les addons. */
export function Detail({ preview }: { preview: Meta }) {
  const addons = useStore(s => s.addons);
  const [meta, setMeta] = useState<Meta>(preview);
  useEffect(() => { fetchMeta(addons, preview.type, preview.id).then(m => m && setMeta({ ...preview, ...m })); }, [addons, preview]);
  useEffect(() => { setAmbiance(meta.background ?? meta.poster); }, [meta.background, meta.poster]);

  const saved = getProgress(meta.id);
  const episodes = useMemo(() => (meta.videos ?? []).filter(v => v.season !== undefined).sort((a, b) => a.season! - b.season! || a.episode! - b.episode!), [meta.videos]);
  const seasons = [...new Set(episodes.map(v => v.season!))].sort((a, b) => (a || 99) - (b || 99)); // spéciaux (saison 0) en dernier
  const isSeries = meta.type === "series" && episodes.length > 0;
  const [season, setSeason] = useState<number>();
  const [video, setVideo] = useState<Video>();
  useEffect(() => {
    if (!isSeries) return;
    const v = episodes.find(e => e.id === saved?.videoId) ?? episodes.find(e => e.season === seasons[0]);
    setVideo(v); setSeason(v?.season);
  }, [isSeries, episodes]);

  const videoId = isSeries ? video?.id : meta.id;
  const [streams, setStreams] = useState<FoundStream[] | null>(null);
  useEffect(() => {
    if (!videoId) return;
    let on = true; setStreams(null);
    fetchStreams(addons, meta.type, videoId).then(s => on && setStreams(s));
    return () => { on = false; };
  }, [addons, meta.type, videoId]);

  const shown = (streams ?? []).filter(s => s.url || s.externalUrl);
  const torrents = (streams ?? []).length - shown.length;
  const play = (s: FoundStream) => {
    if (!s.url) return s.externalUrl && Linking.openURL(s.externalUrl);
    router.push({ pathname: "/play", params: {
      url: s.url, id: meta.id, type: meta.type, name: meta.name, poster: meta.poster ?? "", background: meta.background ?? "",
      videoId: videoId!, label: video ? epLabel(video) : "", start: String(saved?.videoId === videoId ? Math.floor(saved!.time) : 0),
    } });
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 32, paddingBottom: 48 }}>
      <Text style={[font(700, 26), { lineHeight: 30, marginBottom: 8 }]}>{meta.name}</Text>
      <View style={st.meta}>
        {meta.imdbRating ? <Text style={font(700, 14)}>IMDb {meta.imdbRating}</Text> : null}
        {[meta.releaseInfo, meta.runtime, genres(meta.genres)].filter(Boolean).map(t => <Text key={t} style={font(400, 14, C.mute)}>{t}</Text>)}
      </View>
      {meta.description ? <Text style={[font(400, 15, C.soft), { lineHeight: 22, marginBottom: 20 }]} numberOfLines={6}>{meta.description}</Text> : null}

      {isSeries ? (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: 12 }}>
            {seasons.map(n => (
              <Pressable key={n} onPress={() => setSeason(n)} style={[st.chip, season === n && st.chipOn]}>
                <Text style={font(600, 13, season === n ? C.ink : C.mute)}>{n ? `Saison ${n}` : "Spéciaux"}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <View style={st.episodes}>
            <ScrollView nestedScrollEnabled>
              {episodes.filter(e => e.season === season).map(e => (
                <Pressable key={e.id} onPress={() => setVideo(e)} style={({ hovered }: any) => [st.ep, (video?.id === e.id) && st.epOn, hovered && st.epHover]}>
                  <Text style={font(600, 13, C.mute)}>{e.episode}</Text>
                  <Text style={[font(500, 14), { flex: 1 }]} numberOfLines={1}>{e.name ?? e.title ?? `Épisode ${e.episode}`}</Text>
                  {saved?.videoId === e.id ? <View style={st.dot} /> : null}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </>
      ) : null}

      {shown[0]?.url ? (
        <Pressable onPress={() => play(shown.find(s => s.url)!)} style={({ hovered }: any) => [st.play, hovered && { opacity: 0.9 }]}>
          <Icon name="play" color={C.ink} />
          <Text style={font(700, 16)}>{saved?.videoId === videoId && saved?.time ? "Reprendre" : "Lire le meilleur flux"}</Text>
        </Pressable>
      ) : null}

      <View style={st.h4}>
        <Text style={font(600, 14, C.mute)}>Flux des addons{video ? ` · ${epLabel(video)}` : ""}</Text>
        {streams ? <Text style={font(600, 14, C.mute)}>{shown.length} trouvés</Text> : null}
      </View>
      {!streams ? <ActivityIndicator color={C.red} style={{ marginTop: 16 }} /> : null}
      {streams && !shown.length ? <Text style={font(400, 14, C.mute)}>Aucun flux lisible. Ajoute un addon de flux avec ton debrid (Torrentio, AIOStreams, Comet…).</Text> : null}
      {shown.map((s, i) => {
        const d = describe(s);
        return (
          <Pressable key={i} onPress={() => play(s)} style={({ hovered, focused }: any) => [st.stream, (hovered || focused) && st.streamHover]}>
            <View style={{ flex: 1 }}>
              <Text style={font(700, 15)} numberOfLines={1}>{d.quality}{i === 0 ? <Text style={font(600, 12, C.red)}>   Meilleur</Text> : null}</Text>
              <Text style={font(400, 13, C.mute)} numberOfLines={1}>{d.external ? "Lien externe · " : ""}{d.source}</Text>
            </View>
            {d.size ? <Text style={font(400, 13, C.soft)}>{d.size}</Text> : d.external ? <Icon name="link" size={16} color={C.mute} /> : null}
          </Pressable>
        );
      })}
      {torrents > 0 ? <Text style={[font(400, 13, C.faint), { marginTop: 8 }]}>{torrents} flux torrent masqués (MeowWatch lit les liens debrid).</Text> : null}
    </ScrollView>
  );
}

const st = StyleSheet.create({
  meta: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 12 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: C.raised },
  chipOn: { backgroundColor: C.red },
  episodes: { maxHeight: 220, marginBottom: 16, borderRadius: 10, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.04)" },
  ep: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 10 },
  epOn: { backgroundColor: "rgba(214,24,42,0.18)" },
  epHover: { backgroundColor: "rgba(255,255,255,0.06)" },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.red },
  play: { height: 48, borderRadius: 10, backgroundColor: C.red, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 24 },
  h4: { flexDirection: "row", justifyContent: "space-between", marginBottom: 10 },
  stream: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.07)", marginBottom: 8 },
  streamHover: { backgroundColor: "rgba(255,255,255,0.12)", outlineColor: C.red, outlineWidth: 2, outlineStyle: "solid" } as any,
});
