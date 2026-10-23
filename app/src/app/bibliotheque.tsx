import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Card, hoverTitle, openTitle } from "../components/Row";
import { Select } from "../components/Select";
import { C, font, TYPE_FR } from "../components/theme";
import { useStore } from "../lib/store";

const SORTS = [{ k: "added", label: "Ajout récent" }, { k: "watched", label: "Vu récemment" }, { k: "name", label: "Titre (A à Z)" }];

/** Bibliothèque du profil : titres ajoutés depuis leur page ou importés de Stremio. */
export default function Bibliotheque() {
  const library = useStore(s => s.library);
  const progress = useStore(s => s.progress);
  const [type, setType] = useState("");
  const [sort, setSort] = useState("added");
  const [menu, setMenu] = useState<string | null>(null);

  const all = Object.values(library).filter(i => !i.removed);
  const types = [...new Set(all.map(i => i.meta.type))];
  const watched = (id: string) => progress[id]?.updatedAt ?? 0;
  const items = all.filter(i => !type || i.meta.type === type).sort((a, b) =>
    sort === "name" ? a.meta.name.localeCompare(b.meta.name, "fr") : sort === "watched" ? watched(b.meta.id) - watched(a.meta.id) : b.addedAt - a.addedAt);

  // Même grille que Découvrir : colonnes d'environ 200 px qui remplissent la largeur.
  const [w, setW] = useState(0);
  const GAP = 20, cols = Math.max(2, Math.floor((w + GAP) / (200 + GAP))), cardW = w ? Math.floor((w - GAP * (cols - 1)) / cols) : 158;

  return (
    <ScrollView contentContainerStyle={{ padding: 32, paddingBottom: 80 }}>
      <Text style={[font(700, 32), { marginBottom: 24 }]}>Bibliothèque</Text>
      {!all.length ? (
        <Text style={font(400, 15, C.mute)}>Ta bibliothèque est vide. Ajoute un titre avec le bouton « Bibliothèque » de sa page, ou importe ta bibliothèque Stremio depuis la page Addons.</Text>
      ) : (
        <View style={st.filters}>
          <Select id="type" open={menu} setOpen={setMenu} value={type} items={[{ k: "", label: "Tous les types" }, ...types.map(t => ({ k: t, label: TYPE_FR[t] ?? t }))]} onChange={setType} />
          <Select id="sort" open={menu} setOpen={setMenu} value={sort} items={SORTS} onChange={setSort} />
          <Text style={[font(500, 14, C.faint), { alignSelf: "center" }]}>{items.length} titre{items.length > 1 ? "s" : ""}</Text>
        </View>
      )}
      <View style={st.grid} onLayout={e => setW(e.nativeEvent.layout.width)}>
        {w ? items.map(({ meta }) => {
          const p = progress[meta.id];
          return <Card key={meta.id} item={{ meta, progress: p && !p.done && p.duration ? p.time / p.duration : undefined, sub: p && !p.done ? p.label : undefined }} width={cardW} selected={false} onPress={() => openTitle(meta)} onHover={() => hoverTitle(meta)} />;
        }) : null}
      </View>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", columnGap: 20, rowGap: 28 },
  filters: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 28, zIndex: 10 },
});
