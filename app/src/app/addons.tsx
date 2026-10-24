import { Image } from "expo-image";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Icon } from "../components/Icon";
import { C, font, TYPE_FR } from "../components/theme";
import { addonKinds, configureUrl, fetchAddonCatalog, hostInstalled, searchCatalog, type Addon, type CatalogEntry, type Host } from "../lib/addons";
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
    try { const { addon: a, updated } = await addAddon(url); setUrl(""); setMsg({ ok: true, text: updated ? `${a.manifest.name} : réglages mis à jour.` : `${a.manifest.name} est installé.` }); }
    catch (e: any) { setMsg({ ok: false, text: /fetch|network|Failed/i.test(e?.message) ? "Impossible de joindre ce lien. Vérifie l'adresse de l'addon." : e?.message ?? "Erreur inconnue." }); }
    setBusy(false);
  };

  return (
    <>
      <ScrollView contentContainerStyle={{ padding: 32, paddingBottom: 80, maxWidth: 880 }}>
        <Text style={[font(700, 28), { marginBottom: 6 }]}>Addons</Text>
        <Text style={[font(400, 15, C.mute), { marginBottom: 24 }]}>Les mêmes addons que Stremio. Importe-les depuis ton compte, ou colle un lien d'installation (celui qui finit par manifest.json, ou stremio://). Après « Configurer », colle le nouveau lien donné par l'addon : il remplace l'ancien.</Text>
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

        <Catalogue />
      </ScrollView>
    </>
  );
}

type Step = { s: "idle" } | { s: "code"; code: string; link: string; qrcode: string } | { s: "import" } | { s: "done"; addons: number; progress: number; library: number } | { s: "error"; text: string };

/** Connexion « link » de Stremio : on ouvre leur page, on valide, et Meow Watch récupère addons, reprise et bibliothèque.
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
          <Text style={font(400, 14, step.s === "error" ? "#FF8A94" : C.mute)}>{step.s === "error" ? step.text : "Récupère tes addons (avec ton debrid déjà configuré) ta reprise et ta bibliothèque depuis ton compte Stremio. Ton mot de passe reste chez Stremio."}</Text>
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
          <Text style={font(500, 14, C.soft)}>{step.addons ? `${step.addons} addon${step.addons > 1 ? "s" : ""} ajouté${step.addons > 1 ? "s" : ""}` : "Aucun nouvel addon (déjà tous là)"} · {step.progress} reprise{step.progress > 1 ? "s" : ""} importée{step.progress > 1 ? "s" : ""} · {step.library} titre{step.library > 1 ? "s" : ""} ajouté{step.library > 1 ? "s" : ""} à la bibliothèque de ce profil.</Text>
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

const openUrl = (url: string) => (Platform.OS === "web" ? window.open(url, "_blank", "noopener") : Linking.openURL(url));

const SOURCES = [{ id: "fr", label: "StremioFR", note: "addons français, recensés par stremiofr.me" }, { id: "stremio", label: "Stremio", note: "catalogue communautaire officiel" }] as const;

/** Catalogues d'addons : installation en un clic, ou page de réglages quand l'addon se configure d'abord. */
function Catalogue() {
  const installed = useStore(s => s.addons);
  const [source, setSource] = useState<"fr" | "stremio">("fr");
  const [lists, setLists] = useState<Partial<Record<"fr" | "stremio", CatalogEntry[] | "erreur">>>({});
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    if (lists[source]) return;
    fetchAddonCatalog(source).then(l => setLists(x => ({ ...x, [source]: l })), () => setLists(x => ({ ...x, [source]: "erreur" })));
  }, [source, lists]);
  const install = async (e: CatalogEntry, url: string) => {
    setBusy(url); setMsg(null);
    try { const { addon } = await addAddon(url); setMsg({ ok: true, text: `${addon.manifest.name} est installé.` }); }
    catch (err: any) { setMsg({ ok: false, text: `${e.name} : ${/fetch|network|Failed/i.test(err?.message) ? "addon injoignable pour le moment." : err?.message ?? "erreur inconnue."}` }); }
    setBusy(null);
  };
  const list = lists[source], shown = Array.isArray(list) ? searchCatalog(list, q) : [];
  return (
    <>
      <View style={st.h}>
        <Text style={font(600, 18)}>Catalogue</Text>
        <Text style={font(500, 13, C.faint)}>{SOURCES.find(x => x.id === source)!.note}</Text>
      </View>
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }} accessibilityRole="tablist">
        {SOURCES.map(x => (
          <Pressable key={x.id} onPress={() => setSource(x.id)} accessibilityRole="tab" accessibilityState={{ selected: source === x.id }} style={({ hovered }: any) => [st.cfg, source === x.id ? { backgroundColor: C.red } : hovered && { backgroundColor: "rgba(255,255,255,0.16)" }]}>
            <Text style={font(600, 13)}>{x.label}</Text>
          </Pressable>
        ))}
      </View>
      <View style={[st.add, { marginBottom: 12 }]}>
        <TextInput value={q} onChangeText={setQ} placeholder="Chercher un addon (flux, sous-titres, anime…)" placeholderTextColor={C.faint} autoCapitalize="none" autoCorrect={false} style={[font(400, 15), st.input]} accessibilityLabel="Chercher dans le catalogue" />
      </View>
      <Text style={[font(400, 13, C.faint), { marginBottom: 12 }]}>Addons de la communauté, non vérifiés. « Configurer » ouvre la page de l'addon : colle ensuite le lien qu'elle te donne dans le champ du haut.</Text>
      {msg ? <Text style={[font(500, 14, msg.ok ? C.soft : "#FF8A94"), { marginBottom: 10 }]}>{msg.text}</Text> : null}
      {list === "erreur" ? <Text style={font(400, 14, "#FF8A94")}>Impossible de charger ce catalogue pour le moment.</Text>
        : !list ? <ActivityIndicator color={C.red} style={{ alignSelf: "flex-start" }} />
        : !shown.length ? <Text style={font(400, 14, C.mute)}>Aucun addon ne correspond.</Text>
        : shown.map(e => (
          <View key={e.key} style={[st.row, { alignItems: "flex-start" }]}>
            <Info name={e.name} logo={e.logo} sub={e.tag} description={e.description} />
            <View style={{ gap: 6, alignItems: "flex-end", maxWidth: 300 }}>
              {e.hosts.map((h, i) => <HostBtn key={i} h={h} name={e.name} installed={hostInstalled(h, installed)} busy={busy} onInstall={url => install(e, url)} />)}
            </View>
          </View>
        ))}
    </>
  );
}

