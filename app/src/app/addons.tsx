import { Image } from "expo-image";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import { Icon } from "../components/Icon";
import { Select } from "../components/Select";
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

const SOURCES = [{ id: "fr", label: "StremioFR" }, { id: "stremio", label: "Stremio" }] as const;
const cap = (t = "") => t.charAt(0).toUpperCase() + t.slice(1);
const pickHost = (e: CatalogEntry) => e.hosts.findIndex(h => h.up !== false) >= 0 ? e.hosts.findIndex(h => h.up !== false) : 0;

/** Catalogues d'addons, en cartes : un bouton par addon, l'hébergeur se choisit dans un menu quand il y en a plusieurs. */
function Catalogue() {
  const installed = useStore(s => s.addons);
  const { width } = useWindowDimensions();
  const cols = width >= 940 ? 2 : 1;
  const [source, setSource] = useState<"fr" | "stremio">("fr");
  const [lists, setLists] = useState<Partial<Record<"fr" | "stremio", CatalogEntry[] | "erreur">>>({});
  const [q, setQ] = useState("");
  const [menu, setMenu] = useState<string | null>(null);
  const [picked, setPicked] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    if (lists[source]) return;
    fetchAddonCatalog(source).then(l => setLists(x => ({ ...x, [source]: l })), () => setLists(x => ({ ...x, [source]: "erreur" })));
  }, [source, lists]);
  const act = async (e: CatalogEntry, h: Host) => {
    setMsg(null);
    if (!h.manifest) { openUrl(h.configure!); setMsg({ ok: true, text: `Page de ${e.name} ouverte : colle le lien d'installation qu'elle te donne dans le champ en haut.` }); return; }
    setBusy(e.key);
    try { const { addon } = await addAddon(h.manifest); setMsg({ ok: true, text: `${addon.manifest.name} est installé.` }); }
    catch (err: any) { setMsg({ ok: false, text: `${e.name} : ${/fetch|network|Failed/i.test(err?.message) ? "addon injoignable pour le moment." : err?.message ?? "erreur inconnue."}` }); }
    setBusy(null);
  };
  const list = lists[source], shown = Array.isArray(list) ? searchCatalog(list, q) : [];
  // StremioFR range ses addons par section (flux, catalogues, autres) ; le catalogue Stremio est une seule liste.
  const groups = source === "fr" ? [...new Set(shown.map(e => e.tag))].map(t => ({ title: cap(t), items: shown.filter(e => e.tag === t) })) : [{ title: "", items: shown }];
  const rows = (items: CatalogEntry[]) => Array.from({ length: Math.ceil(items.length / cols) }, (_, i) => items.slice(i * cols, i * cols + cols));

  const card = (e: CatalogEntry) => {
    const i = picked[e.key] ?? pickHost(e), h = e.hosts[i], done = hostInstalled(h, installed), many = e.hosts.length > 1;
    const sub = many ? `${e.hosts.length} hébergeurs` : h.label ? `par ${h.label}` : cap(e.tag);
    return (
      <View key={e.key} style={st.card}>
        <View style={{ flexDirection: "row", gap: 14, alignItems: "center" }}>
          {e.logo ? <Image source={e.logo} style={st.logo} contentFit="contain" /> : <View style={[st.logo, st.mono]}><Text style={font(700, 18)}>{e.name[0]}</Text></View>}
          <View style={{ flex: 1 }}>
            <Text style={font(700, 16)} numberOfLines={1}>{e.name}</Text>
            <Text style={font(500, 13, C.faint)} numberOfLines={1}>{sub}{!many && h.up === false ? <Text style={{ color: "#FF8A94" }}> · hors ligne</Text> : null}</Text>
          </View>
        </View>
        {e.description || cols > 1 ? <Text style={[font(400, 13, C.mute), { lineHeight: 18 }, cols > 1 && { height: 36 }]} numberOfLines={2}>{e.description}</Text> : null}
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center", marginTop: "auto" as any }}>
          {many ? (
            <View style={{ flex: 1 }}>
              <Select id={e.key} open={menu} setOpen={setMenu} value={String(i)} onChange={k => setPicked(p => ({ ...p, [e.key]: +k }))}
                items={e.hosts.map((x, j) => ({ k: String(j), label: x.label ?? `Hébergeur ${j + 1}`, note: x.up === false ? "hors ligne" : hostInstalled(x, installed) ? "installé" : undefined }))} />
            </View>
          ) : <View style={{ flex: 1 }} />}
          {done ? (
            <View style={[st.act, st.ghost]}><Icon name="check" size={16} color={C.mute} /><Text style={font(600, 14, C.mute)}>Installé</Text></View>
          ) : (
            <Pressable onPress={() => act(e, h)} disabled={!!busy} accessibilityLabel={`${h.manifest ? "Installer" : "Configurer"} ${e.name}${h.label ? ` (${h.label})` : ""}`}
              style={({ hovered }: any) => [st.act, h.manifest ? { backgroundColor: C.red } : st.ghost, hovered && (h.manifest ? { opacity: 0.9 } : { backgroundColor: "rgba(255,255,255,0.16)" }), busy && busy !== e.key && { opacity: 0.5 }]}>
              {busy === e.key ? <ActivityIndicator color={C.ink} size="small" />
                : h.manifest ? <Text style={font(700, 14)}>Installer</Text>
                : <><Icon name="gear" size={16} color={C.soft} /><Text style={font(600, 14)}>Configurer</Text></>}
            </Pressable>
          )}
        </View>
      </View>
    );
  };

  return (
    <>
      <View style={st.h}>
        <Text style={font(600, 18)}>Catalogue</Text>
        <Text style={font(500, 13, C.faint)}>addons de la communauté, non vérifiés</Text>
      </View>
      <View style={{ flexDirection: "row", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <View style={st.seg} accessibilityRole="tablist">
          {SOURCES.map(x => (
            <Pressable key={x.id} onPress={() => setSource(x.id)} accessibilityRole="tab" accessibilityState={{ selected: source === x.id }} style={({ hovered }: any) => [st.segBtn, source === x.id ? { backgroundColor: C.raisedHover } : hovered && { backgroundColor: "rgba(255,255,255,0.06)" }]}>
              <Text style={font(600, 14, source === x.id ? C.ink : C.mute)}>{x.label}</Text>
            </Pressable>
          ))}
        </View>
        <View style={[st.input, st.search]}>
          <Icon name="search" size={16} color={C.faint} />
          <TextInput value={q} onChangeText={setQ} placeholder="Chercher un addon" placeholderTextColor={C.faint} autoCapitalize="none" autoCorrect={false} style={[font(400, 15), { flex: 1, height: 48, outlineStyle: "none" } as any]} accessibilityLabel="Chercher dans le catalogue" />
        </View>
      </View>
      {msg ? <Text style={[font(500, 14, msg.ok ? C.soft : "#FF8A94"), { marginBottom: 12 }]}>{msg.text}</Text> : null}
      {list === "erreur" ? <Text style={font(400, 14, "#FF8A94")}>Impossible de charger ce catalogue pour le moment.</Text>
        : !list ? <ActivityIndicator color={C.red} style={{ alignSelf: "flex-start", marginTop: 8 }} />
        : !shown.length ? <Text style={font(400, 14, C.mute)}>Aucun addon ne correspond.</Text>
        : groups.map(g => (
          <View key={g.title} style={{ marginBottom: 12 }}>
            {g.title ? <Text style={[font(600, 12, C.faint), st.group]}>{g.title.toUpperCase()}</Text> : null}
            {rows(g.items).map((r, i) => (
              <View key={i} style={{ flexDirection: "row", gap: 12, marginBottom: 12, zIndex: r.some(e => e.key === menu) ? 10 : 1 }}>
                {r.map(card)}
                {r.length < cols ? <View style={{ flex: cols - r.length }} /> : null}
              </View>
            ))}
          </View>
        ))}
    </>
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
  card: { flex: 1, gap: 12, padding: 16, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.06)" },
  act: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 44, minWidth: 124, paddingHorizontal: 16, borderRadius: 10 },
  seg: { flexDirection: "row", padding: 4, gap: 4, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.06)" },
  segBtn: { height: 40, paddingHorizontal: 16, borderRadius: 9, justifyContent: "center" },
  search: { flexDirection: "row", alignItems: "center", gap: 10, minWidth: 240, height: 48 },
  group: { letterSpacing: 1, marginTop: 8, marginBottom: 10 },
  icon: { width: 36, height: 36, borderRadius: 8, alignItems: "center", justifyContent: "center" },
});
