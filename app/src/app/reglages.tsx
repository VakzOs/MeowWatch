import { Image } from "expo-image";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Shell } from "../components/Shell";
import { C, font } from "../components/theme";
import { api, type Admin } from "../lib/api";
import { PinPad, ProfileAvatar } from "../components/Profiles";
import { leaveProfile, logout, updateProfile, useStore } from "../lib/store";
import type { Profile } from "../lib/api";

const day = (t: number) => new Date(t).toLocaleDateString("fr-FR", { day: "numeric", month: "long" });

export default function Reglages() {
  const user = useStore(s => s.user)!;
  return (
    <Shell>
      <ScrollView contentContainerStyle={{ padding: 32, paddingBottom: 80, maxWidth: 880 }}>
        <Text style={[font(700, 28), { marginBottom: 24 }]}>Réglages</Text>
        <View style={st.row}>
          <Avatar name={user.name} src={user.avatar} size={48} />
          <View style={{ flex: 1 }}>
            <Text style={font(700, 17)}>{user.name}</Text>
            <Text style={font(400, 14, C.mute)}>Connecté avec Discord{user.owner ? " · propriétaire" : ""}</Text>
          </View>
          <Btn label="Se déconnecter" onPress={logout} ghost />
        </View>
        <ProfileSettings />
        {user.owner && user.profile?.main ? <Access /> : null}
      </ScrollView>
    </Shell>
  );
}

/** Le profil ouvert : nom, couleur, code, suppression. */
function ProfileSettings() {
  const profile = useStore(s => s.user?.profile)!;
  const [name, setName] = useState(profile.name);
  const [colors, setColors] = useState<string[]>([]);
  const [pinMode, setPinMode] = useState(false);
  const [msg, setMsg] = useState<string>();
  const [confirm, setConfirm] = useState(false);
  useEffect(() => { api<{ colors: string[] }>("/api/profiles").then(r => setColors(r.colors)); }, []);
  const patch = (b: object) => api<Profile>("/api/profiles", { method: "PATCH", body: JSON.stringify(b) }).then(updateProfile).catch((e: Error) => setMsg(e.message));
  const remove = () => api("/api/profiles", { method: "DELETE" }).then(leaveProfile).catch((e: Error) => setMsg(e.message));
  if (pinMode) return (
    <View style={{ height: 620, marginTop: 24, borderRadius: 12, overflow: "hidden" }}>
      <PinPad title={profile.name} hint="Choisis un code à 4 chiffres" onPin={pin => patch({ pin }).then(() => setPinMode(false))} onCancel={() => setPinMode(false)} />
    </View>
  );
  return (
    <>
      <Text style={[font(600, 18), st.h]}>Profil</Text>
      <View style={[st.row, { alignItems: "flex-start" }]}>
        <ProfileAvatar p={profile} size={64} />
        <View style={{ flex: 1, gap: 14 }}>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <TextInput value={name} onChangeText={setName} onSubmitEditing={() => patch({ name })} maxLength={20} style={[font(500, 15), st.input]} accessibilityLabel="Nom du profil" />
            <Btn label="Renommer" onPress={() => patch({ name })} ghost />
          </View>
          <View style={{ flexDirection: "row", gap: 10 }}>
            {colors.map(c => <Pressable key={c} onPress={() => patch({ color: c })} accessibilityLabel={`Couleur ${c}`} style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: c, borderWidth: 3, borderColor: c === profile.color ? C.ink : "transparent" }} />)}
          </View>
          <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
            <Btn label={profile.locked ? "Changer le code" : "Verrouiller par un code"} onPress={() => setPinMode(true)} ghost />
            {profile.locked ? <Btn label="Retirer le code" onPress={() => patch({ pin: null })} ghost /> : null}
            {profile.main ? null : confirm ? <Btn label="Oui, supprimer (sa reprise aussi)" onPress={remove} /> : <Btn label="Supprimer ce profil" onPress={() => setConfirm(true)} ghost />}
          </View>
          {msg ? <Text style={font(500, 14, "#FF8A94")}>{msg}</Text> : null}
        </View>
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
