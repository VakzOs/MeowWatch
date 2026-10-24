import { Image } from "expo-image";
import { Fragment, useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, useWindowDimensions, View } from "react-native";
import { Icon, type IconName } from "../components/Icon";
import { C, font } from "../components/theme";
import { api, type Admin } from "../lib/api";
import { ProfileEditor } from "../components/Profiles";
import { Select } from "../components/Select";
import { desktop } from "../lib/desktop";
import { DEFAULT_PREFS, langName, type LangChoice, type LangPrefs } from "../lib/lang";
import { leaveProfile, logout, pull, setLang, updateProfile, useStore } from "../lib/store";

const day = (t: number) => new Date(t).toLocaleDateString("fr-FR", { day: "numeric", month: "long" });

type Tab = "profil" | "lecture" | "adulte" | "compte" | "langue" | "acces" | "apropos";

export default function Reglages() {
  const user = useStore(s => s.user)!;
  const [tab, setTab] = useState<Tab>("profil");
  const narrow = useWindowDimensions().width < 1000;
  const groups: [string, [Tab, IconName, string][]][] = [
    ["Profil", [["profil", "user", "Mon profil"], ["lecture", "screen", "Lecture"], ["adulte", "shield", "Contenu adulte"]]],
    ["Compte", [["compte", "sync", "Discord et synchro"], ["langue", "globe", "Langue des fiches"]]],
    ["Serveur", [...(user.owner && user.profile?.main ? [["acces", "people", "Accès et invitations"] as [Tab, IconName, string]] : []), ["apropos", "info", "À propos"]]],
  ];
  const Pane = { profil: ProfileSettings, lecture: Playback, adulte: Adult, compte: Account, langue: Language, acces: Access, apropos: About }[tab];
  return (
    <View style={{ flex: 1, flexDirection: narrow ? "column" : "row" }}>
      <ScrollView style={narrow ? { flexGrow: 0 } : st.sub} contentContainerStyle={narrow ? { padding: 20, paddingBottom: 0, gap: 4 } : { padding: 24, gap: 2 }} horizontal={narrow}>
        {narrow ? null : <Text style={[font(700, 28), { paddingHorizontal: 12, marginBottom: 8 }]}>Réglages</Text>}
        {groups.map(([title, tabs]) => (
          <Fragment key={title}>
            {narrow ? null : <Text style={[font(700, 12, C.faint), st.group]}>{title.toUpperCase()}</Text>}
            {tabs.map(([k, icon, label]) => (
              <Pressable key={k} onPress={() => setTab(k)} accessibilityRole="tab" accessibilityState={{ selected: tab === k }}
                style={({ hovered }: any) => [st.tab, tab === k ? st.tabCur : hovered && st.tabHover]}>
                {({ hovered }: any) => <>
                  <Icon name={icon} color={tab === k ? C.red : hovered ? C.ink : C.mute} />
                  <Text style={font(500, 15, tab === k || hovered ? C.ink : C.mute)}>{label}</Text>
                </>}
              </Pressable>
            ))}
          </Fragment>
        ))}
      </ScrollView>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: narrow ? 20 : 32, paddingBottom: 80, maxWidth: 760 }}>
        <Pane />
      </ScrollView>
    </View>
  );
}

/** Le profil ouvert (même éditeur que « Gérer les profils »). */
function ProfileSettings() {
  const profile = useStore(s => s.user?.profile)!;
  return (
    <>
      <Title label="Mon profil" sub="Nom et avatar du profil ouvert." />
      <View style={[st.row, { padding: 20 }]}>
        <View style={{ flex: 1 }}><ProfileEditor key={profile.id} profile={profile} onChange={updateProfile} onDeleted={leaveProfile} /></View>
      </View>
    </>
  );
}

const AUDIO = [{ k: "vo", label: "Version originale" }, ...["fr", "en", "ja", "es", "de", "it", "ko", "pt"].map(k => ({ k, label: langName(k) }))];
const SUBS2 = [{ k: "", label: "Aucun" }, ...["fr", "en", "es", "de", "it", "pt", "ja"].map(k => ({ k, label: langName(k) }))];
const SUBS = [{ k: "", label: "Désactivés" }, ...["fr", "en", "es", "de", "it", "pt", "ja"].map(k => ({ k, label: langName(k) }))];

