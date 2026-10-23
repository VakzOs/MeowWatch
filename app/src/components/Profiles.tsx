import { Image } from "expo-image";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import { api, type Profile } from "../lib/api";
import { logout, selectProfile } from "../lib/store";
import { AVATARS, avatarSrc } from "./avatars";
import { Backdrop } from "./Backdrop";
import { BrandMark } from "./BrandMark";
import { C, font } from "./theme";

type List = { profiles: Profile[]; max: number };
type Face = Pick<Profile, "name" | "color"> & { avatar?: string | null };

export function ProfileAvatar({ p, size = 120 }: { p: Face; size?: number }) {
  const src = avatarSrc(p.avatar);
  const r = size * 0.2;
  return src ? <Image source={src} style={{ width: size, height: size, borderRadius: r }} contentFit="cover" /> : (
    <View style={{ width: size, height: size, borderRadius: r, backgroundColor: p.color, alignItems: "center", justifyContent: "center" }}>
      <Text style={font(700, size * 0.42)}>{p.name[0]?.toUpperCase()}</Text>
    </View>
  );
}

export const Lock = ({ size = 16, color = C.mute }: { size?: number; color?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <Rect x="5" y="11" width="14" height="10" rx="2" /><Path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </Svg>
);

/** Apparition en montée, décalée par élément. */
function Rise({ i, children }: { i: number; children: React.ReactNode }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.timing(v, { toValue: 1, duration: 420, delay: 80 + i * 70, useNativeDriver: Platform.OS !== "web" }).start(); }, []);
  return <Animated.View style={{ opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }] }}>{children}</Animated.View>;
}

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <View style={st.root}>
      <Backdrop />
      <View style={st.brand}>
        <BrandMark size={30} />
        <Text style={font(700, 18)}>Meow Watch</Text>
      </View>
      {children}
    </View>
  );
}

/** « Qui regarde ? » : choix du profil, code PIN, ajout d'un profil. */
export function ProfilePicker() {
  const [list, setList] = useState<List | null>(null);
  const [asking, setAsking] = useState<Profile | null>(null);
  const [adding, setAdding] = useState(false);
  const [manage, setManage] = useState(false);
  const [editing, setEditing] = useState<Profile | null>(null);
  const refresh = useCallback(() => api<List>("/api/profiles").then(setList), []);
  useEffect(() => { refresh(); }, [refresh]);

  // En mode gestion, on ouvre le profil côté serveur (code compris) sans entrer dans l'appli.
  const openEditor = (p: Profile, pin?: string) => api<Profile>("/api/profiles/select", { method: "POST", body: JSON.stringify({ id: p.id, pin }) }).then(fresh => { setAsking(null); setEditing(fresh); });
  const closeEditor = () => api("/api/profiles/leave", { method: "POST" }).finally(() => { setEditing(null); refresh(); });
  const choose = (p: Profile) => (manage ? (p.locked ? setAsking(p) : openEditor(p)) : p.locked ? setAsking(p) : selectProfile(p.id));

  if (editing) return (
    <Screen>
      <View style={st.panel}>
        <Text style={[font(700, 30), { marginBottom: 28 }]}>Modifier le profil</Text>
        <ProfileEditor profile={editing} onChange={setEditing} onDeleted={closeEditor} />
        <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 28 }}><Btn label="Terminé" onPress={closeEditor} /></View>
      </View>
    </Screen>
  );
  if (asking) return <PinPad face={asking} onCancel={() => setAsking(null)} onPin={pin => (manage ? openEditor(asking, pin) : selectProfile(asking.id, pin))} />;
  if (adding) return <NewProfile onDone={() => { setAdding(false); refresh(); }} />;
  return (
    <Screen>
      <Rise i={0}><Text style={[font(700, 44), { textAlign: "center", letterSpacing: -0.5 }]}>{manage ? "Gérer les profils" : "Qui regarde ?"}</Text></Rise>
      <Rise i={1}><Text style={[font(400, 17, C.mute), { textAlign: "center", marginTop: 10, marginBottom: 56 }]}>{manage ? "Choisis le profil à modifier." : "Choisis ton profil pour retrouver ta reprise."}</Text></Rise>
      {!list ? <ActivityIndicator color={C.red} /> : (
        <View style={st.grid}>
          {list.profiles.map((p, i) => (
            <Rise key={p.id} i={i + 2}>
              <Tile label={p.name} onPress={() => choose(p)} badge={p.locked ? <View style={st.badge}><Lock size={15} color={C.ink} /></View> : null}>
                <ProfileAvatar p={p} size={168} />
                {manage ? <View style={st.editVeil}><Pencil /></View> : null}
              </Tile>
            </Rise>
          ))}
          {!manage && list.profiles.length < list.max ? (
            <Rise i={list.profiles.length + 2}>
              <Tile label="Ajouter un profil" muted onPress={() => setAdding(true)}>
                <View style={st.add}>
                  <Svg width={44} height={44} viewBox="0 0 24 24" fill="none" stroke={C.soft} strokeWidth={1.6} strokeLinecap="round"><Path d="M12 5v14M5 12h14" /></Svg>
                </View>
              </Tile>
            </Rise>
          ) : null}
        </View>
      )}
      <View style={{ flexDirection: "row", gap: 12, marginTop: 56 }}>
        {manage ? <Btn label="Terminé" onPress={() => setManage(false)} /> : <Btn label="Gérer les profils" onPress={() => setManage(true)} ghost />}
        {!manage ? <Btn label="Se déconnecter" onPress={logout} ghost /> : null}
      </View>
    </Screen>
  );
}

