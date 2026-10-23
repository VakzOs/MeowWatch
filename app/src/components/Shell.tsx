import { Image } from "expo-image";
import { Link, usePathname, type Href } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { leaveProfile, useStore } from "../lib/store";
import { BrandMark } from "./BrandMark";
import { ProfileAvatar } from "./Profiles";
import { Icon, type IconName } from "./Icon";
import { C, font } from "./theme";

const NAV: { label: string; icon: IconName; href?: Href }[] = [
  { label: "Accueil", icon: "home", href: "/" },
  { label: "Découvrir", icon: "compass", href: "/decouvrir" },
  { label: "Bibliothèque", icon: "library", href: "/bibliotheque" },
  { label: "Calendrier", icon: "calendar", href: "/calendrier" },
  { label: "Addons", icon: "puzzle", href: "/addons" },
];

/** Mise en page C3 : barre latérale + contenu, sur le fond flouté du titre sélectionné.
 *  Montée une seule fois dans la mise en page racine (pas de flash entre les pages) ; `bare` pour le lecteur. */
export function Shell({ children, bare }: { children: ReactNode; bare?: boolean }) {
  const ambiance = useStore(s => s.ambiance);
  const profile = useStore(s => s.user?.profile);
  return (
    <View style={st.root}>
      {ambiance ? <Image source={ambiance} style={st.amb} blurRadius={48} contentFit="cover" transition={400} /> : null}
      <View style={st.scrim} pointerEvents="none" />
      <View style={[st.side, bare && { display: "none" }]}>
        <View style={st.brand}>
          <BrandMark size={32} />
          <Text style={font(700, 18)}>Meow Watch</Text>
        </View>
        {NAV.map(n => <NavItem key={n.label} {...n} />)}
        <View style={{ flex: 1 }} />
        <NavItem label="Réglages" icon="gear" href="/reglages" />
        {profile ? (
          <Pressable onPress={leaveProfile} accessibilityLabel="Changer de profil" style={({ hovered }: any) => [st.item, { marginTop: 8 }, hovered && st.itemHover]}>
            <ProfileAvatar p={profile} size={28} />
            <View style={{ flex: 1 }}>
              <Text style={font(600, 14)} numberOfLines={1}>{profile.name}</Text>
              <Text style={font(400, 12, C.faint)}>Changer de profil</Text>
            </View>
          </Pressable>
        ) : null}
      </View>
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  );
}

function NavItem({ label, icon, href }: { label: string; icon: IconName; href?: Href }) {
  const path = usePathname();
  const cur = !!href && path === href;
  const body = (hovered = false) => (
    <View style={[st.item, cur && st.itemCur, hovered && !cur && st.itemHover, !href && { opacity: 0.4 }]}>
      <Icon name={icon} color={cur ? C.red : cur || hovered ? C.ink : C.mute} />
      <Text style={font(500, 15, cur || hovered ? C.ink : C.mute)}>{label}</Text>
    </View>
  );
  if (!href) return <View accessibilityLabel={`${label} (bientôt)`}>{body()}</View>;
  return (
    <Link href={href} asChild>
      <Pressable accessibilityRole="link">{({ hovered }: any) => body(hovered)}</Pressable>
    </Link>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, flexDirection: "row", backgroundColor: "#08080A", overflow: "hidden" },
  amb: { ...StyleSheet.absoluteFill, opacity: 0.45, transform: [{ scale: 1.15 }] },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(8,8,10,0.45)" },
  side: { width: 220, paddingVertical: 20, paddingHorizontal: 12, gap: 4 },
  brand: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 10, paddingTop: 4, paddingBottom: 24 },
  item: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8 },
  itemCur: { backgroundColor: "rgba(255,255,255,0.08)" },
  itemHover: { backgroundColor: "rgba(255,255,255,0.05)" },
});