/** Préférences du profil ouvert, enregistrées sur le serveur. */
function usePrefs() {
  const profile = useStore(s => s.user?.profile)!;
  const prefs = profile.prefs ?? DEFAULT_PREFS;
  const put = (next: LangPrefs) => {
    updateProfile({ ...profile, prefs: next });
    api("/api/profiles/prefs", { method: "PUT", body: JSON.stringify(next) }).catch(() => {});
  };
  return { profile, prefs, put };
}

/** Langues choisies au lancement d'une vidéo, pour le profil ouvert ; les animés ont leur propre règle. */
function Playback() {
  const { profile, prefs, put } = usePrefs();
  const [menu, setMenu] = useState<string | null>(null);
  const save = (k: "films" | "animes", patch: Partial<LangChoice>) => put({ ...prefs, [k]: { ...prefs[k], ...patch } });
  const lines: [keyof LangChoice, string, { k: string; label: string }[]][] = [["audio", "Audio", AUDIO], ["audio2", "Sinon", AUDIO], ["subs", "Sous-titres", SUBS], ["subs2", "Sinon", SUBS2]];
  return (
    <>
      <Title label="Lecture" sub={`Pistes choisies au lancement d'une vidéo, pour le profil ${profile.name}.`} />
      <View style={[st.row, { flexDirection: "column", alignItems: "stretch", gap: 10, padding: 16 }]}>
        <View style={st.line}>
          <View style={st.lineLabel} />
          {["Films et séries", "Animés"].map(t => <Text key={t} style={[font(700, 12, C.faint), { flex: 1 }]}>{t.toUpperCase()}</Text>)}
        </View>
        {lines.map(([f, label, items]) => (
          <View key={f} style={[st.line, { zIndex: menu?.endsWith(`-${f}`) ? 10 : 1 }]}>
            <Text style={[font(500, 14, C.mute), st.lineLabel]}>{label}</Text>
            {(["films", "animes"] as const).map(k => (
              <View key={k} style={{ flex: 1 }}>
                {f === "subs2" && !prefs[k].subs ? null
                  : <Select id={`${k}-${f}`} open={menu} setOpen={setMenu} items={items} value={prefs[k][f] ?? ""} onChange={v => save(k, { [f]: v })} />}
              </View>
            ))}
          </View>
        ))}
      </View>
      <Text style={[font(400, 13, C.mute), { marginTop: 4, lineHeight: 19 }]}>
        Si le fichier n'a ni le premier ni le second choix, le lecteur garde sa piste par défaut ; les sous-titres viennent du fichier, sinon des addons (OpenSubtitles…). Animés : ceux des addons d'animés, et les animations japonaises.
      </Text>
    </>
  );
}

function Adult() {
  const { prefs, put } = usePrefs();
  const shown = prefs.adult !== false;
  return (
    <>
      <Title label="Contenu adulte" sub="Pour le profil ouvert." />
      <View style={st.row}>
        <View style={{ flex: 1 }}>
          <Text style={font(600, 15)}>Afficher le contenu adulte</Text>
          <Text style={[font(400, 13, C.mute), { marginTop: 2 }]}>Addons pour adultes et genres pour adultes (Hentai, Ecchi…) de Découvrir.</Text>
        </View>
        <Switch value={shown} onValueChange={v => put({ ...prefs, adult: v })} trackColor={{ false: "#3A3A40", true: C.red }} thumbColor={C.ink} {...{ activeThumbColor: C.ink }} accessibilityLabel="Afficher le contenu adulte" />
      </View>
      <Text style={[font(600, 18), st.h]}>Anti-spoil</Text>
      <View style={st.row}>
        <View style={{ flex: 1 }}>
          <Text style={font(600, 15)}>{prefs.spoil ? "Aperçus floutés" : "Aperçus visibles"}</Text>
          <Text style={[font(400, 13, C.mute), { marginTop: 2 }]}>Floute l'image des épisodes que tu n'as pas encore vus (liste des épisodes, épisode suivant), pour ce profil.</Text>
        </View>
        <Btn label="Visibles" onPress={() => put({ ...prefs, spoil: false })} ghost={!!prefs.spoil} />
        <Btn label="Floutés" onPress={() => put({ ...prefs, spoil: true })} ghost={!prefs.spoil} />
      </View>
    </>
  );
}

