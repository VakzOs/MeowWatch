import { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, TextInput, View } from "react-native";
import { C, font, TYPE_FR } from "../../../app/src/components/theme";
import { fetchCatalog, searchCatalogs, type Meta } from "../../../app/src/lib/addons";
import { useStore, visibleAddons } from "../../../app/src/lib/store";
import { Backdrop } from "../components/Hero";
import { Shelf, type Tile } from "../components/Shelf";
import { openTitle } from "../lib/nav";

/** Recherche : clavier de la télé (ou du téléphone), résultats par addon et par type. */
export default function Recherche() {
  const addons = useStore(visibleAddons);
  const [query, setQuery] = useState(""), [search, setSearch] = useState("");
  const [hero, setHero] = useState<Meta | null>(null);
  useEffect(() => { const t = setTimeout(() => setSearch(query.trim()), 500); return () => clearTimeout(t); }, [query]);
  const rows = useMemo(() => (search ? searchCatalogs(addons) : []).map(({ addon, catalog }) => ({
    key: `${addon.url}|${catalog.type}|${catalog.id}|${search}`,
    title: `${TYPE_FR[catalog.type] ?? catalog.type} : « ${search} »`, note: addon.manifest.name,
    load: async (): Promise<Tile[]> => (await fetchCatalog(addon, catalog, { search })).map(meta => ({ meta: { ...meta, type: meta.type || catalog.type } })),
  })), [addons, search]);
  return (
    <View style={{ flex: 1 }}>
      <Backdrop meta={hero} />
      <View style={{ padding: 28, paddingBottom: 10 }}>
        <TextInput value={query} onChangeText={setQuery} placeholder="Rechercher un film, une série, un animé" placeholderTextColor={C.faint} autoFocus hasTVPreferredFocus style={[font(500, 16), st.input]} accessibilityLabel="Rechercher" />
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        {rows.map(r => <Shelf key={r.key} title={r.title} note={r.note} load={r.load} onFocus={setHero} onOpen={openTitle} />)}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  input: { height: 46, paddingHorizontal: 16, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.1)", maxWidth: 560 },
});
