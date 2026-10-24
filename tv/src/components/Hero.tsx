import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, Text, View } from "react-native";
import { C, font } from "../../../app/src/components/theme";
import type { Meta } from "../../../app/src/lib/addons";

/** Grand visuel du titre sélectionné (fond, nom, infos, résumé), sous le contenu de la page. */
export function Backdrop({ meta }: { meta?: Meta | null }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {meta?.background ? <Image source={meta.background} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="top" transition={300} /> : null}
      <LinearGradient colors={["rgba(11,11,12,0.96)", "rgba(11,11,12,0.7)", "rgba(11,11,12,0)"]} locations={[0, 0.4, 0.75]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
      <LinearGradient colors={["rgba(11,11,12,0)", "rgba(11,11,12,0.9)", C.chrome]} locations={[0.3, 0.6, 0.8]} style={StyleSheet.absoluteFill} />
    </View>
  );
}

export function HeroText({ meta, sub }: { meta?: Meta | null; sub?: string }) {
  if (!meta) return <View style={{ height: 150 }} />;
  const facts = [sub, meta.releaseInfo, meta.imdbRating ? `${meta.imdbRating} IMDb` : ""].filter(Boolean);
  return (
    <View style={{ height: 150, maxWidth: 460 }}>
      <Text style={font(700, 38)} numberOfLines={1}>{meta.name}</Text>
      <Text style={[font(600, 12, C.soft), { marginTop: 8 }]}>{facts.join("   ·   ")}</Text>
      {meta.description ? <Text style={[font(400, 12, C.soft), { marginTop: 10, lineHeight: 18 }]} numberOfLines={2}>{meta.description}</Text> : null}
    </View>
  );
}