/** Langue des titres, résumés et épisodes sur les pages des titres. */
function Language() {
  const lang = useStore(s => s.lang);
  const user = useStore(s => s.user)!;
  return (
    <>
      <Title label="Langue des fiches" sub="Langue des titres, résumés et épisodes." />
      <View style={st.row}>
        <View style={{ flex: 1 }}>
          <Text style={font(600, 15)}>{lang === "en" ? "Anglais (Cinemeta)" : "Français"}</Text>
          <Text style={[font(400, 13, C.mute), { marginTop: 2 }]}>
            {user.translate ? "Titres, résumés, genres et épisodes traduits par TMDB. Les affiches et les flux ne changent pas."
              : user.owner ? "Pas encore disponible : ajoute TMDB_API_KEY dans le .env du serveur (clé gratuite sur themoviedb.org)." : "Pas encore disponible sur ce serveur."}
          </Text>
        </View>
        <Btn label="Français" onPress={() => setLang("fr-FR")} ghost={lang === "en"} />
        <Btn label="English" onPress={() => setLang("en")} ghost={lang !== "en"} />
      </View>
    </>
  );
}

/** Compte Discord et synchro (automatique ; ce bloc la rend visible). */
function Account() {
  const user = useStore(s => s.user)!;
  const lastSync = useStore(s => s.lastSync);
  const addons = useStore(s => s.addons.length);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick(n => n + 1), 30000); return () => clearInterval(t); }, []);
  const ago = !lastSync ? "pas encore" : Date.now() - lastSync < 60000 ? "à l'instant" : `il y a ${Math.round((Date.now() - lastSync) / 60000)} min`;
  return (
    <>
      <Title label="Discord et synchro" sub="Le compte est commun à tous les profils." />
      <View style={st.row}>
        <Avatar name={user.name} src={user.avatar} size={48} />
        <View style={{ flex: 1 }}>
          <Text style={font(700, 17)}>{user.name}</Text>
          <Text style={font(400, 14, C.mute)}>Connecté avec Discord{user.owner ? " · propriétaire" : ""}</Text>
        </View>
        <Btn label="Se déconnecter" onPress={logout} ghost />
      </View>
      <View style={st.row}>
        <View style={{ flex: 1 }}>
          <Text style={font(600, 15)}>{failed ? "Serveur injoignable, la copie de cet appareil est utilisée" : `Synchronisé ${ago}`}</Text>
          <Text style={[font(400, 13, C.mute), { marginTop: 2 }]}>Automatique : {addons > 1 ? `tes ${addons} addons` : addons === 1 ? "ton addon" : "tes addons"} (communs au compte) et la reprise de ce profil sont enregistrés sur le serveur et suivent sur tous tes appareils.</Text>
        </View>
        <Btn label={busy ? "Synchro…" : "Synchroniser maintenant"} onPress={() => { setBusy(true); pull().then(ok => setFailed(!ok)).finally(() => setBusy(false)); }} ghost />
      </View>
    </>
  );
}

/** Invitations et personnes autorisées (propriétaire seulement). */
function Access() {
  const [data, setData] = useState<Admin | null>(null);
  const [note, setNote] = useState("");
  const [fresh, setFresh] = useState<string>();
  const refresh = useCallback(() => api<Admin>("/api/admin").then(setData), []);
  useEffect(() => { refresh(); }, [refresh]);

  const invite = async () => {
    const { link } = await api<{ link: string }>("/api/admin/invites", { method: "POST", body: JSON.stringify({ note }) });
    setNote(""); setFresh(link); copy(link); refresh();
  };
  if (!data) return <ActivityIndicator color={C.red} style={{ marginTop: 32 }} />;
  return (
    <>
      <Title label="Accès et invitations" />
      <Text style={[font(600, 18), { marginBottom: 6 }]}>Inviter quelqu'un</Text>
      <Text style={[font(400, 15, C.mute), { marginBottom: 14 }]}>Le lien sert une seule fois et expire au bout de 7 jours. La personne se connecte avec son compte Discord.</Text>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <TextInput value={note} onChangeText={setNote} onSubmitEditing={invite} placeholder="Pour qui ? (facultatif)" placeholderTextColor={C.faint} style={[font(400, 15), st.input]} accessibilityLabel="Pour qui" />
        <Btn label="Créer un lien" onPress={invite} />
      </View>
      {fresh ? <Text selectable style={[font(500, 14, C.soft), { marginTop: 10 }]}>Lien copié : {fresh}</Text> : null}

      {data.invites.length ? <Text style={[font(600, 18), st.h]}>Invitations en attente</Text> : null}
      {data.invites.map(i => (
        <View key={i.code} style={st.row}>
          <View style={{ flex: 1 }}>
            <Text style={font(600, 15)}>{i.note || "Invitation"}</Text>
            <Text selectable style={font(400, 13, C.mute)} numberOfLines={1}>{i.link} · expire le {day(i.expiresAt)}</Text>
          </View>
          <Btn label="Copier" onPress={() => copy(i.link)} ghost />
          <Btn label="Annuler" onPress={() => api(`/api/admin/invites?code=${i.code}`, { method: "DELETE" }).then(refresh)} ghost />
        </View>
      ))}

      <Text style={[font(600, 18), st.h]}>Ont accès</Text>
      {data.users.map(u => (
        <View key={u.id} style={st.row}>
          <Avatar name={u.name} src={u.avatar} size={40} />
          <View style={{ flex: 1 }}>
            <Text style={font(600, 15)}>{u.name}</Text>
            <Text style={font(400, 13, C.mute)}>{u.owner ? "Propriétaire" : `Depuis le ${day(u.createdAt)}`}</Text>
          </View>
          {!u.owner ? <Btn label="Retirer l'accès" onPress={() => api(`/api/admin/users?id=${u.id}`, { method: "DELETE" }).then(refresh)} ghost /> : null}
        </View>
      ))}
    </>
  );
}