function Tile({ label, onPress, badge, muted, children }: { label: string; onPress: () => void; badge?: React.ReactNode; muted?: boolean; children: React.ReactNode }) {
  return (
    <Pressable onPress={onPress} accessibilityLabel={label} style={st.tile}>
      {({ hovered, focused }: any) => {
        const on = hovered || focused;
        return (
          <>
            <View style={[st.ring, on && st.ringOn, { transform: [{ scale: on ? 1.06 : 1 }] }]}>
              {children}
              {badge}
            </View>
            <Text style={[font(600, 17, on ? C.ink : muted ? C.mute : C.soft), { marginTop: 16 }]} numberOfLines={1}>{label}</Text>
          </>
        );
      }}
    </Pressable>
  );
}

/** Pavé à 4 chiffres, utilisable au clavier, à la souris et plus tard à la télécommande. */
export function PinPad({ face, hint = "Entre le code du profil", onPin, onCancel, framed = true }: { face: Face; hint?: string; onPin: (pin: string) => Promise<unknown>; onCancel: () => void; framed?: boolean }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string>();
  const shake = useRef(new Animated.Value(0)).current;
  const press = (k: string) => { setError(undefined); setPin(p => (k === "⌫" ? p.slice(0, -1) : p.length < 4 ? p + k : p)); };
  useEffect(() => {
    if (pin.length !== 4) return;
    onPin(pin).catch((e: Error) => {
      setError(e.message); setPin("");
      Animated.sequence([10, -10, 7, -7, 0].map(x => Animated.timing(shake, { toValue: x, duration: 60, useNativeDriver: Platform.OS !== "web" }))).start();
    });
  }, [pin]);
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const h = (e: KeyboardEvent) => (/^\d$/.test(e.key) ? press(e.key) : e.key === "Backspace" ? press("⌫") : e.key === "Escape" && onCancel());
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, []);
  const body = (
    <View style={{ alignItems: "center", userSelect: "none" } as any}>
      <ProfileAvatar p={face} size={96} />
      <Text style={[font(700, 26), { marginTop: 18 }]}>{face.name}</Text>
      <Text style={[font(400, 15, error ? "#FF8A94" : C.mute), { marginTop: 6, marginBottom: 28 }]}>{error ?? hint}</Text>
      <Animated.View style={{ flexDirection: "row", gap: 16, marginBottom: 36, transform: [{ translateX: shake }] }}>
        {[0, 1, 2, 3].map(i => <View key={i} style={[st.dot, i < pin.length && st.dotOn, error && { borderColor: "#FF8A94" }]} />)}
      </Animated.View>
      <View style={st.pad}>
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].map((k, i) => k ? (
          <Pressable key={i} onPress={() => press(k)} accessibilityLabel={k === "⌫" ? "Effacer" : k} style={({ hovered, focused, pressed }: any) => [st.key, (hovered || focused) && { backgroundColor: "rgba(255,255,255,0.16)" }, pressed && { transform: [{ scale: 0.94 }] }]}>
            {k === "⌫" ? <Svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke={C.ink} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><Path d="M21 5H9l-6 7 6 7h12zM18 9l-6 6M12 9l6 6" /></Svg>
              : <Text style={font(500, 28)}>{k}</Text>}
          </Pressable>
        ) : <View key={i} style={st.keyGhost} />)}
      </View>
      <Pressable onPress={onCancel} style={({ hovered }: any) => [st.link, { marginTop: 28 }, hovered && { backgroundColor: "rgba(255,255,255,0.08)" }]}>
        <Text style={font(500, 15, C.mute)}>Annuler</Text>
      </Pressable>
    </View>
  );
  return framed ? <Screen>{body}</Screen> : body;
}

