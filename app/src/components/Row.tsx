import { Image } from "expo-image";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { Meta } from "../lib/addons";
import { setAmbiance } from "../lib/store";
import { Icon } from "./Icon";

/** Clic sur une vignette : page du titre. Survol : le fond flouté prend son image. */
export const openTitle = (m: Meta, season?: number) => router.push({ pathname: "/title/[type]/[id]", params: { type: m.type, id: m.id, name: m.name, poster: m.poster ?? "", ...(season !== undefined && { season: String(season) }) } });
export const hoverTitle = (m: Meta) => setAmbiance(m.background ?? m.poster);
import { C, font } from "./theme";

// Titres par rangée (Vakz) : 10 grandes vignettes (Reprendre), 20 affiches ; Découvrir montre tout.
const MAX_WIDE = 10, MAX = 20;

export type Item = { meta: Meta; wide?: boolean; progress?: number; sub?: string };

/** Une rangée qui charge ses éléments elle-même ; elle disparaît si elle est vide ou en erreur. */
export function Row({ title, note, load, selected, onSelect, onHover, onRemove }: {
  title: string; note?: string; load: () => Promise<Item[]>; selected?: string; onSelect: (m: Meta) => void; onHover?: (m: Meta) => void;
  /** Croix sur chaque tuile (retirer de « Reprendre »…). */ onRemove?: (m: Meta) => void;
}) {
  const [items, setItems] = useState<Item[] | null>(null);
  useEffect(() => { let on = true; load().then(i => on && setItems(i), () => on && setItems([])); return () => { on = false; }; }, [load]);
  const scroll = useWheelScroll();
  if (items && !items.length) return null;
  return (
    <View style={{ marginTop: 24 }}>
      <View style={st.head}>
        <Text style={font(600, 18)}>{title}</Text>
        {note ? <Text style={font(500, 13, C.faint)}>{note}</Text> : null}
      </View>
      <ScrollView ref={scroll} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.scroll}>
        {items ? items.slice(0, items[0]?.wide ? MAX_WIDE : MAX).map(i => <Card key={i.meta.id} item={i} selected={selected === i.meta.id} onPress={() => onSelect(i.meta)} onHover={() => onHover?.(i.meta)} onRemove={onRemove && (() => onRemove(i.meta))} />)
          : Array.from({ length: 6 }, (_, k) => <View key={k} style={[st.poster, st.ghost]} />)}
      </ScrollView>
    </View>
  );
}

/** Web : la molette fait avancer la rangée d'une tuile par cran (tuiles entières, alignées à gauche). Au bout, la page
 *  ne reprend qu'après une pause (pas d'élan qui file vers le bas). Les bords qui cachent des affiches se fondent. */
function useWheelScroll() {
  const ref = useRef<any>(null); // ScrollView de react-native-web (getScrollableNode)
  useEffect(() => {
    const el = ref.current?.getScrollableNode?.() as HTMLElement | undefined;
    if (Platform.OS !== "web" || !el) return;
    const fade = () => {
      const l = el.scrollLeft > 4 ? 80 : 0, r = el.scrollLeft < el.scrollWidth - el.clientWidth - 4 ? 80 : 0;
      el.style.maskImage = el.style.webkitMaskImage = l || r ? `linear-gradient(to right, transparent 0, #000 ${l}px, #000 calc(100% - ${r}px), transparent 100%)` : "";
    };
    let last = 0, target = 0; // dernier coup de molette pris par la rangée, et tuile visée
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return; // pavé tactile : défilement de côté déjà natif
      const max = el.scrollWidth - el.clientWidth, now = Date.now();
      const atEdge = (e.deltaY < 0 && el.scrollLeft <= 0) || (e.deltaY > 0 && el.scrollLeft >= max - 1);
      if (atEdge && now - last > 400) return; // nouveau geste au bout : la page défile
      e.preventDefault();
      if (atEdge) { last = now; return; }
      const first = el.firstElementChild?.firstElementChild as HTMLElement | undefined;
      const step = (first?.offsetWidth ?? 158) + 14; // largeur d'une tuile + écart
      const from = now - last < 400 ? target : el.scrollLeft; // crans rapprochés : on part de la tuile déjà visée
      last = now;
      target = Math.max(0, Math.min(max, (Math.round(from / step) + Math.sign(e.deltaY)) * step));
      el.scrollBy({ left: target - el.scrollLeft, behavior: "smooth" }); // scrollTo de l'élément est remplacé par react-native-web ({ x, y })
    };
    fade();
    el.addEventListener("scroll", fade, { passive: true });
    el.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("resize", fade);
    return () => { el.removeEventListener("scroll", fade); el.removeEventListener("wheel", onWheel); window.removeEventListener("resize", fade); };
  });
  return ref;
}

export function Card({ item: { meta, wide, progress, sub }, selected, onPress, onHover, onRemove, width }: { item: Item; selected: boolean; onPress: () => void; onHover: () => void; onRemove?: () => void; width?: number }) {
  const w = width ?? (wide ? 300 : 158);
  const card = (
    <Pressable onPress={onPress} onFocus={onHover} onHoverIn={onHover} accessibilityLabel={meta.name} style={({ hovered, focused }: any) => [{ width: w }, (focused) && { transform: [{ scale: 1.04 }] }, hovered && !selected && { opacity: 0.9 }]}>
      {({ hovered, focused }: any) => (
        <>
          <Image source={wide ? meta.background ?? meta.poster : meta.poster} style={[wide ? st.wide : st.poster, { width: w }, (selected || hovered || focused) && st.ring]} contentFit="cover" transition={200} recyclingKey={meta.id} />
          {progress !== undefined ? <View style={st.track}><View style={[st.fill, { width: `${Math.round(progress * 100)}%` }]} /></View> : null}
          <Text style={[font(600, 14), { marginTop: 8 }]} numberOfLines={1}>{meta.name}</Text>
          <Text style={font(400, 13, C.faint)} numberOfLines={1}>{sub ?? [meta.releaseInfo, meta.imdbRating && `IMDb ${meta.imdbRating}`].filter(Boolean).join(" · ")}</Text>
        </>
      )}
    </Pressable>
  );
  if (!onRemove) return card;
  // Croix à côté de la tuile (pas dedans : un bouton dans un bouton ne reçoit pas toujours le clic sur le web).
  return (
    <View>
      {card}
      <Pressable onPress={onRemove} accessibilityLabel={`Retirer ${meta.name} de l'historique`} style={({ hovered }: any) => [st.remove, hovered && { backgroundColor: "rgba(0,0,0,0.85)" }]}>
        <Icon name="close" size={16} color={C.ink} />
      </Pressable>
    </View>
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
  remove: { position: "absolute", top: 8, right: 8, width: 30, height: 30, borderRadius: 15, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center" },
});
