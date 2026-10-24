import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { C, font } from "../components/theme";
import { api } from "../lib/api";

/** Code tel qu'on le lit à la télé : 6 caractères, sans 0/O ni 1/I. */
const clean = (s: string) => s.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, "").slice(0, 6);
const pretty = (s: string) => (s.length > 3 ? `${s.slice(0, 3)}-${s.slice(3)}` : s);

/** /tv (ou /tv?code=… depuis le QR code) : valide la connexion d'une télé avec le compte ouvert ici. */
export default function Tv() {
  const params = useLocalSearchParams<{ code?: string }>();
  const [code, setCode] = useState(clean(params.code ?? ""));
  const [state, setState] = useState<"idle" | "busy" | "ok">("idle");
  const [error, setError] = useState("");
  const send = async () => {
    setState("busy"); setError("");
    try { await api("/api/tv/approve", { method: "POST", body: JSON.stringify({ code }) }); setState("ok"); }
    catch (e) { setError((e as Error).message); setState("idle"); }
  };
  return (
    <View style={st.page}>
      <View style={st.card}>
        <Text style={font(700, 28)}>Connecter une télé</Text>
        {state === "ok" ? (
          <>
            <Text style={[font(400, 16, C.soft), st.p]}>C'est fait : ta télé est connectée à ton compte. Elle te propose maintenant de choisir un profil.</Text>
            <Pressable onPress={() => router.replace("/")} style={({ hovered }: any) => [st.btn, { backgroundColor: "rgba(255,255,255,0.1)" }, hovered && { opacity: 0.9 }]}><Text style={font(700, 16)}>Retour à l'accueil</Text></Pressable>
          </>
        ) : (
          <>
            <Text style={[font(400, 16, C.mute), st.p]}>Saisis le code affiché sur la télé (ou scanne son QR code). Elle sera connectée à ton compte Discord, avec tes profils.</Text>
            <TextInput value={pretty(code)} onChangeText={v => setCode(clean(v))} onSubmitEditing={() => code.length === 6 && send()} placeholder="ABC-123" placeholderTextColor={C.faint}
              autoCapitalize="characters" autoCorrect={false} autoFocus={!params.code} accessibilityLabel="Code de la télé" style={[font(700, 34), st.input]} />
            {error ? <Text style={[font(500, 14, "#FF8A94"), { marginTop: 10 }]}>{error}</Text> : null}
            <Pressable onPress={send} disabled={code.length !== 6 || state === "busy"} style={({ hovered }: any) => [st.btn, code.length !== 6 && { opacity: 0.5 }, hovered && code.length === 6 && { opacity: 0.9 }]}>
              {state === "busy" ? <ActivityIndicator color={C.ink} /> : <Text style={font(700, 16)}>Connecter la télé</Text>}
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  page: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  card: { width: "100%", maxWidth: 460, padding: 28, borderRadius: 18, backgroundColor: "rgba(20,20,23,0.92)" },
  p: { marginTop: 8, marginBottom: 22, lineHeight: 23 },
  input: { height: 72, borderRadius: 12, textAlign: "center", letterSpacing: 6, backgroundColor: "rgba(255,255,255,0.08)", outlineStyle: "none" } as any,
  btn: { height: 50, marginTop: 18, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: C.red },
});
