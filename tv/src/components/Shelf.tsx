import { Image } from "expo-image";
import { useEffect, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { C, font } from "../../../app/src/components/theme";
import type { Meta } from "../../../app/src/lib/addons";
import { Focus } from "./Focus";

export type Tile = { meta: Meta; wide?: boolean; progress?: number; sub?: string };

/** Rangée horizontale (titre au-dessus, nom sous chaque vignette) ; la vignette sélectionnée remplit le grand visuel. */
export function Shelf({ title, note, load, onFocus, onOpen, first }: {
  title: string; note?: string; load: () => Promise<Tile[]>; onFocus: (m: Meta) => void; onOpen: (m: Meta) => void; first?: boolean;
}) {
  const [items, setItems] = useState<Tile[] | null>(null);
  useEffect(() => {
    let on = true;
    load().then(i => { if (!on) return; setItems(i.slice(0, 20)); if (first && i[0]) onFocus(i[0].meta); }, () => on && setItems([])); // au téléphone, rien n'a le focus : le grand visuel montre le premier titre
    return () => { on = false; };
  }, [load]);
  if (items && !items.length) return null;
  return (
    <View style={{ marginBottom: 6 }}>
      <Text style={st.h}>{title}{note ? <Text style={font(500, 11, C.faint)}>   {note}</Text> : null}</Text>
      <FlatList
        horizontal data={items ?? []} keyExtractor={(t, i) => t.meta.id + i} showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 28, paddingVertical: 10, gap: 14 }}
        renderItem={({ item: t, index }) => (
          <Focus preferred={first && index === 0} onFocus={() => onFocus(t.meta)} onPress={() => onOpen(t.meta)} style={[st.card, t.wide ? st.wide : st.poster]} ring={false} label={t.meta.name}>
            {focused => (
              <>
                <View style={[st.img, t.wide ? st.wideImg : st.posterImg, focused && st.focus]}>
                  <Image source={(t.wide ? t.meta.background : t.meta.poster) ?? t.meta.poster} style={StyleSheet.absoluteFill} contentFit="cover" />
                  {t.progress ? <View style={st.track}><View style={[st.fill, { width: `${Math.round(t.progress * 100)}%` }]} /></View> : null}
                </View>
                <Text style={[font(600, 11, focused ? C.ink : C.soft), st.lbl]} numberOfLines={1}>{t.meta.name}</Text>
                <Text style={font(400, 10, C.faint)} numberOfLines={1}>{t.sub ?? t.meta.releaseInfo ?? ""}</Text>
              </>
            )}
          </Focus>
        )}
      />
    </View>
  );
}

const st = StyleSheet.create({
  h: { ...font(600, 15), paddingHorizontal: 28, marginTop: 6 },
  card: { borderWidth: 0 },
  wide: { width: 210 },
  poster: { width: 110 },
  img: { borderRadius: 8, overflow: "hidden", backgroundColor: C.raised, borderWidth: 3, borderColor: "transparent" },
  wideImg: { width: 210, aspectRatio: 16 / 9 },
  posterImg: { width: 110, aspectRatio: 2 / 3 },
  focus: { borderColor: "#fff", transform: [{ scale: 1.06 }] },
  track: { position: "absolute", left: 8, right: 8, bottom: 8, height: 3, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.3)" },
  fill: { height: 3, borderRadius: 2, backgroundColor: C.red },
  lbl: { marginTop: 8 },
});
