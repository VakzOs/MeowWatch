import { Image } from "expo-image";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Icon } from "../components/Icon";
import { hoverTitle, openTitle } from "../components/Row";
import { C, font } from "../components/theme";
import { fetchMeta, type Addon, type Meta } from "../lib/addons";
import { dayKey, episodesByDay, monthGrid, type CalEpisode } from "../lib/calendar";
import { useStore } from "../lib/store";

// ponytail: fiches gardées en mémoire le temps de l'onglet (pas de rafraîchissement) ; suffisant pour une bibliothèque de quelques centaines de séries.
const metaCache = new Map<string, Promise<Meta | null>>();
const loadMeta = (addons: Addon[], type: string, id: string) => {
  if (!metaCache.has(id)) metaCache.set(id, fetchMeta(addons, type, id).catch(() => null));
  return metaCache.get(id)!;
};

const WEEK = ["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const epLabel = (e: CalEpisode) => (e.video.season !== undefined ? `S${e.video.season} · É${e.video.episode}` : `Épisode ${e.video.episode ?? ""}`);

/** Calendrier, façon Stremio : les épisodes des séries de la bibliothèque, par jour de sortie. */
export default function Calendrier() {
  const addons = useStore(s => s.addons);
  const library = useStore(s => s.library);
  const series = useMemo(() => Object.values(library).filter(i => !i.removed && i.meta.type !== "movie"), [library]);
  const [metas, setMetas] = useState<Meta[] | null>(null);
  useEffect(() => {
    let on = true;
    Promise.all(series.map(i => loadMeta(addons, i.meta.type, i.meta.id))).then(m => on && setMetas(m.filter((x): x is Meta => !!x)));
    return () => { on = false; };
  }, [series, addons]);

  const today = new Date();
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [day, setDay] = useState(dayKey(today));
  const grid = monthGrid(month.getFullYear(), month.getMonth());
  const days = useMemo(() => episodesByDay(metas ?? [], grid[0], new Date(+grid[41] + 864e5)), [metas, month]);
  const go = (delta: number) => { const m = new Date(month.getFullYear(), month.getMonth() + delta, 1); setMonth(m); setDay(dayKey(m)); };
  const goToday = () => { setMonth(new Date(today.getFullYear(), today.getMonth(), 1)); setDay(dayKey(today)); };
  const picked = days[day] ?? [];
  const pickedDate = new Date(`${day}T12:00:00`);

  const [w, setW] = useState(0);
  const side = w > 1100; // la liste du jour à droite sur grand écran, dessous sinon

  return (
    <ScrollView contentContainerStyle={{ padding: 32, paddingBottom: 80 }} onLayout={e => setW(e.nativeEvent.layout.width)}>
      <View style={st.head}>
        <Text style={[font(700, 32), { flex: 1 }]}>Calendrier</Text>
        {metas === null && series.length ? <ActivityIndicator color={C.red} /> : null}
        <Pressable onPress={goToday} style={({ hovered }: any) => [st.btn, hovered && st.btnOn]}><Text style={font(600, 14)}>Aujourd'hui</Text></Pressable>
        <Pressable onPress={() => go(-1)} accessibilityLabel="Mois précédent" style={({ hovered }: any) => [st.round, hovered && st.btnOn]}><Icon name="back" size={18} color={C.ink} /></Pressable>
        <Text style={[font(600, 18), { minWidth: 160, textAlign: "center" }]}>{cap(month.toLocaleDateString("fr-FR", { month: "long", year: "numeric" }))}</Text>
        <Pressable onPress={() => go(1)} accessibilityLabel="Mois suivant" style={({ hovered }: any) => [st.round, hovered && st.btnOn]}><Icon name="next" size={18} color={C.ink} /></Pressable>
      </View>
      {!series.length ? (
        <Text style={[font(400, 15, C.mute), { marginBottom: 20 }]}>Ajoute des séries à ta bibliothèque : leurs épisodes apparaîtront ici à leur date de sortie.</Text>
      ) : null}

      <View style={{ flexDirection: side ? "row" : "column", gap: 24, alignItems: "flex-start" }}>
        <View style={{ flex: side ? 1 : undefined, width: side ? undefined : "100%" }}>
          <View style={st.week}>{WEEK.map(d => <Text key={d} style={[font(600, 13, C.faint), st.weekDay]}>{d}</Text>)}</View>
          <View style={st.grid}>
            {grid.map(d => {
              const k = dayKey(d), eps = days[k] ?? [], out = d.getMonth() !== month.getMonth(), isToday = k === dayKey(today), on = k === day;
              return (
                <Pressable key={k} onPress={() => setDay(k)} accessibilityLabel={d.toLocaleDateString("fr-FR", { day: "numeric", month: "long" }) + (eps.length ? `, ${eps.length} épisode${eps.length > 1 ? "s" : ""}` : "")}
                  style={({ hovered }: any) => [st.cell, out && { opacity: 0.4 }, hovered && { backgroundColor: "rgba(255,255,255,0.08)" }, on && st.cellOn]}>
                  <View style={[st.num, isToday && { backgroundColor: C.red }]}><Text style={font(isToday ? 700 : 500, 13, isToday ? C.ink : C.soft)}>{d.getDate()}</Text></View>
                  <View style={st.thumbs}>
                    {eps.slice(0, 3).map(e => <Image key={e.video.id} source={e.meta.poster} style={st.thumb} contentFit="cover" />)}
                    {eps.length > 3 ? <Text style={[font(600, 12, C.mute), { alignSelf: "center" }]}>+{eps.length - 3}</Text> : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={[st.panel, { width: side ? 380 : "100%" }]}>
          <Text style={[font(600, 17), { marginBottom: 12 }]}>{cap(pickedDate.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }))}</Text>
          {!picked.length ? <Text style={font(400, 14, C.faint)}>Aucun épisode ce jour-là.</Text> : picked.map(e => (
            <Pressable key={e.video.id} onPress={() => openTitle(e.meta, e.video.season ?? 1)} onHoverIn={() => hoverTitle(e.meta)} accessibilityLabel={`${e.meta.name} ${epLabel(e)}`}
              style={({ hovered }: any) => [st.ep, hovered && { backgroundColor: "rgba(255,255,255,0.1)" }]}>
              <Image source={e.video.thumbnail ?? e.meta.background ?? e.meta.poster} style={st.epImg} contentFit="cover" />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={font(600, 14)} numberOfLines={1}>{e.meta.name}</Text>
                <Text style={font(400, 13, C.mute)} numberOfLines={1}>{epLabel(e)}{e.video.name || e.video.title ? ` · ${e.video.name || e.video.title}` : ""}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 24 },
  btn: { height: 40, paddingHorizontal: 16, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.07)", justifyContent: "center" },
  btnOn: { backgroundColor: "rgba(255,255,255,0.14)" },
  round: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.07)", alignItems: "center", justifyContent: "center" },
  week: { flexDirection: "row", marginBottom: 8 },
  weekDay: { width: `${100 / 7}%`, paddingLeft: 10 } as any,
  grid: { flexDirection: "row", flexWrap: "wrap", borderRadius: 12, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.03)" },
  cell: { width: `${100 / 7}%`, height: 118, padding: 8, gap: 6, borderWidth: 0.5, borderColor: "rgba(255,255,255,0.06)" } as any,
  cellOn: { backgroundColor: "rgba(255,255,255,0.1)", outlineColor: C.red, outlineWidth: 2, outlineOffset: -2, outlineStyle: "solid" } as any,
  num: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  thumbs: { flexDirection: "row", gap: 4, flex: 1 },
  thumb: { height: "100%", aspectRatio: 2 / 3, borderRadius: 4, backgroundColor: C.raised, maxHeight: 72 } as any,
  panel: { borderRadius: 14, padding: 16, backgroundColor: "rgba(0,0,0,0.25)" },
  ep: { flexDirection: "row", alignItems: "center", gap: 12, padding: 8, borderRadius: 10, marginBottom: 4 },
  epImg: { width: 96, aspectRatio: 16 / 9, borderRadius: 6, backgroundColor: C.raised },
});