/** Grille de choix d'avatar (création et réglages du profil). */
export function AvatarGrid({ value, onChange, size = 88 }: { value?: string | null; onChange: (a: (typeof AVATARS)[number]) => void; size?: number }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14 }}>
      {AVATARS.map(a => (
        <Pressable key={a.key} onPress={() => onChange(a)} accessibilityLabel={`Avatar ${a.key}`} style={({ hovered }: any) => [st.pick, a.key === value ? st.pickOn : hovered && { borderColor: "rgba(255,255,255,0.4)" }]}>
          <Image source={a.src} style={{ width: size, height: size, borderRadius: size * 0.2 }} />
        </Pressable>
      ))}
    </View>
  );
}

const Pencil = () => (
  <Svg width={40} height={40} viewBox="0 0 24 24" fill="none" stroke={C.ink} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" />
  </Svg>
);

type PinStep = { step: "current"; then: "change" | "remove" | "delete" } | { step: "new"; current?: string } | null;

/** Modifier un profil déjà ouvert côté serveur : nom, avatar, code, suppression.
 *  Changer ou retirer le code, ou supprimer un profil verrouillé, redemande le code actuel. */
export function ProfileEditor({ profile, onChange, onDeleted }: { profile: Profile; onChange: (p: Profile) => void; onDeleted: () => void }) {
  const [name, setName] = useState(profile.name);
  const [pin, setPin] = useState<PinStep>(null);
  const [confirm, setConfirm] = useState(false);
  const [msg, setMsg] = useState<string>();
  const patch = (b: object) => api<Profile>("/api/profiles", { method: "PATCH", body: JSON.stringify(b) }).then(p => { onChange(p); setMsg(undefined); return p; });
  const remove = (currentPin?: string) => api("/api/profiles", { method: "DELETE", body: JSON.stringify({ currentPin }) }).then(onDeleted);
  const show = (e: Error) => setMsg(e.message);

  if (pin?.step === "current") return (
    <PinPad framed={false} face={profile} hint="Entre le code actuel" onCancel={() => setPin(null)} onPin={code =>
      pin.then === "remove" ? patch({ pin: null, currentPin: code }).then(() => setPin(null))
        : pin.then === "delete" ? remove(code)
          : api("/api/profiles/select", { method: "POST", body: JSON.stringify({ id: profile.id, pin: code }) }).then(() => setPin({ step: "new", current: code }))} />
  );
  if (pin?.step === "new") return (
    <PinPad framed={false} face={profile} hint="Choisis un nouveau code à 4 chiffres" onCancel={() => setPin(null)} onPin={code => patch({ pin: code, currentPin: pin.current }).then(() => setPin(null))} />
  );
  return (
    <View style={{ flexDirection: "row", gap: 28, alignItems: "flex-start" }}>
      <ProfileAvatar p={profile} size={120} />
      <View style={{ flex: 1, gap: 16 }}>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <TextInput value={name} onChangeText={setName} onSubmitEditing={() => patch({ name }).catch(show)} maxLength={20} style={[font(500, 16), st.input, { flex: 1 }]} accessibilityLabel="Nom du profil" />
          <Btn label="Renommer" onPress={() => patch({ name }).catch(show)} ghost />
        </View>
        <AvatarGrid value={profile.avatar} onChange={a => patch({ avatar: a.key, color: a.color }).catch(show)} size={44} />
        <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
          <Btn icon label={profile.locked ? "Changer le code" : "Verrouiller par un code"} onPress={() => setPin(profile.locked ? { step: "current", then: "change" } : { step: "new" })} ghost />
          {profile.locked ? <Btn label="Retirer le code" onPress={() => setPin({ step: "current", then: "remove" })} ghost /> : null}
          {profile.main ? null : confirm
            ? <Btn label="Oui, supprimer (sa reprise aussi)" onPress={() => (profile.locked ? setPin({ step: "current", then: "delete" }) : remove().catch(show))} />
            : <Btn label="Supprimer ce profil" onPress={() => setConfirm(true)} ghost />}
        </View>
        {msg ? <Text style={font(500, 14, "#FF8A94")}>{msg}</Text> : null}
      </View>
    </View>
  );
}

