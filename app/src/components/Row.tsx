import { Image } from "expo-image";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { Meta } from "../lib/addons";
import { C, font } from "./theme";

export type Item = { meta: Meta; wide?: boolean; progress?: number; sub?: string };

/** Une rangée qui charge ses éléments elle-même ; elle disparaît si elle est vide ou en erreur. */
export function Row({ title, note, load, selected, onSelect }: {
  title: string; note?: string; load: () => Promise<Item[]>; selected?: string; onSelect: (m: Meta) => void;
}) {
  const [items, setItems] = useState<Item[] | null>(null);
  useEffect(() => { let on = true; load().then(i => on && setItems(i), () => on && setItems([])); return () => { on = false; }; }, [load]);
  if (items && !items.length) return null;
  return (
    <View style={{ marginTop: 24 }}>
      <View style={st.head}>
        <Text style={font(600, 18)}>{title}</Text>
        {note ? <Text style={font(500, 13, C.faint)}>{note}</Text> : null}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.scroll}>
        {items ? items.map(i => <Card key={i.meta.id} item={i} selected={selected === i.meta.id} onPress={() => onSelect(i.meta)} />)
          : Array.from({ length: 6 }, (_, k) => <View key={k} style={[st.poster, st.ghost]} />)}
      </ScrollView>
    </View>
  );
}

function Card({ item: { meta, wide, progress, sub }, selected, onPress }: { item: Item; selected: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} onFocus={onPress} accessibilityLabel={meta.name} style={({ hovered, focused }: any) => [{ width: wide ? 300 : 158 }, (focused) && { transform: [{ scale: 1.04 }] }, hovered && !selected && { opacity: 0.9 }]}>
      {({ hovered, focused }: any) => (
        <>
          <Image source={wide ? meta.background ?? meta.poster : meta.poster} style={[wide ? st.wide : st.poster, (selected || hovered || focused) && st.ring]} contentFit="cover" transition={200} recyclingKey={meta.id} />
          {progress !== undefined ? <View style={st.track}><View style={[st.fill, { width: `${Math.round(progress * 100)}%` }]} /></View> : null}
          <Text style={[font(600, 14), { marginTop: 8 }]} numberOfLines={1}>{meta.name}</Text>
          <Text style={font(400, 13, C.faint)} numberOfLines={1}>{sub ?? [meta.releaseInfo, meta.imdbRating && `IMDb ${meta.imdbRating}`].filter(Boolean).join(" · ")}</Text>
        </>
      )}
    </Pressable>
  );
}

const st = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "baseline", gap: 10, paddingHorizontal: 32 },
  scroll: { gap: 14, paddingHorizontal: 32, paddingTop: 12, paddingBottom: 8 },
  poster: { width: 158, aspectRatio: 2 / 3, borderRadius: 10, backgroundColor: C.raised },
  wide: { width: 300, aspectRatio: 16 / 9, borderRadius: 10, backgroundColor: C.raised },
  ghost: { opacity: 0.6 },
  ring: { borderWidth: 3, borderColor: C.red },
  track: { height: 4, borderRadius: 2, backgroundColor: "#333", marginTop: 8, overflow: "hidden" },
  fill: { height: 4, backgroundColor: C.red },
});
