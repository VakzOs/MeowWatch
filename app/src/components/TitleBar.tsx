import { router, usePathname } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import { installUpdate, onUpdate, win } from "../lib/desktop";
import { setQuery, useStore } from "../lib/store";
import { Icon } from "./Icon";
import { C, font } from "./theme";

/** Zone par laquelle on déplace la fenêtre (Tauri : seul l'élément cliqué compte, pas ses enfants). */
export const drag = { dataSet: { tauriDragRegion: "" } } as any;

/** Appli Windows, maquette A « bande fondue » : flèches et recherche en haut du contenu, les 3 boutons de Windows 11 à
 *  droite, notification de mise à jour. Sur les pages sans barre latérale (titre, lecteur) : les boutons seuls. */
export function TitleBar({ bare }: { bare?: boolean }) {
  const query = useStore(s => s.query);
  const path = usePathname();
  const input = useRef<any>(null); // TextInput (focus avec Ctrl+K)
  const [update, setUpdate] = useState<string | null>(null);
  const [later, setLater] = useState(false);
  useEffect(() => onUpdate(setUpdate), []);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); input.current?.focus(); } };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);
  const type = (q: string) => { setQuery(q); if (path !== "/") router.navigate("/"); };

  return (
    <>
      {bare ? <View style={st.dragBare} {...drag} /> : (
        <View style={st.strip} {...drag}>
          <Arrow d="M15 5l-7 7 7 7" label="Précédent" onPress={() => history.back()} />
          <Arrow d="M9 5l7 7-7 7" label="Suivant" onPress={() => history.forward()} />
          <View style={st.search}>
            <Icon name="search" size={16} color={C.faint} />
            <TextInput ref={input} value={query} onChangeText={type} placeholder="Rechercher un film, une série, un animé" placeholderTextColor={C.faint} style={[font(400, 14), st.input]} accessibilityLabel="Rechercher" />
            {query ? <Pressable onPress={() => setQuery("")} accessibilityLabel="Effacer"><Icon name="close" size={14} color={C.mute} /></Pressable> : <Text style={st.kbd}>Ctrl K</Text>}
          </View>
        </View>
      )}
      <View style={st.caption} {...({ dataSet: { mwCaption: "" } } as any)}>{/* l'appli n'ajoute pas ses boutons de secours */}
        <Caption label="Réduire" onPress={win.minimize}><Path d="M0 5.5h10" stroke="currentColor" /></Caption>
        <Caption label="Agrandir" onPress={win.toggleMaximize}><Rect x={0.5} y={0.5} width={9} height={9} rx={1.5} fill="none" stroke="currentColor" /></Caption>
        <Caption label="Fermer" close onPress={win.close}><Path d="M0 0l10 10M10 0L0 10" stroke="currentColor" /></Caption>
      </View>
      {update && !later && !bare ? (
        <View style={st.toast}>
          <Text style={font(700, 14)}>Mise à jour {update} prête</Text>
          <Text style={[font(400, 12.5, C.mute), { marginTop: 2, marginBottom: 10, lineHeight: 17 }]}>Téléchargée en arrière-plan. Elle s'applique au redémarrage, sans réinstaller.</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Pressable onPress={installUpdate} style={({ hovered }: any) => [st.restart, hovered && { opacity: 0.9 }]}><Text style={font(700, 13)}>Redémarrer</Text></Pressable>
            <Pressable onPress={() => setLater(true)}><Text style={font(500, 13, C.mute)}>Plus tard</Text></Pressable>
          </View>
        </View>
      ) : null}
    </>
  );
}

function Arrow({ d, label, onPress }: { d: string; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityLabel={label} style={({ hovered }: any) => [st.arrow, hovered && { backgroundColor: "rgba(255,255,255,0.08)" }]}>
      <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={C.soft} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><Path d={d} /></Svg>
    </Pressable>
  );
}

function Caption({ label, onPress, close, children }: { label: string; onPress: () => void; close?: boolean; children: React.ReactNode }) {
  return (
    <Pressable onPress={onPress} accessibilityLabel={label} style={({ hovered }: any) => [st.btn, hovered && { backgroundColor: close ? "#C42B1C" : "rgba(255,255,255,0.08)" }]}>
      <Svg width={10} height={10} viewBox="0 0 10 10" color="#E8E8E8">{children}</Svg>
    </Pressable>
  );
}

const st = StyleSheet.create({
  strip: { position: "absolute", top: 0, left: 220, right: 0, height: 48, flexDirection: "row", alignItems: "center", gap: 4, paddingLeft: 20, paddingRight: 150, zIndex: 20 },
  dragBare: { position: "absolute", top: 0, left: 140, right: 150, height: 30, zIndex: 20 },
  arrow: { width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  search: { flexDirection: "row", alignItems: "center", gap: 10, width: 460, height: 34, marginHorizontal: "auto", paddingHorizontal: 12, borderRadius: 9, backgroundColor: "rgba(255,255,255,0.08)" } as any,
  input: { flex: 1, height: 34, outlineStyle: "none" } as any,
  kbd: { ...font(600, 11, C.faint), borderWidth: 1, borderColor: "rgba(255,255,255,0.14)", borderRadius: 5, paddingHorizontal: 6, paddingVertical: 1 },
  caption: { position: "absolute", top: 0, right: 0, flexDirection: "row", zIndex: 30 },
  btn: { width: 46, height: 32, alignItems: "center", justifyContent: "center" },
  toast: { position: "absolute", left: 12, bottom: 78, width: 196, padding: 12, borderRadius: 12, backgroundColor: "rgba(28,28,31,0.97)", boxShadow: "0 12px 30px rgba(0,0,0,0.5)", zIndex: 25 } as any,
  restart: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, backgroundColor: C.red },
});