function NewProfile({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState(AVATARS[1]);
  const [withPin, setWithPin] = useState(false);
  const [error, setError] = useState<string>();
  const face = { name: name || "?", color: avatar.color, avatar: avatar.key };
  const create = (pin?: string) => api("/api/profiles", { method: "POST", body: JSON.stringify({ name, color: avatar.color, avatar: avatar.key, pin }) }).then(onDone);
  const next = (pin: boolean) => (!name.trim() ? setError("Donne un nom au profil.") : pin ? setWithPin(true) : create().catch((e: Error) => setError(e.message)));
  if (withPin) return <PinPad face={face} hint="Choisis un code à 4 chiffres" onPin={create} onCancel={() => setWithPin(false)} />;
  return (
    <Screen>
      <View style={st.panel}>
        <Text style={[font(700, 30), { marginBottom: 28 }]}>Nouveau profil</Text>
        <View style={{ flexDirection: "row", gap: 32, alignItems: "flex-start" }}>
          <ProfileAvatar p={face} size={140} />
          <View style={{ flex: 1 }}>
            <Text style={[font(600, 14, C.mute), { marginBottom: 8 }]}>Nom</Text>
            <TextInput value={name} onChangeText={t => { setName(t); setError(undefined); }} onSubmitEditing={() => next(false)} placeholder="Ex. Julie" placeholderTextColor={C.faint} maxLength={20} autoFocus style={[font(500, 17), st.input]} accessibilityLabel="Nom du profil" />
            <Text style={[font(600, 14, C.mute), { marginTop: 22, marginBottom: 12 }]}>Avatar</Text>
            <AvatarGrid value={avatar.key} onChange={setAvatar} size={52} />
          </View>
        </View>
        {error ? <Text style={[font(500, 14, "#FF8A94"), { marginTop: 18 }]}>{error}</Text> : null}
        <View style={{ flexDirection: "row", gap: 12, marginTop: 32, justifyContent: "flex-end" }}>
          <Btn label="Annuler" onPress={onDone} ghost />
          <Btn label="Verrouiller par un code" icon onPress={() => next(true)} ghost />
          <Btn label="Créer le profil" onPress={() => next(false)} />
        </View>
      </View>
    </Screen>
  );
}

function Btn({ label, onPress, ghost, icon }: { label: string; onPress: () => void; ghost?: boolean; icon?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ hovered }: any) => [st.btn, ghost ? { backgroundColor: hovered ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.09)" } : { backgroundColor: C.red, opacity: hovered ? 0.9 : 1 }]}>
      {icon ? <Lock color={C.ink} /> : null}
      <Text style={font(ghost ? 600 : 700, 15)}>{label}</Text>
    </Pressable>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#08080A", overflow: "hidden", padding: 24 },
  brand: { position: "absolute", top: 28, left: 32, flexDirection: "row", alignItems: "center", gap: 10 },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 36, maxWidth: 1000 },
  tile: { width: 184, alignItems: "center" },
  ring: { borderRadius: 40, borderWidth: 3, borderColor: "transparent", padding: 5 },
  ringOn: { borderColor: C.ink },
  editVeil: { position: "absolute", top: 5, left: 5, right: 5, bottom: 5, borderRadius: 34, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" },
  badge: { position: "absolute", right: 0, bottom: 0, width: 38, height: 38, borderRadius: 19, backgroundColor: "#121214", borderWidth: 3, borderColor: "#08080A", alignItems: "center", justifyContent: "center" },
  add: { width: 168, height: 168, borderRadius: 34, backgroundColor: "rgba(255,255,255,0.07)", alignItems: "center", justifyContent: "center" },
  link: { marginTop: 56, paddingVertical: 10, paddingHorizontal: 18, borderRadius: 999 },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: "rgba(255,255,255,0.4)" },
  dotOn: { backgroundColor: C.ink, borderColor: C.ink },
  pad: { width: 3 * 80 + 2 * 18, flexDirection: "row", flexWrap: "wrap", gap: 18 },
  key: { width: 80, height: 80, borderRadius: 40, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center", userSelect: "none" } as any,
  keyGhost: { width: 80, height: 80 },
  panel: { width: "100%", maxWidth: 720, padding: 40, borderRadius: 20, backgroundColor: "rgba(8,8,10,0.72)" },
  input: { height: 52, paddingHorizontal: 16, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.08)", outlineStyle: "none" } as any,
  pick: { borderRadius: 20, borderWidth: 3, borderColor: "transparent", padding: 3 },
  pickOn: { borderColor: C.red },
  btn: { height: 48, paddingHorizontal: 20, borderRadius: 12, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
});
