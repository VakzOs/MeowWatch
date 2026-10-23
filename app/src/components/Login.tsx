import { Image } from "expo-image";
import { useEffect, useState } from "react";
import { Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { CINEMETA, fetchManifest, fetchCatalog } from "../lib/addons";
import { LOGIN_ERRORS, loginUrl } from "../lib/api";
import { C, font } from "./theme";

const go = (url: string) => (Platform.OS === "web" ? window.location.assign(url) : Linking.openURL(url));

/** Écran de connexion : Discord, réservé à Vakz et à ses invités. */
export function Login({ error, invite }: { error?: string; invite?: { code: string; valid: boolean | null } }) {
  const [bg, setBg] = useState<string>();
  useEffect(() => {
    fetchManifest(CINEMETA).then(a => fetchCatalog(a, a.manifest.catalogs![0])).then(m => setBg(m[Math.floor(Math.random() * Math.min(m.length, 10))]?.background)).catch(() => {});
  }, []);
  const invalid = invite && invite.valid === false;
  return (
    <View style={st.root}>
      {bg ? <Image source={bg} style={st.amb} blurRadius={48} contentFit="cover" transition={600} /> : null}
      <View style={st.scrim} />
      <View style={st.card}>
        <Image source={require("../../assets/avatars/chat-rouge.png")} style={{ width: 72, height: 72, borderRadius: 16, marginBottom: 20 }} />
        <Text style={[font(700, 32), { marginBottom: 10 }]}>Meow Watch</Text>
        <Text style={[font(400, 16, C.soft), st.lead]}>
          {invite ? (invalid ? "Ce lien d'invitation a déjà servi ou a expiré. Demande-en un nouveau à Vakz." : "Tu es invité sur Meow Watch. Connecte-toi avec Discord pour accepter l'invitation.")
            : "Tes films et séries, avec tes addons Stremio. Réservé à Vakz et à ses invités."}
        </Text>
        {error && LOGIN_ERRORS[error] ? <Text style={[font(500, 14, "#FF8A94"), st.lead]}>{LOGIN_ERRORS[error]}</Text> : null}
        {!invalid ? (
          <Pressable onPress={() => go(loginUrl(invite?.code))} disabled={invite?.valid === null} style={({ hovered }: any) => [st.btn, hovered && { opacity: 0.9 }]}>
            <Text style={font(700, 16)}>{invite ? "Accepter avec Discord" : "Se connecter avec Discord"}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#08080A", overflow: "hidden", padding: 16 },
  amb: { ...StyleSheet.absoluteFill, opacity: 0.55, transform: [{ scale: 1.15 }] },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(8,8,10,0.45)" },
  card: { width: "100%", maxWidth: 440, alignItems: "center", padding: 40, borderRadius: 16, backgroundColor: "rgba(8,8,10,0.72)" },
  lead: { textAlign: "center", lineHeight: 23, marginBottom: 24 },
  btn: { alignSelf: "stretch", height: 52, borderRadius: 10, backgroundColor: C.red, alignItems: "center", justifyContent: "center" },
});
