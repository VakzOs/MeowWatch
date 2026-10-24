import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSyncExternalStore } from "react";
import { CINEMETA, fetchManifest, isAdultAddon, type Addon } from "./addons";
import { api, type Profile, type User } from "./api";
import { mergeAddons } from "./stremio";
import { isDone, mergeNewest, type LibraryItem, type Progress } from "./sync";
import type { Meta } from "./addons";

export type { LibraryItem, Progress };

// Les addons (communs au compte), la reprise et la bibliothèque (propres au profil) vivent sur le serveur ;
// l'appareil en garde une copie pour démarrer vite et tenir si le réseau saute.
export type Lang = "fr-FR" | "en";
type State = { lang: Lang; ready: boolean; addons: Addon[]; progress: Record<string, Progress>; library: Record<string, LibraryItem>; ambiance?: string; user?: User | null; lastSync?: number; query: string };

const LEGACY_KEY = "meowwatch:v1"; // avant la synchro : données sans compte
let state: State = { lang: "fr-FR", ready: false, addons: [], progress: {}, library: {}, query: "" };
const listeners = new Set<() => void>();
const key = () => `meowwatch:v1:${state.user?.id}:${state.user?.profile?.id}`;

function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  listeners.forEach(l => l());
  if (state.user?.profile && ("addons" in patch || "progress" in patch || "library" in patch))
    AsyncStorage.setItem(key(), JSON.stringify({ addons: state.addons, progress: state.progress, library: state.library })).catch(() => {});
}

export function useStore<T>(pick: (s: State) => T): T {
  return useSyncExternalStore(l => (listeners.add(l), () => listeners.delete(l)), () => pick(state), () => pick(state));
}

/** Addons vus par le profil ouvert : sans ceux pour adultes s'il les masque (Réglages > Contenu adulte).
 *  Mémorisé : useSyncExternalStore exige le même tableau tant que rien ne change. */
let seen: { addons?: Addon[]; hide?: boolean; out: Addon[] } = { out: [] };
export function visibleAddons(s: State): Addon[] {
  const hide = s.user?.profile?.prefs?.adult === false;
  if (seen.addons !== s.addons || seen.hide !== hide) seen = { addons: s.addons, hide, out: hide ? s.addons.filter(a => !isAdultAddon(a.manifest)) : s.addons };
  return seen.out;
}

const readJSON = async (k: string) => { try { return JSON.parse((await AsyncStorage.getItem(k)) ?? "null"); } catch { return null; } };

/** Langue des fiches (choix de l'appareil) : français via TMDB, ou anglais (Cinemeta tel quel). */
export function setLang(lang: Lang) { set({ lang }); AsyncStorage.setItem("meowwatch:lang", lang).catch(() => {}); }

export async function load() {
  const lang = await AsyncStorage.getItem("meowwatch:lang").catch(() => null);
  if (lang === "en" || lang === "fr-FR") state.lang = lang;
  const user = await api<User>("/api/auth/me").catch(() => null);
  if (user?.profile) await open(user);
  set({ ready: true, user, ...(!user?.profile && { addons: [], progress: {}, library: {} }) });
}

/** Ouvre le profil de `user` : copie locale d'abord, puis le serveur. */
async function open(user: User) {
  state.user = user;
  let local = await readJSON(key());
  if (!local) { local = await readJSON(LEGACY_KEY); AsyncStorage.removeItem(LEGACY_KEY).catch(() => {}); }
  set({ user, addons: local?.addons ?? [], progress: local?.progress ?? {}, library: local?.library ?? {} });
  await pull(true);
  if (!state.addons.length) await saveAddons([await fetchManifest(CINEMETA).catch(() => null)].filter((a): a is Addon => !!a));
}

/** « Qui regarde ? » : ouvre un profil (avec son code s'il est verrouillé). */
export async function selectProfile(id: string, pin?: string) {
  const profile = await api<Profile>("/api/profiles/select", { method: "POST", body: JSON.stringify({ id, pin }) });
  await open({ ...state.user!, profile });
}
export async function leaveProfile() {
  await api("/api/profiles/leave", { method: "POST" }).catch(() => {});
  set({ user: { ...state.user!, profile: null }, addons: [], progress: {}, library: {}, ambiance: undefined });
}
export const updateProfile = (profile: Profile) => set({ user: { ...state.user!, profile } });

/** Récupère l'état du serveur et y renvoie ce que cet appareil a de plus récent. */
export async function pull(first = false) {
  if (!state.user?.profile) return false;
  let remote: { addons: Addon[] | null; progress: Progress[]; library?: LibraryItem[] };
  try { remote = await api("/api/sync"); } catch { return false; } // hors ligne : on garde la copie locale
  // Première synchro de ce compte : les addons de l'appareil deviennent ceux du compte.
  if (remote.addons === null) { if (first && state.addons.length) await saveAddons(state.addons); }
  else if (JSON.stringify(remote.addons) !== JSON.stringify(state.addons)) set({ addons: remote.addons });
  const { merged, toPush } = mergeNewest(state.progress, remote.progress);
  const lib = mergeNewest(state.library, remote.library ?? []);
  set({ progress: merged, library: lib.merged, lastSync: Date.now() });
  toPush.forEach(push);
  if (lib.toPush.length) pushLibrary(lib.toPush);
  return true;
}

