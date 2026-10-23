import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSyncExternalStore } from "react";
import { CINEMETA, fetchManifest, type Addon, type Meta } from "./addons";

// Données locales à l'appareil. Elles passeront par le backend (comptes, synchro) en phase 2.

export type Progress = {
  meta: Pick<Meta, "id" | "type" | "name" | "poster" | "background">;
  videoId: string; label?: string; time: number; duration: number; updatedAt: number;
};
type State = { ready: boolean; addons: Addon[]; progress: Record<string, Progress>; ambiance?: string };

const KEY = "meowwatch:v1";
let state: State = { ready: false, addons: [], progress: {} };
const listeners = new Set<() => void>();

function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  listeners.forEach(l => l());
  if (state.ready) AsyncStorage.setItem(KEY, JSON.stringify({ addons: state.addons, progress: state.progress })).catch(() => {});
}

export function useStore<T>(pick: (s: State) => T): T {
  return useSyncExternalStore(l => (listeners.add(l), () => listeners.delete(l)), () => pick(state), () => pick(state));
}

export async function load() {
  let saved: Partial<State> = {};
  try { saved = JSON.parse((await AsyncStorage.getItem(KEY)) ?? "{}"); } catch { }
  let addons = saved.addons ?? [];
  if (!addons.length) addons = [await fetchManifest(CINEMETA).catch(() => null)].filter((a): a is Addon => !!a);
  set({ ready: true, addons, progress: saved.progress ?? {} });
}

export async function addAddon(input: string) {
  const a = await fetchManifest(input);
  if (state.addons.some(x => x.url === a.url)) throw new Error("Cet addon est déjà installé.");
  set({ addons: [...state.addons, a] });
  return a;
}
export const removeAddon = (url: string) => set({ addons: state.addons.filter(a => a.url !== url) });
export function moveAddon(url: string, dir: -1 | 1) {
  const list = [...state.addons], i = list.findIndex(a => a.url === url), j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  set({ addons: list });
}

/** Une fois vu à 95 %, le titre sort de « Reprendre ». */
export function saveProgress(p: Progress) {
  const progress = { ...state.progress };
  if (p.duration > 0 && p.time / p.duration > 0.95) delete progress[p.meta.id];
  else progress[p.meta.id] = p;
  set({ progress });
}
/** Image floutée derrière toute l'appli (titre sélectionné). */
export const setAmbiance = (ambiance?: string) => ambiance !== state.ambiance && set({ ambiance });
export const getProgress = (id: string): Progress | undefined => state.progress[id];
