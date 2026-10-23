import { Image } from "expo-image";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Icon } from "../components/Icon";
import { C, font, TYPE_FR } from "../components/theme";
import type { Addon } from "../lib/addons";
import { addAddon, importFromStremio, moveAddon, removeAddon, useStore } from "../lib/store";
import { createLink, fetchAccount, waitForAuth } from "../lib/stremio";

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
        <Text style={[font(400, 15, C.mute), { marginBottom: 24 }]}>Les mêmes addons que Stremio. Importe-les depuis ton compte, ou colle un lien d'installation (celui qui finit par manifest.json, ou stremio://).</Text>
        <StremioImport />

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

type Step = { s: "idle" } | { s: "code"; code: string; link: string; qrcode: string } | { s: "import" } | { s: "done"; addons: number; progress: number } | { s: "error"; text: string };

/** Connexion « link » de Stremio : on ouvre leur page, on valide, et Meow Watch récupère addons et reprise.
 *  Meow Watch ne voit jamais le mot de passe, et la clé Stremio n'est gardée nulle part. */
function StremioImport() {
  const [step, setStep] = useState<Step>({ s: "idle" });
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  const start = async () => {
    abort.current?.abort(); abort.current = new AbortController();
    try {
      const l = await createLink();
      setStep({ s: "code", ...l });
      const key = await waitForAuth(l.code, { signal: abort.current.signal });
      setStep({ s: "import" });
      setStep({ s: "done", ...(await importFromStremio(await fetchAccount(key))) });
    } catch (e: any) { if (e?.message !== "annulé") setStep({ s: "error", text: e?.message ?? "Erreur inconnue." }); }
  };
  const open = (url: string) => (Platform.OS === "web" ? window.open(url, "_blank", "noopener") : Linking.openURL(url));
  return (
    <View style={st.import}>
      <View style={{ flex: 1, gap: 6 }}>
        <Text style={font(700, 17)}>Importer depuis Stremio</Text>
        {step.s === "idle" || step.s === "error" ? (
          <Text style={font(400, 14, step.s === "error" ? "#FF8A94" : C.mute)}>{step.s === "error" ? step.text : "Récupère tes addons (avec ton debrid déjà configuré) et ta reprise depuis ton compte Stremio. Ton mot de passe reste chez Stremio."}</Text>
        ) : step.s === "code" ? (
          <>
            <Text style={font(400, 14, C.soft)}>Ouvre la page Stremio, connecte-toi et valide le code :</Text>
            <Text style={[font(700, 34), { letterSpacing: 6, marginVertical: 4 }]} selectable>{step.code}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <ActivityIndicator color={C.red} size="small" />
              <Text style={font(400, 14, C.mute)}>En attente de ta validation sur Stremio…</Text>
            </View>
          </>
        ) : step.s === "import" ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}><ActivityIndicator color={C.red} size="small" /><Text style={font(400, 14, C.soft)}>Import en cours…</Text></View>
        ) : (
          <Text style={font(500, 14, C.soft)}>{step.addons ? `${step.addons} addon${step.addons > 1 ? "s" : ""} ajouté${step.addons > 1 ? "s" : ""}` : "Aucun nouvel addon (déjà tous là)"} · {step.progress} reprise{step.progress > 1 ? "s" : ""} importée{step.progress > 1 ? "s" : ""} dans ce profil.</Text>
        )}
      </View>
      {step.s === "code" ? (
        <View style={{ alignItems: "center", gap: 10 }}>
          <Image source={step.qrcode} style={{ width: 112, height: 112, borderRadius: 8, backgroundColor: "#fff" }} accessibilityLabel="QR code de validation Stremio" />
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable onPress={() => open(step.link)} style={({ hovered }: any) => [st.btn, hovered && { opacity: 0.9 }]}><Text style={font(700, 14)}>Ouvrir Stremio</Text></Pressable>
            <Pressable onPress={() => { abort.current?.abort(); setStep({ s: "idle" }); }} style={({ hovered }: any) => [st.btn, st.ghost, hovered && { backgroundColor: "rgba(255,255,255,0.16)" }]}><Text style={font(600, 14)}>Annuler</Text></Pressable>
          </View>
        </View>
      ) : step.s !== "import" ? (
        <Pressable onPress={start} style={({ hovered }: any) => [st.btn, hovered && { opacity: 0.9 }]}>
          <Text style={font(700, 14)}>{step.s === "done" ? "Réimporter" : step.s === "error" ? "Réessayer" : "Se connecter à Stremio"}</Text>
        </Pressable>
      ) : null}
    </View>
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
  import: { flexDirection: "row", alignItems: "center", gap: 20, padding: 20, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.06)", marginBottom: 20 },
  ghost: { backgroundColor: "rgba(255,255,255,0.09)" },
  input: { flex: 1, height: 48, paddingHorizontal: 16, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.08)", outlineStyle: "none" } as any,
  btn: { height: 48, paddingHorizontal: 22, borderRadius: 10, backgroundColor: C.red, justifyContent: "center", minWidth: 110, alignItems: "center" },
  h: { flexDirection: "row", alignItems: "baseline", gap: 10, marginTop: 36, marginBottom: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 14, padding: 14, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.06)", marginBottom: 8 },
  logo: { width: 44, height: 44, borderRadius: 10 },
  mono: { backgroundColor: C.raised, alignItems: "center", justifyContent: "center" },
  icon: { width: 36, height: 36, borderRadius: 8, alignItems: "center", justifyContent: "center" },
});