const pushLibrary = (items: LibraryItem[]) => api("/api/sync/library", { method: "PUT", body: JSON.stringify(items) }).catch(() => {});
const push = (p: Progress) => api("/api/sync/progress", { method: "PUT", body: JSON.stringify(p) }).catch(() => {});
async function saveAddons(addons: Addon[]) {
  set({ addons });
  await api("/api/sync/addons", { method: "PUT", body: JSON.stringify({ addons }) }).catch(() => {});
}

export async function logout() {
  await api("/api/auth/logout", { method: "POST" }).catch(() => {});
  set({ user: null, addons: [], progress: {}, library: {} });
}

/** Installe un addon ; s'il existe déjà (même identifiant), le remplace à sa place : c'est un nouveau réglage. */
export async function addAddon(input: string) {
  const a = await fetchManifest(input);
  if (state.addons.some(x => x.url === a.url)) throw new Error("Cet addon est déjà installé avec ces réglages.");
  const i = state.addons.findIndex(x => x.manifest.id === a.manifest.id);
  await saveAddons(i < 0 ? [...state.addons, a] : state.addons.map((x, j) => (j === i ? a : x)));
  return { addon: a, updated: i >= 0 };
}
export const removeAddon = (url: string) => saveAddons(state.addons.filter(a => a.url !== url));
export function moveAddon(url: string, dir: -1 | 1) {
  const list = [...state.addons], i = list.findIndex(a => a.url === url), j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  saveAddons(list);
}

/** Enregistre la position (toutes les 5 s pendant la lecture) ; à 95 %, le titre sort de « Reprendre ». */
export function saveProgress(p: Progress) {
  const entry = { ...p, done: isDone(p) };
  set({ progress: { ...state.progress, [p.meta.id]: entry } });
  push(entry);
}
/** Retire le titre de l'historique (« Reprendre », « Vu récemment ») sur tous les appareils du profil. */
export function removeProgress(id: string) {
  const p = state.progress[id];
  if (!p) return;
  const entry = { ...p, done: true, removed: true, updatedAt: Date.now() };
  set({ progress: { ...state.progress, [id]: entry } });
  push(entry);
}
/** Import Stremio : addons ajoutés au compte, reprises plus récentes et titres de la bibliothèque ajoutés au profil ouvert. */
export async function importFromStremio(data: { addons: Addon[]; progress: Progress[]; library: LibraryItem[] }) {
  const { addons, added } = mergeAddons(state.addons, data.addons);
  if (added.length) await saveAddons(addons);
  const { merged, toPush } = mergeNewest(Object.fromEntries(data.progress.map(p => [p.meta.id, p])), Object.values(state.progress));
  // Un titre déjà présent (ou retiré exprès) ici n'est pas réimporté.
  const newItems = data.library.filter(i => !state.library[i.meta.id]);
  set({ progress: merged, library: { ...state.library, ...Object.fromEntries(newItems.map(i => [i.meta.id, i])) } });
  await Promise.all([...toPush.map(push), newItems.length && pushLibrary(newItems)]);
  return { addons: added.length, progress: toPush.length, library: newItems.length };
}

/** Ajoute le titre à la bibliothèque du profil, ou l'en retire. */
export function toggleLibrary(meta: Meta) {
  const cur = state.library[meta.id], now = Date.now();
  const item: LibraryItem = cur && !cur.removed ? { ...cur, removed: true, updatedAt: now }
    : { meta: { id: meta.id, type: meta.type, name: meta.name, poster: meta.poster, background: meta.background, releaseInfo: meta.releaseInfo }, addedAt: now, updatedAt: now };
  set({ library: { ...state.library, [meta.id]: item } });
  pushLibrary([item]);
}
/** Coche ou décoche « Vu » sur un titre de la bibliothèque. */
export function toggleWatched(id: string) {
  const cur = state.library[id];
  if (!cur) return;
  const item: LibraryItem = { ...cur, watched: !cur.watched, updatedAt: Date.now() };
  set({ library: { ...state.library, [id]: item } });
  pushLibrary([item]);
}
/** Recherche de l'accueil (dans la barre du haut de l'appli Windows). */
export const setQuery = (query: string) => set({ query });
/** Image floutée derrière toute l'appli (titre sélectionné). */
export const setAmbiance = (ambiance?: string) => ambiance !== state.ambiance && set({ ambiance });
export const getProgress = (id: string): Progress | undefined => { const p = state.progress[id]; return p && !p.done ? p : undefined; };
