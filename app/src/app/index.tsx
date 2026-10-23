import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Icon } from "../components/Icon";
import { Row, type Item } from "../components/Row";
import { C, font, TYPE_FR } from "../components/theme";
import { fetchCatalog, homeCatalogs, searchCatalogs, type Meta } from "../lib/addons";
import { setAmbiance, useStore } from "../lib/store";

const open = (m: Meta) => router.push({ pathname: "/title/[type]/[id]", params: { type: m.type, id: m.id, name: m.name, poster: m.poster ?? "" } });
const hover = (m: Meta) => setAmbiance(m.background ?? m.poster);

export default function Home() {
  const addons = useStore(s => s.addons);
  const progress = useStore(s => s.progress);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => { const t = setTimeout(() => setSearch(query.trim()), 400); return () => clearTimeout(t); }, [query]);

  const resume = useMemo(() => Object.values(progress).filter(p => !p.done).sort((a, b) => b.updatedAt - a.updatedAt), [progress]);
  // Les chargeurs sont mémorisés : une rangée ne recharge que si ses addons ou la recherche changent.
  const rows = useMemo(() => {
    const list = search ? searchCatalogs(addons) : homeCatalogs(addons);
    return list.map(({ addon, catalog }) => ({
      key: `${addon.url}|${catalog.type}|${catalog.id}|${search}`,
      title: search ? `${TYPE_FR[catalog.type] ?? catalog.type} : « ${search} »` : `${catalog.name ?? catalog.id} · ${TYPE_FR[catalog.type] ?? catalog.type}`,
      note: addon.manifest.name,
      load: async (): Promise<Item[]> => {
        const metas = await fetchCatalog(addon, catalog, search ? { search } : undefined);
        return metas.map(meta => ({ meta: { ...meta, type: meta.type || catalog.type } }));
      },
    }));
  }, [addons, search]);
  const loadResume = useMemo(() => async () => resume.map(p => ({ meta: p.meta as Meta, wide: true, progress: p.duration ? p.time / p.duration : 0, sub: p.label })), [resume]);

  return (
    <>
      <View style={{ flex: 1, flexDirection: "row" }}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 80 }}>
          <View style={st.search}>
            <Icon name="search" color={C.faint} />
            <TextInput value={query} onChangeText={setQuery} placeholder="Rechercher un film, une série" placeholderTextColor={C.faint} style={[font(400, 15), st.input]} accessibilityLabel="Rechercher" />
          </View>
          {!search && resume.length ? <Row title="Reprendre" note="sur tous tes appareils" load={loadResume} onSelect={open} onHover={hover} /> : null}
          {rows.map(r => <Row key={r.key} title={r.title} note={r.note} load={r.load} onSelect={open} onHover={hover} />)}
          {!rows.length ? <Text style={[font(400, 15, C.mute), { padding: 32 }]}>{search ? "Aucun addon installé ne sait chercher." : "Aucun catalogue : ajoute un addon dans la page Addons."}</Text> : null}
        </ScrollView>
      </View>
    </>
  );
}

const st = StyleSheet.create({
  search: { flexDirection: "row", alignItems: "center", gap: 12, height: 46, marginTop: 20, marginHorizontal: 32, paddingHorizontal: 16, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.08)" },
  input: { flex: 1, height: 46, outlineStyle: "none" } as any,
});
