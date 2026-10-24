import { useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { C, font } from "../../../app/src/components/theme";
import type { Meta } from "../../../app/src/lib/addons";
import { useStore } from "../../../app/src/lib/store";
import { Backdrop, HeroText } from "../components/Hero";
import { Shelf, type Tile } from "../components/Shelf";
import { openTitle } from "../lib/nav";

/** Bibliothèque : films puis séries et animés, du dernier ajouté au plus ancien. */
export default function Bibliotheque() {
  const library = useStore(s => s.library);
  const [hero, setHero] = useState<Meta | null>(null);
  const items = useMemo(() => Object.values(library).filter(i => !i.removed).sort((a, b) => b.addedAt - a.addedAt), [library]);
  const films = useMemo(() => async (): Promise<Tile[]> => items.filter(i => i.meta.type === "movie").map(i => ({ meta: i.meta as Meta })), [items]);
  const series = useMemo(() => async (): Promise<Tile[]> => items.filter(i => i.meta.type !== "movie").map(i => ({ meta: i.meta as Meta })), [items]);
  return (
    <View style={{ flex: 1 }}>
      <Backdrop meta={hero} />
      <View style={{ paddingHorizontal: 28, paddingTop: 44 }}><HeroText meta={hero} /></View>
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        {!items.length ? <Text style={[font(500, 14, C.mute), { paddingHorizontal: 28 }]}>Ta bibliothèque est vide : ajoute des titres depuis leur page.</Text> : null}
        <Shelf first title="Films" load={films} onFocus={setHero} onOpen={openTitle} />
        <Shelf title="Séries et animés" load={series} onFocus={setHero} onOpen={openTitle} />
      </ScrollView>
    </View>
  );
}
