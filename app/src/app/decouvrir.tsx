import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { Card, hoverTitle, openTitle } from "../components/Row";
import { C, catalogName, font, genreList, TYPE_FR } from "../components/theme";
import { canSkip, discoverCatalogs, fetchCatalog, genreOptions, genreRequired, type Meta } from "../lib/addons";
import { useStore } from "../lib/store";

/** Découvrir, façon Stremio : type, catalogue et genre en haut, grille d'affiches qui se charge au défilement. */
export default function Decouvrir() {
  const addons = useStore(s => s.addons);
  const all = useMemo(() => discoverCatalogs(addons), [addons]);
  const types = [...new Set(all.map(c => c.catalog.type))];
  const [type, setType] = useState<string>();
  const [key, setKey] = useState<string>();
  const [genre, setGenre] = useState<string | null>(null);

  const curType = type && types.includes(type) ? type : types[0];
  const ofType = all.filter(c => c.catalog.type === curType);
  const keyOf = (c: (typeof all)[number]) => `${c.addon.url}|${c.catalog.id}`;
  const cur = ofType.find(c => keyOf(c) === key) ?? ofType[0];
  const genres = cur ? genreOptions(cur.catalog) : [];
  const curGenre = cur && genreRequired(cur.catalog) ? genre ?? genres[0] : genre;

  // Pages de résultats ; on repart de zéro quand le choix change.
  const [items, setItems] = useState<Meta[]>([]);
  const [busy, setBusy] = useState(false);
  const [end, setEnd] = useState(false);
  // Une réponse arrivée après un changement de type, catalogue ou genre est ignorée.
  const sel = cur ? `${keyOf(cur)}|${curGenre ?? ""}` : "";
  const selRef = useRef(sel); selRef.current = sel;
  const load = async (reset: boolean) => {
    if (!cur || (!reset && (busy || end))) return;
    const asked = sel;
    setBusy(true);
    const extra: Record<string, string> = {};
    if (curGenre) extra.genre = curGenre;
    const skip = reset ? 0 : items.length;
    if (skip && canSkip(cur.catalog)) extra.skip = String(skip);
    const page = await fetchCatalog(cur.addon, cur.catalog, Object.keys(extra).length ? extra : undefined).catch(() => [] as Meta[]);
    if (asked !== selRef.current) return;
    const seen = new Set(reset ? [] : items.map(m => m.id));
    const fresh = page.filter(m => !seen.has(m.id)).map(m => ({ ...m, type: m.type || cur.catalog.type }));
    setItems(reset ? fresh : [...items, ...fresh]);
    setEnd(!fresh.length || !canSkip(cur.catalog));
    setBusy(false);
  };
  useEffect(() => { setItems([]); setEnd(false); load(true); }, [sel]);
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement: l, contentOffset: o, contentSize: c } = e.nativeEvent;
    if (l.height + o.y > c.height - 600) load(false);
  };

  return (
    <ScrollView onScroll={onScroll} scrollEventThrottle={200} contentContainerStyle={{ padding: 32, paddingBottom: 80 }}>
      <Text style={[font(700, 28), { marginBottom: 20 }]}>Découvrir</Text>
      {!all.length ? <Text style={font(400, 15, C.mute)}>Aucun catalogue : ajoute un addon dans la page Addons.</Text> : (
        <View style={{ gap: 12, marginBottom: 24 }}>
          <Chips items={types.map(t => ({ k: t, label: TYPE_FR[t] ?? t }))} value={curType} onChange={t => { setType(t); setKey(undefined); setGenre(null); }} big />
          <Chips items={ofType.map(c => ({ k: keyOf(c), label: catalogName(c.catalog.name, c.catalog.id), note: all.some(o => o.addon !== c.addon) ? c.addon.manifest.name : undefined }))} value={cur && keyOf(cur)} onChange={k => { setKey(k); setGenre(null); }} />
          {genres.length ? (
            <Chips items={[...(cur && !genreRequired(cur.catalog) ? [{ k: "", label: "Tous les genres" }] : []), ...genres.map(g => ({ k: g, label: genreList([g])[0] }))]} value={curGenre ?? ""} onChange={g => setGenre(g || null)} small />
          ) : null}
        </View>
      )}
      <View style={st.grid}>
        {items.map(m => <Card key={m.id} item={{ meta: m }} selected={false} onPress={() => openTitle(m)} onHover={() => hoverTitle(m)} />)}
      </View>
      {busy ? <ActivityIndicator color={C.red} style={{ marginTop: 24 }} /> : null}
      {!busy && cur && !items.length && end ? <Text style={font(400, 15, C.mute)}>Rien dans ce catalogue.</Text> : null}
    </ScrollView>
  );
}

function Chips({ items, value, onChange, big, small }: { items: { k: string; label: string; note?: string }[]; value?: string; onChange: (k: string) => void; big?: boolean; small?: boolean }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {items.map(i => {
        const on = i.k === value;
        return (
          <Pressable key={i.k} onPress={() => onChange(i.k)} style={({ hovered }: any) => [st.chip, big && st.big, small && st.small, on ? st.on : hovered && { backgroundColor: "rgba(255,255,255,0.14)" }]}>
            <Text style={font(on ? 700 : 600, big ? 15 : small ? 13 : 14, on ? C.ink : C.soft)}>{i.label}</Text>
            {i.note ? <Text style={font(500, 12, on ? "rgba(255,255,255,0.75)" : C.faint)}>{i.note}</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const st = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 18 },
  chip: { flexDirection: "row", alignItems: "baseline", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.08)" },
  big: { paddingHorizontal: 18, paddingVertical: 10 },
  small: { paddingHorizontal: 12, paddingVertical: 6 },
  on: { backgroundColor: C.red },
});
