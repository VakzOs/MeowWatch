import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import { api, type Profile } from "../lib/api";
import { logout, selectProfile } from "../lib/store";
import { C, font } from "./theme";

type List = { profiles: Profile[]; max: number; colors: string[] };

export function ProfileAvatar({ p, size = 120 }: { p: Pick<Profile, "name" | "color">; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.16, backgroundColor: p.color, alignItems: "center", justifyContent: "center" }}>
      <Text style={font(700, size * 0.42)}>{p.name[0]?.toUpperCase()}</Text>
    </View>
  );
}

export const Lock = ({ size = 16, color = C.mute }: { size?: number; color?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <Rect x="5" y="11" width="14" height="10" rx="2" /><Path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </Svg>
);

/** « Qui regarde ? » : choix du profil, code PIN, ajout d'un profil. */
export function ProfilePicker() {
  const [list, setList] = useState<List | null>(null);
  const [asking, setAsking] = useState<Profile | null>(null);
  const [adding, setAdding] = useState(false);
  const refresh = useCallback(() => api<List>("/api/profiles").then(setList), []);
  useEffect(() => { refresh(); }, [refresh]);

  if (asking) return <PinPad title={asking.name} onCancel={() => setAsking(null)} onPin={pin => selectProfile(asking.id, pin)} />;
  if (adding && list) return <NewProfile colors={list.colors} onDone={() => { setAdding(false); refresh(); }} />;
  return (
    <View style={st.root}>
      <Text style={[font(700, 34), { marginBottom: 40 }]}>Qui regarde ?</Text>
      {!list ? <ActivityIndicator color={C.red} /> : (
        <View style={st.grid}>
          {list.profiles.map(p => (
            <Tile key={p.id} label={p.name} lock={p.locked} onPress={() => (p.locked ? setAsking(p) : selectProfile(p.id))}>
              <ProfileAvatar p={p} />
            </Tile>
          ))}
          {list.profiles.length < list.max ? (
            <Tile label="Ajouter" onPress={() => setAdding(true)}>
              <View style={st.add}><Text style={font(400, 56, C.mute)}>+</Text></View>
            </Tile>
          ) : null}
        </View>
      )}
      <Pressable onPress={logout} style={{ marginTop: 56 }}><Text style={font(500, 14, C.faint)}>Se déconnecter</Text></Pressable>
    </View>
  );
}

function Tile({ label, lock, onPress, children }: { label: string; lock?: boolean; onPress: () => void; children: React.ReactNode }) {
  return (
    <Pressable onPress={onPress} accessibilityLabel={label} style={({ hovered, focused }: any) => [st.tile, (hovered || focused) && { transform: [{ scale: 1.06 }] }]}>
      {({ hovered, focused }: any) => (
        <>
          <View style={[st.ring, (hovered || focused) && { borderColor: C.ink }]}>{children}</View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12 }}>
            <Text style={font(600, 16, hovered || focused ? C.ink : C.soft)} numberOfLines={1}>{label}</Text>
            {lock ? <Lock /> : null}
          </View>
        </>
      )}
    </Pressable>
  );
}

/** Pavé à 4 chiffres, utilisable au clavier, à la souris et plus tard à la télécommande. */
export function PinPad({ title, hint = "Entre le code du profil", onPin, onCancel }: { title: string; hint?: string; onPin: (pin: string) => Promise<unknown>; onCancel: () => void }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string>();
  const press = (k: string) => { setError(undefined); setPin(p => (k === "⌫" ? p.slice(0, -1) : p.length < 4 ? p + k : p)); };
  useEffect(() => {
    if (pin.length !== 4) return;
    onPin(pin).catch((e: Error) => { setError(e.message); setPin(""); });
  }, [pin]);
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const h = (e: KeyboardEvent) => (/^\d$/.test(e.key) ? press(e.key) : e.key === "Backspace" ? press("⌫") : e.key === "Escape" && onCancel());
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, []);
  return (
    <View style={st.root}>
      <Text style={[font(700, 28), { marginBottom: 8 }]}>{title}</Text>
      <Text style={[font(400, 15, error ? "#FF8A94" : C.mute), { marginBottom: 28 }]}>{error ?? hint}</Text>
      <View style={{ flexDirection: "row", gap: 14, marginBottom: 32 }}>
        {[0, 1, 2, 3].map(i => <View key={i} style={[st.dot, i < pin.length && { backgroundColor: C.ink, borderColor: C.ink }]} />)}
      </View>
      <View style={st.pad}>
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].map((k, i) => k ? (
          <Pressable key={i} onPress={() => press(k)} accessibilityLabel={k === "⌫" ? "Effacer" : k} style={({ hovered, focused }: any) => [st.key, (hovered || focused) && { backgroundColor: "rgba(255,255,255,0.16)" }]}>
            <Text style={font(600, 24)}>{k}</Text>
          </Pressable>
        ) : <View key={i} style={st.keyGhost} />)}
      </View>
      <Pressable onPress={onCancel} style={{ marginTop: 28 }}><Text style={font(500, 15, C.mute)}>Annuler</Text></Pressable>
    </View>
  );
}