const copy = (text: string) => { if (Platform.OS === "web") navigator.clipboard?.writeText(text).catch(() => {}); };

function Avatar({ name, src, size }: { name: string; src: string | null; size: number }) {
  return src ? <Image source={src} style={{ width: size, height: size, borderRadius: size / 2 }} />
    : <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: C.red, alignItems: "center", justifyContent: "center" }}><Text style={font(700, size * 0.4)}>{name[0]?.toUpperCase()}</Text></View>;
}

// Date du build du site (Dockerfile) : permet de vérifier qu'un redéploiement a bien été pris.
const BUILD = process.env.EXPO_PUBLIC_BUILD;

/** Versions : appli Windows et site. */
function About() {
  const built = BUILD ? new Date(BUILD) : null;
  return (
    <>
      <Title label="À propos" />
      <View style={[st.row, { flexDirection: "column", alignItems: "flex-start", gap: 6 }]}>
        <Text style={font(400, 14, C.soft)}>{desktop ? `Appli Windows · version ${desktop.version}` : "Version web (navigateur)"}</Text>
        <Text style={font(400, 14, C.mute)}>
          {built && !isNaN(+built) ? `Site mis à jour le ${built.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })} à ${built.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}` : "Site : version de développement"}
        </Text>
      </View>
    </>
  );
}

function Title({ label, sub }: { label: string; sub?: string }) {
  return (
    <View style={{ marginBottom: 20 }}>
      <Text style={font(700, 26)}>{label}</Text>
      {sub ? <Text style={[font(400, 14, C.mute), { marginTop: 6 }]}>{sub}</Text> : null}
    </View>
  );
}

function Btn({ label, onPress, ghost }: { label: string; onPress: () => void; ghost?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ hovered }: any) => [st.btn, ghost ? { backgroundColor: hovered ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.08)" } : { backgroundColor: C.red, opacity: hovered ? 0.9 : 1 }]}>
      <Text style={font(600, 14)}>{label}</Text>
    </Pressable>
  );
}

const st = StyleSheet.create({
  sub: { width: 260, flexGrow: 0, borderRightWidth: 1, borderRightColor: "rgba(255,255,255,0.07)" },
  group: { letterSpacing: 0.8, paddingHorizontal: 12, paddingTop: 18, paddingBottom: 6 },
  tab: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8 },
  tabCur: { backgroundColor: "rgba(255,255,255,0.08)" },
  tabHover: { backgroundColor: "rgba(255,255,255,0.05)" },
  line: { flexDirection: "row", alignItems: "center", gap: 12 },
  lineLabel: { width: 96 },
  h: { marginTop: 36, marginBottom: 10 },
  row: { flexDirection: "row", alignItems: "center", gap: 14, padding: 14, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.06)", marginBottom: 8 },
  input: { flex: 1, height: 44, paddingHorizontal: 16, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.08)", outlineStyle: "none" } as any,
  btn: { height: 40, paddingHorizontal: 16, borderRadius: 10, justifyContent: "center" },
});
