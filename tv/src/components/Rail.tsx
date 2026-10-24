import { router, usePathname } from "expo-router";
import { StyleSheet, View } from "react-native";
import { Icon } from "../../../app/src/components/Icon";
import { C } from "../../../app/src/components/theme";
import { leaveProfile, useStore } from "../../../app/src/lib/store";
import { BrandMark } from "./BrandMark";
import { Focus } from "./Focus";
import { Avatar } from "./Profiles";

const ITEMS = [
  { path: "/recherche", icon: "search", label: "Recherche" },
  { path: "/", icon: "home", label: "Accueil" },
  { path: "/bibliotheque", icon: "library", label: "Bibliothèque" },
] as const;

/** Colonne d'icônes à gauche (maquette B), profil en bas pour en changer. */
export function Rail() {
  const path = usePathname();
  const profile = useStore(s => s.user?.profile);
  return (
    <View style={st.rail}>
      <View style={{ marginBottom: 22 }}><BrandMark size={30} /></View>
      {ITEMS.map(i => {
        const on = path === i.path;
        return (
          <Focus key={i.path} onPress={() => router.navigate(i.path)} style={[st.btn, on && st.on]} label={i.label}>
            {focused => <Icon name={i.icon} size={18} color={on ? C.red : focused ? C.ink : C.soft} />}
          </Focus>
        );
      })}
      <View style={{ flex: 1 }} />
      {profile ? <Focus onPress={leaveProfile} style={st.me} label={`Changer de profil (${profile.name})`}><Avatar p={profile} size={30} /></Focus> : null}
    </View>
  );
}

const st = StyleSheet.create({
  rail: { width: 64, paddingTop: 22, paddingBottom: 22, alignItems: "center", gap: 10, backgroundColor: "rgba(11,11,12,0.9)" },
  btn: { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "transparent" },
  on: { backgroundColor: "rgba(255,255,255,0.1)" },
  me: { borderRadius: 10, borderWidth: 2, borderColor: "transparent", padding: 1 },
});
