import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { Icon } from "../components/Icon";
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
  const [menu, setMenu] = useState<string | null>(null);

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

type Opt = { k: string; label: string; note?: string };

/** Menu déroulant (comme les filtres de Stremio) ; un seul ouvert à la fois, un clic ailleurs le ferme. */
function Select({ id, open, setOpen, items, value, onChange }: { id: string; open: string | null; setOpen: (id: string | null) => void; items: Opt[]; value?: string; onChange: (k: string) => void }) {
  const isOpen = open === id;
  const cur = items.find(i => i.k === value) ?? items[0];
  return (
    <View style={{ zIndex: isOpen ? 20 : 1 }}>
      <Pressable onPress={() => setOpen(isOpen ? null : id)} style={({ hovered }: any) => [st.select, (hovered || isOpen) && { backgroundColor: "rgba(255,255,255,0.12)" }]}>
        <Text style={font(600, 15)} numberOfLines={1}>{cur?.label}</Text>
        <Icon name={isOpen ? "up" : "down"} size={16} color={C.mute} />
      </Pressable>
      {isOpen ? (
        <>
          <Pressable onPress={() => setOpen(null)} style={st.backdrop} accessibilityLabel="Fermer le menu" />
          <ScrollView style={st.menu} contentContainerStyle={{ padding: 6 }}>
            {items.map(i => {
              const on = i.k === cur?.k;
              return (
                <Pressable key={i.k} onPress={() => { onChange(i.k); setOpen(null); }} style={({ hovered }: any) => [st.option, hovered && { backgroundColor: "rgba(255,255,255,0.08)" }]}>
                  <Text style={[font(on ? 700 : 500, 14, on ? C.ink : C.soft), { flex: 1 }]}>{i.label}</Text>
                  {i.note ? <Text style={font(500, 12, C.faint)}>{i.note}</Text> : null}
                  {on ? <View style={st.dot} /> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </>
      ) : null}
    </View>
  );
}

const st = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", columnGap: 20, rowGap: 28 },
  filters: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 28, zIndex: 10 },
  select: { flexDirection: "row", alignItems: "center", gap: 10, height: 44, minWidth: 170, paddingHorizontal: 16, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.07)", justifyContent: "space-between" },
  backdrop: { position: "fixed" as any, top: 0, left: 0, right: 0, bottom: 0 },
  menu: { position: "absolute", top: 50, left: 0, minWidth: 220, maxHeight: 380, borderRadius: 12, backgroundColor: "#1A1A1D", boxShadow: "0 12px 32px rgba(0,0,0,0.5)" } as any,
  option: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.red },
});
