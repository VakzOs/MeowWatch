import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { Card, hoverTitle, openTitle } from "../components/Row";
import { Select } from "../components/Select";
import { C, catalogName, font, genreList, TYPE_FR } from "../components/theme";
import { canSkip, discoverCatalogs, fetchCatalog, filledGenres, genreOptions, genreRequired, type Meta } from "../lib/addons";
import { useStore } from "../lib/store";

/** Découvrir, façon Stremio : type, catalogue et genre en haut, grille d'affiches qui se charge au défilement. */
export default function Decouvrir() {
  const addons = useStore(s => s.addons);
  const all = useMemo(() => discoverCatalogs(addons), [addons]);
  const types = [...new Set(all.map(c => c.catalog.type))];
  const [type, setType] = useState<string>();
  const [key, setKey] = useState<string>();
  const [genre, setGenre] = useState<string | null>(null);
  const [menu, setMenu] = useState<string | null>(null);

  const curType = type && types.includes(type) ? type : types[0];
  const ofType = all.filter(c => c.catalog.type === curType);
  const keyOf = (c: (typeof all)[number]) => `${c.addon.url}|${c.catalog.id}`;
  const cur = ofType.find(c => keyOf(c) === key) ?? ofType[0];
  // Genres vides retirés du menu une fois sondés (tous affichés en attendant) ; le genre choisi reste toujours visible.
  const [filled, setFilled] = useState<Record<string, string[]>>({});
  const curKey = cur && keyOf(cur);
  useEffect(() => {
    if (!cur || !curKey || filled[curKey] || !genreOptions(cur.catalog).length) return;
    filledGenres(cur.addon, cur.catalog).then(g => setFilled(f => ({ ...f, [curKey]: g })));
  }, [curKey]);
  const list = cur ? (curKey && filled[curKey]) || genreOptions(cur.catalog) : [];
  const curGenre = cur && genreRequired(cur.catalog) ? genre ?? list[0] : genre;
  const genres = curGenre && !list.includes(curGenre) ? [curGenre, ...list] : list;

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

  // Grille qui remplit exactement la largeur : autant de colonnes que possible autour de 200 px.
  const [w, setW] = useState(0);
  const GAP = 20, cols = Math.max(2, Math.floor((w + GAP) / (200 + GAP))), cardW = w ? Math.floor((w - GAP * (cols - 1)) / cols) : 158;

  return (
    <ScrollView onScroll={onScroll} scrollEventThrottle={200} contentContainerStyle={{ padding: 32, paddingBottom: 80 }}>
      <Text style={[font(700, 32), { marginBottom: 24 }]}>Découvrir</Text>
      {!all.length ? <Text style={font(400, 15, C.mute)}>Aucun catalogue : ajoute un addon dans la page Addons.</Text> : (
        <View style={st.filters}>
          <Select id="type" open={menu} setOpen={setMenu} value={curType} items={types.map(t => ({ k: t, label: TYPE_FR[t] ?? t }))} onChange={t => { setType(t); setKey(undefined); setGenre(null); }} />
          <Select id="cat" open={menu} setOpen={setMenu} value={cur && keyOf(cur)} items={ofType.map(c => ({ k: keyOf(c), label: catalogName(c.catalog.name, c.catalog.id), note: all.some(o => o.addon !== c.addon) ? c.addon.manifest.name : undefined }))} onChange={k => { setKey(k); setGenre(null); }} />
          {genres.length ? (
            <Select id="genre" open={menu} setOpen={setMenu} value={curGenre ?? ""} items={[...(cur && !genreRequired(cur.catalog) ? [{ k: "", label: "Tous les genres" }] : []), ...genres.map(g => ({ k: g, label: genreList([g])[0] }))]} onChange={g => setGenre(g || null)} />
          ) : null}
        </View>
      )}
      <View style={st.grid} onLayout={e => setW(e.nativeEvent.layout.width)}>
        {w ? items.map(m => <Card key={m.id} item={{ meta: m }} width={cardW} selected={false} onPress={() => openTitle(m)} onHover={() => hoverTitle(m)} />) : null}
      </View>
      {busy ? <ActivityIndicator color={C.red} style={{ marginTop: 24 }} /> : null}
      {!busy && cur && !items.length && end ? <Text style={font(400, 15, C.mute)}>Rien dans ce catalogue.</Text> : null}
    </ScrollView>
  );
}

const st = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", columnGap: 20, rowGap: 28 },
  filters: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 28, zIndex: 10 },
});
