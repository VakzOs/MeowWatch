import { Image } from "expo-image";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { avatarSrc } from "../../../app/src/components/avatars";
import { C, font } from "../../../app/src/components/theme";
import { api, type Profile } from "../../../app/src/lib/api";
import { selectProfile } from "../../../app/src/lib/store";
import { signOut } from "../lib/session";
import { Focus } from "./Focus";

export function Avatar({ p, size }: { p: Pick<Profile, "name" | "color" | "avatar">; size: number }) {
  const src = avatarSrc(p.avatar);
  return src ? <Image source={src} style={{ width: size, height: size, borderRadius: size * 0.2 }} contentFit="cover" /> : (
    <View style={{ width: size, height: size, borderRadius: size * 0.2, backgroundColor: p.color, alignItems: "center", justifyContent: "center" }}>
      <Text style={font(700, size * 0.42)}>{p.name[0]?.toUpperCase()}</Text>
    </View>
  );
}

/** « Qui regarde ? » à la télécommande ; code à 4 chiffres pour un profil verrouillé. */
export function ProfilePicker() {
  const [list, setList] = useState<Profile[] | null>(null);
  const [asking, setAsking] = useState<Profile | null>(null);
  useEffect(() => { api<{ profiles: Profile[] }>("/api/profiles").then(r => setList(r.profiles), () => setList([])); }, []);
  if (asking) return <PinPad p={asking} onCancel={() => setAsking(null)} />;
  return (
    <View style={st.page}>
      <Text style={[font(700, 30), { marginBottom: 36 }]}>Qui regarde ?</Text>
      {!list ? <ActivityIndicator color={C.ink} /> : (
        <View style={st.grid}>
          {list.map((p, i) => (
            <Focus key={p.id} preferred={i === 0} onPress={() => (p.locked ? setAsking(p) : selectProfile(p.id).catch(() => {}))} style={st.face} label={p.name}>
              {focused => (
                <>
                  <View style={[st.ring, focused && { borderColor: "#fff" }]}><Avatar p={p} size={96} /></View>
                  <Text style={[font(600, 15, focused ? C.ink : C.mute), { marginTop: 10 }]}>{p.name}{p.locked ? " · verrouillé" : ""}</Text>
                </>
              )}
            </Focus>
          ))}
        </View>
      )}
      <Focus onPress={signOut} style={st.out}><Text style={font(500, 13, C.mute)}>Déconnecter cette télé</Text></Focus>
    </View>
  );
}

function PinPad({ p, onCancel }: { p: Profile; onCancel: () => void }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const type = async (d: string) => {
    const next = (pin + d).slice(0, 4);
    setPin(next); setError("");
    if (next.length === 4) await selectProfile(p.id, next).catch(e => { setError((e as Error).message); setPin(""); });
  };
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];
  return (
    <View style={st.page}>
      <Avatar p={p} size={72} />
      <Text style={[font(600, 18), { marginTop: 12 }]}>Code de {p.name}</Text>
      <View style={{ flexDirection: "row", gap: 12, marginVertical: 18 }}>{[0, 1, 2, 3].map(i => <View key={i} style={[st.dot, i < pin.length && { backgroundColor: C.ink }]} />)}</View>
      <Text style={[font(500, 13, "#FF8A94"), { minHeight: 18 }]}>{error}</Text>
      <View style={st.pad}>
        {keys.map((k, i) => (k ? (
          <Focus key={i} preferred={k === "1"} onPress={() => (k === "⌫" ? setPin(pin.slice(0, -1)) : type(k))} style={st.key} label={k === "⌫" ? "Effacer" : k}><Text style={font(600, 22)}>{k}</Text></Focus>
        ) : <View key={i} style={st.keyEmpty} />))}
      </View>
      <Focus onPress={onCancel} style={st.out}><Text style={font(500, 13, C.mute)}>Retour</Text></Focus>
    </View>
  );
}

const st = StyleSheet.create({
  page: { flex: 1, backgroundColor: C.chrome, alignItems: "center", justifyContent: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 28, maxWidth: 820 },
  face: { alignItems: "center", borderWidth: 0 },
  ring: { borderWidth: 3, borderColor: "transparent", borderRadius: 24, padding: 3 },
  out: { marginTop: 36, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10, borderWidth: 2, borderColor: "transparent" },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: C.ink },
  pad: { flexDirection: "row", flexWrap: "wrap", width: 3 * 72 + 2 * 12, gap: 12 },
  key: { width: 72, height: 52, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 2, borderColor: "transparent" },
  keyEmpty: { width: 72, height: 52 },
});