function NewProfile({ colors, onDone }: { colors: string[]; onDone: () => void }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(colors[1] ?? colors[0]);
  const [withPin, setWithPin] = useState(false);
  const [error, setError] = useState<string>();
  const create = (pin?: string) => api("/api/profiles", { method: "POST", body: JSON.stringify({ name, color, pin }) }).then(onDone);
  if (withPin) return <PinPad title={name} hint="Choisis un code à 4 chiffres" onPin={create} onCancel={() => setWithPin(false)} />;
  return (
    <View style={st.root}>
      <Text style={[font(700, 28), { marginBottom: 28 }]}>Nouveau profil</Text>
      <ProfileAvatar p={{ name: name || "?", color }} />
      <TextInput value={name} onChangeText={setName} placeholder="Nom" placeholderTextColor={C.faint} maxLength={20} autoFocus style={[font(500, 17), st.input]} accessibilityLabel="Nom du profil" />
      <View style={{ flexDirection: "row", gap: 12, marginBottom: 28 }}>
        {colors.map(c => <Pressable key={c} onPress={() => setColor(c)} accessibilityLabel={`Couleur ${c}`} style={[st.swatch, { backgroundColor: c }, c === color && { borderColor: C.ink }]} />)}
      </View>
      {error ? <Text style={[font(500, 14, "#FF8A94"), { marginBottom: 12 }]}>{error}</Text> : null}
      <View style={{ flexDirection: "row", gap: 12 }}>
        <Pressable onPress={onDone} style={[st.btn, st.ghost]}><Text style={font(600, 15)}>Annuler</Text></Pressable>
        <Pressable onPress={() => name.trim() ? (setError(undefined), setWithPin(true)) : setError("Donne un nom au profil.")} style={[st.btn, st.ghost, { flexDirection: "row", gap: 8 }]}><Lock color={C.ink} /><Text style={font(600, 15)}>Avec un code</Text></Pressable>
        <Pressable onPress={() => name.trim() ? create().catch((e: Error) => setError(e.message)) : setError("Donne un nom au profil.")} style={[st.btn, { backgroundColor: C.red }]}><Text style={font(700, 15)}>Créer</Text></Pressable>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#0B0B0C", padding: 24 },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 32, maxWidth: 900 },
  tile: { width: 132, alignItems: "center" },
  ring: { borderRadius: 24, borderWidth: 3, borderColor: "transparent", padding: 3 },
  add: { width: 120, height: 120, borderRadius: 19, backgroundColor: "rgba(255,255,255,0.06)", alignItems: "center", justifyContent: "center" },
  dot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: C.mute },
  pad: { width: 3 * 76 + 2 * 14, flexDirection: "row", flexWrap: "wrap", gap: 14 },
  key: { width: 76, height: 64, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" },
  keyGhost: { width: 76, height: 64 },
  input: { width: 320, height: 50, marginTop: 24, marginBottom: 20, paddingHorizontal: 16, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.08)", textAlign: "center", outlineStyle: "none" } as any,
  swatch: { width: 36, height: 36, borderRadius: 18, borderWidth: 3, borderColor: "transparent" },
  btn: { height: 46, paddingHorizontal: 20, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  ghost: { backgroundColor: "rgba(255,255,255,0.1)" },
});
