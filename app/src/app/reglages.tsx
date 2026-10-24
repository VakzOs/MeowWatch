import { Image } from "expo-image";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { C, font } from "../components/theme";
import { api, type Admin } from "../lib/api";
import { ProfileEditor } from "../components/Profiles";
import { Select } from "../components/Select";
import { DEFAULT_PREFS, langName, type LangChoice, type LangPrefs } from "../lib/lang";
import { leaveProfile, logout, pull, setLang, updateProfile, useStore } from "../lib/store";

const day = (t: number) => new Date(t).toLocaleDateString("fr-FR", { day: "numeric", month: "long" });

export default function Reglages() {
  const user = useStore(s => s.user)!;
  return (
    <>
      <ScrollView contentContainerStyle={{ padding: 32, paddingBottom: 80, maxWidth: 880 }}>
        <Text style={[font(700, 28), { marginBottom: 8 }]}>Réglages</Text>
        <Text style={[font(600, 18), st.h]}>Compte Discord</Text>
        <View style={st.row}>
          <Avatar name={user.name} src={user.avatar} size={48} />
          <View style={{ flex: 1 }}>
            <Text style={font(700, 17)}>{user.name}</Text>
            <Text style={font(400, 14, C.mute)}>Connecté avec Discord{user.owner ? " · propriétaire" : ""}</Text>
          </View>
          <Btn label="Se déconnecter" onPress={logout} ghost />
        </View>
        <ProfileSettings />
        <Playback />
        <Sync />
        <Language />
        {user.owner && user.profile?.main ? <Access /> : null}
      </ScrollView>
    </>
  );
}

/** Le profil ouvert (même éditeur que « Gérer les profils »). */
function ProfileSettings() {
  const profile = useStore(s => s.user?.profile)!;
  return (
    <>
      <Text style={[font(600, 18), st.h]}>Profil</Text>
      <View style={[st.row, { padding: 20 }]}>
        <View style={{ flex: 1 }}><ProfileEditor key={profile.id} profile={profile} onChange={updateProfile} onDeleted={leaveProfile} /></View>
      </View>
    </>
  );
}

const AUDIO = [{ k: "vo", label: "Version originale" }, ...["fr", "en", "ja", "es", "de", "it", "ko", "pt"].map(k => ({ k, label: langName(k) }))];
const SUBS2 = [{ k: "", label: "Aucun" }, ...["fr", "en", "es", "de", "it", "pt", "ja"].map(k => ({ k, label: langName(k) }))];
const SUBS = [{ k: "", label: "Désactivés" }, ...["fr", "en", "es", "de", "it", "pt", "ja"].map(k => ({ k, label: langName(k) }))];

/** Langues choisies au lancement d'une vidéo, pour le profil ouvert ; les animés ont leur propre règle. */
function Playback() {
  const profile = useStore(s => s.user?.profile)!;
  const prefs = profile.prefs ?? DEFAULT_PREFS;
  const [menu, setMenu] = useState<string | null>(null);
  const put = (next: LangPrefs) => {
    updateProfile({ ...profile, prefs: next });
    api("/api/profiles/prefs", { method: "PUT", body: JSON.stringify(next) }).catch(() => {});
  };
  const save = (k: "films" | "animes", patch: Partial<LangChoice>) => put({ ...prefs, [k]: { ...prefs[k], ...patch } });
  return (
    <>
      <Text style={[font(600, 18), st.h]}>Lecture</Text>
      {([["films", "Films et séries"], ["animes", "Animés"]] as const).map(([k, title]) => {
        const field = (f: keyof LangChoice, label: string, items: { k: string; label: string }[]) => (
          <View style={{ gap: 4 }}>
            <Text style={font(500, 12, C.mute)}>{label}</Text>
            <Select id={`${k}-${f}`} open={menu} setOpen={setMenu} items={items} value={prefs[k][f] ?? ""} onChange={v => save(k, { [f]: v })} />
          </View>
        );
        return (
          <View key={k} style={[st.row, { flexDirection: "column", alignItems: "stretch", zIndex: menu?.startsWith(k) ? 10 : 1 }]}>
            <Text style={font(600, 15)}>{title}</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
              {field("audio", "Audio", AUDIO)}
              {field("audio2", "Sinon", AUDIO)}
              {field("subs", "Sous-titres", SUBS)}
              {prefs[k].subs ? field("subs2", "Sinon", SUBS2) : null}
            </View>
          </View>
        );
      })}
      <Text style={[font(400, 13, C.mute), { marginTop: 4 }]}>
        Si le fichier n'a ni le premier ni le second choix, le lecteur garde sa piste par défaut ; les sous-titres viennent du fichier, sinon des addons (OpenSubtitles…). Animés : ceux des addons d'animés, et les animations japonaises.
      </Text>
      <Text style={[font(600, 18), st.h]}>Contenu adulte</Text>
      <View style={st.row}>
        <View style={{ flex: 1 }}>
          <Text style={font(600, 15)}>{prefs.adult === false ? "Masqué" : "Affiché"}</Text>
          <Text style={[font(400, 13, C.mute), { marginTop: 2 }]}>Addons pour adultes dans le catalogue de l'écran Addons, pour ce profil.</Text>
        </View>
        <Btn label="Afficher" onPress={() => put({ ...prefs, adult: true })} ghost={prefs.adult === false} />
        <Btn label="Masquer" onPress={() => put({ ...prefs, adult: false })} ghost={prefs.adult !== false} />
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
      <Text style={[font(600, 18), st.h]}>Langue des fiches</Text>
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

/** La synchro est automatique ; ce bloc la rend visible. */
function Sync() {
  const lastSync = useStore(s => s.lastSync);
  const addons = useStore(s => s.addons.length);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick(n => n + 1), 30000); return () => clearInterval(t); }, []);
  const ago = !lastSync ? "pas encore" : Date.now() - lastSync < 60000 ? "à l'instant" : `il y a ${Math.round((Date.now() - lastSync) / 60000)} min`;
  return (
    <>
      <Text style={[font(600, 18), st.h]}>Synchro</Text>
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
      <Text style={[font(600, 18), st.h]}>Inviter quelqu'un</Text>
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

function Btn({ label, onPress, ghost }: { label: string; onPress: () => void; ghost?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ hovered }: any) => [st.btn, ghost ? { backgroundColor: hovered ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.08)" } : { backgroundColor: C.red, opacity: hovered ? 0.9 : 1 }]}>
      <Text style={font(600, 14)}>{label}</Text>
    </Pressable>
  );
}

const st = StyleSheet.create({
  h: { marginTop: 36, marginBottom: 10 },
  row: { flexDirection: "row", alignItems: "center", gap: 14, padding: 14, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.06)", marginBottom: 8 },
  input: { flex: 1, height: 44, paddingHorizontal: 16, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.08)", outlineStyle: "none" } as any,
  btn: { height: 40, paddingHorizontal: 16, borderRadius: 10, justifyContent: "center" },
});
