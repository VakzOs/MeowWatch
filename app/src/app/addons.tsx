import { Image } from "expo-image";
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Icon } from "../components/Icon";
import { C, font, TYPE_FR } from "../components/theme";
import type { Addon } from "../lib/addons";
import { addAddon, moveAddon, removeAddon, useStore } from "../lib/store";

export default function Addons() {
  const addons = useStore(s => s.addons);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const add = async () => {
    if (!url.trim() || busy) return;
    setBusy(true); setMsg(null);
    try { const a = await addAddon(url); setUrl(""); setMsg({ ok: true, text: `${a.manifest.name} est installé.` }); }
    catch (e: any) { setMsg({ ok: false, text: /fetch|network|Failed/i.test(e?.message) ? "Impossible de joindre ce lien. Vérifie l'adresse de l'addon." : e?.message ?? "Erreur inconnue." }); }
    setBusy(false);
  };

  return (
    <>
      <ScrollView contentContainerStyle={{ padding: 32, paddingBottom: 80, maxWidth: 880 }}>
        <Text style={[font(700, 28), { marginBottom: 6 }]}>Addons</Text>
        <Text style={[font(400, 15, C.mute), { marginBottom: 24 }]}>Les mêmes addons que Stremio. Colle le lien d'installation (celui qui finit par manifest.json, ou stremio://).</Text>

        <View style={st.add}>
          <TextInput value={url} onChangeText={setUrl} onSubmitEditing={add} placeholder="https://…/manifest.json" placeholderTextColor={C.faint} autoCapitalize="none" autoCorrect={false} style={[font(400, 15), st.input]} accessibilityLabel="Lien de l'addon" />
          <Pressable onPress={add} disabled={busy} style={({ hovered }: any) => [st.btn, hovered && { opacity: 0.9 }]}>
            {busy ? <ActivityIndicator color={C.ink} /> : <Text style={font(700, 15)}>Installer</Text>}
          </Pressable>
        </View>
        {msg ? <Text style={[font(500, 14, msg.ok ? C.soft : "#FF8A94"), { marginTop: 10 }]}>{msg.text}</Text> : null}

        <View style={st.h}>
          <Text style={font(600, 18)}>Installés</Text>
          <Text style={font(500, 13, C.faint)}>l'ordre décide quel addon répond en premier</Text>
        </View>
        {addons.map((a, i) => <AddonRow key={a.url} a={a} first={i === 0} last={i === addons.length - 1} />)}
      </ScrollView>
    </>
  );
}

function AddonRow({ a, first, last }: { a: Addon; first: boolean; last: boolean }) {
  const m = a.manifest;
  const res = (m.resources ?? []).map(r => (typeof r === "string" ? r : r.name));
  const what = [res.includes("catalog") || m.catalogs?.length ? "catalogues" : "", res.includes("meta") ? "fiches" : "", res.includes("stream") ? "flux" : "", res.includes("subtitles") ? "sous-titres" : ""].filter(Boolean).join(", ");
  return (
    <View style={st.row}>
      {m.logo ? <Image source={m.logo} style={st.logo} contentFit="contain" /> : <View style={[st.logo, st.mono]}><Text style={font(700, 18)}>{m.name[0]}</Text></View>}
      <View style={{ flex: 1 }}>
        <Text style={font(700, 16)} numberOfLines={1}>{m.name}{m.version ? <Text style={font(400, 13, C.faint)}>  {m.version}</Text> : null}</Text>
        <Text style={font(400, 13, C.mute)} numberOfLines={1}>{[what, (m.types ?? []).map(t => TYPE_FR[t] ?? t).join(", ")].filter(Boolean).join(" · ")}</Text>
        {m.description ? <Text style={[font(400, 13, C.faint), { marginTop: 2 }]} numberOfLines={2}>{m.description}</Text> : null}
      </View>
      <IconBtn name="up" label="Monter" disabled={first} onPress={() => moveAddon(a.url, -1)} />
      <IconBtn name="down" label="Descendre" disabled={last} onPress={() => moveAddon(a.url, 1)} />
      <IconBtn name="close" label={`Retirer ${m.name}`} onPress={() => removeAddon(a.url)} />
    </View>
  );
}

function IconBtn({ name, label, onPress, disabled }: { name: "up" | "down" | "close"; label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityLabel={label} style={({ hovered }: any) => [st.icon, hovered && !disabled && { backgroundColor: "rgba(255,255,255,0.1)" }, disabled && { opacity: 0.3 }]}>
      <Icon name={name} size={18} color={C.soft} />
    </Pressable>
  );
}

const st = StyleSheet.create({
  add: { flexDirection: "row", gap: 10 },
  input: { flex: 1, height: 48, paddingHorizontal: 16, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.08)", outlineStyle: "none" } as any,
  btn: { height: 48, paddingHorizontal: 22, borderRadius: 10, backgroundColor: C.red, justifyContent: "center", minWidth: 110, alignItems: "center" },
  h: { flexDirection: "row", alignItems: "baseline", gap: 10, marginTop: 36, marginBottom: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 14, padding: 14, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.06)", marginBottom: 8 },
  logo: { width: 44, height: 44, borderRadius: 10 },
  mono: { backgroundColor: C.raised, alignItems: "center", justifyContent: "center" },
  icon: { width: 36, height: 36, borderRadius: 8, alignItems: "center", justifyContent: "center" },
});
