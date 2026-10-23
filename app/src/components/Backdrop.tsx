import { Image } from "expo-image";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { CINEMETA, fetchCatalog, fetchManifest } from "../lib/addons";

let cached: string | undefined;

/** Fond des écrans d'accueil (connexion, profils) : une image du moment, très floutée. */
export function Backdrop() {
  const [bg, setBg] = useState(cached);
  useEffect(() => {
    if (cached) return;
    fetchManifest(CINEMETA).then(a => fetchCatalog(a, a.manifest.catalogs![0]))
      .then(m => setBg(cached = m[Math.floor(Math.random() * Math.min(m.length, 10))]?.background)).catch(() => {});
  }, []);
  return (
    <>
      {bg ? <Image source={bg} style={st.amb} blurRadius={48} contentFit="cover" transition={600} /> : null}
      <View style={st.scrim} pointerEvents="none" />
    </>
  );
}

const st = StyleSheet.create({
  amb: { ...StyleSheet.absoluteFill, opacity: 0.55, transform: [{ scale: 1.15 }] },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(8,8,10,0.5)" },
});