function HostBtn({ h, name, installed, busy, onInstall }: { h: Host; name: string; installed: boolean; busy: string | null; onInstall: (url: string) => void }) {
  const label = [h.label, h.up === false ? "hors ligne" : ""].filter(Boolean).join(" · ");
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      {label ? <Text style={font(500, 12, h.up === false ? "#FF8A94" : C.faint)} numberOfLines={1}>{h.up ? "● " : ""}{label}</Text> : null}
      {installed ? <Text style={[font(600, 13, C.faint), st.cfg]}>Installé</Text>
        : h.manifest ? (
          <Pressable onPress={() => onInstall(h.manifest!)} disabled={!!busy} accessibilityLabel={`Installer ${name}${h.label ? ` (${h.label})` : ""}`} style={({ hovered }: any) => [st.cfg, { backgroundColor: C.red }, hovered && { opacity: 0.9 }, busy && busy !== h.manifest && { opacity: 0.5 }]}>
            {busy === h.manifest ? <ActivityIndicator color={C.ink} size="small" /> : <Text style={font(700, 13)}>Installer</Text>}
          </Pressable>
        ) : (
          <Pressable onPress={() => openUrl(h.configure!)} accessibilityLabel={`Configurer ${name}${h.label ? ` (${h.label})` : ""}`} style={({ hovered }: any) => [st.cfg, hovered && { backgroundColor: "rgba(255,255,255,0.16)" }]}>
            <Icon name="gear" size={16} color={C.soft} /><Text style={font(600, 13)}>Configurer</Text>
          </Pressable>
        )}
    </View>
  );
}

function Info({ name, logo, sub, description, version }: { name: string; logo?: string; sub?: string; description?: string; version?: string }) {
  return (
    <>
      {logo ? <Image source={logo} style={st.logo} contentFit="contain" /> : <View style={[st.logo, st.mono]}><Text style={font(700, 18)}>{name[0]}</Text></View>}
      <View style={{ flex: 1 }}>
        <Text style={font(700, 16)} numberOfLines={1}>{name}{version ? <Text style={font(400, 13, C.faint)}>  {version}</Text> : null}</Text>
        {sub ? <Text style={font(400, 13, C.mute)} numberOfLines={1}>{sub}</Text> : null}
        {description ? <Text style={[font(400, 13, C.faint), { marginTop: 2 }]} numberOfLines={2}>{description}</Text> : null}
      </View>
    </>
  );
}

const AddonInfo = ({ a: { manifest: m } }: { a: Addon }) =>
  <Info name={m.name} logo={m.logo} version={m.version} description={m.description} sub={[addonKinds(m), (m.types ?? []).map(t => TYPE_FR[t] ?? t).join(", ")].filter(Boolean).join(" · ")} />;

function AddonRow({ a, first, last }: { a: Addon; first: boolean; last: boolean }) {
  const m = a.manifest;
  return (
    <View style={st.row}>
      <AddonInfo a={a} />
      {configureUrl(a) ? (
        <Pressable onPress={() => openUrl(configureUrl(a)!)} accessibilityLabel={`Configurer ${m.name}`} style={({ hovered }: any) => [st.cfg, hovered && { backgroundColor: "rgba(255,255,255,0.16)" }]}>
          <Icon name="gear" size={16} color={C.soft} /><Text style={font(600, 13)}>Configurer</Text>
        </Pressable>
      ) : null}
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
  cfg: { flexDirection: "row", alignItems: "center", gap: 6, height: 36, paddingHorizontal: 12, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.08)" },
  input: { flex: 1, height: 48, paddingHorizontal: 16, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.08)", outlineStyle: "none" } as any,
  btn: { height: 48, paddingHorizontal: 22, borderRadius: 10, backgroundColor: C.red, justifyContent: "center", minWidth: 110, alignItems: "center" },
  h: { flexDirection: "row", alignItems: "baseline", gap: 10, marginTop: 36, marginBottom: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 14, padding: 14, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.06)", marginBottom: 8 },
  logo: { width: 44, height: 44, borderRadius: 10 },
  mono: { backgroundColor: C.raised, alignItems: "center", justifyContent: "center" },
  icon: { width: 36, height: 36, borderRadius: 8, alignItems: "center", justifyContent: "center" },
});
