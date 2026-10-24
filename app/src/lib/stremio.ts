// Import d'un compte Stremio : connexion « link » (comme les applis TV de Stremio), puis addons et reprise.
// Formats vérifiés dans stremio-core (types/api, types/library) ; les deux services renvoient CORS « * ».
import type { Addon, Manifest } from "./addons";
import type { LibraryItem as Item, Progress } from "./sync";

const LINK = "https://link.stremio.com/api";
const API = "https://api.strem.io/api";

type Envelope<T> = { result?: T | null; error?: { code: number; message: string } | null };
async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  const j = (await r.json()) as Envelope<T>;
  if (!j.result) throw new Error(j.error?.message ?? `Stremio a répondu ${r.status}`);
  return j.result;
}
const post = <T>(method: string, body: object) =>
  call<T>(`${API}/${method}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

/** Étape 1 : un code et la page Stremio où l'utilisateur valide. */
export const createLink = () => call<{ code: string; link: string; qrcode: string }>(`${LINK}/create?type=Create`);

/** Étape 2 : attend la validation (Stremio répond « code invalide » tant que ce n'est pas fait). */
export async function waitForAuth(code: string, { signal, timeoutMs = 5 * 60e3 }: { signal?: AbortSignal; timeoutMs?: number } = {}) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (signal?.aborted) throw new Error("annulé");
    try { const r = await call<{ authKey?: string }>(`${LINK}/read?type=Read&code=${encodeURIComponent(code)}`); if (r.authKey) return r.authKey; } catch { }
    await new Promise(ok => setTimeout(ok, 2500));
  }
  throw new Error("Le code a expiré. Recommence l'import.");
}

type Descriptor = { transportUrl: string; manifest: Manifest; flags?: { official?: boolean; protected?: boolean } };
type LibraryItem = {
  _id: string; name: string; type: string; poster?: string | null; removed: boolean; temp: boolean; _ctime?: string; _mtime: string;
  state: { lastWatched?: string | null; timeOffset: number; duration?: number; video_id?: string | null; timesWatched?: number; flaggedWatched?: number };
};

/** Étape 3 : ce que l'on récupère du compte. La clé Stremio n'est gardée nulle part. */
export async function fetchAccount(authKey: string) {
  const [{ addons }, library] = await Promise.all([
    post<{ addons: Descriptor[] }>("addonCollectionGet", { type: "AddonCollectionGet", authKey, update: true }),
    post<LibraryItem[]>("datastoreGet", { authKey, collection: "libraryItem", ids: [], all: true }),
  ]);
  return { addons: toAddons(addons), progress: toProgress(library), library: toLibrary(library) };
}

/** Addons Stremio → addons Meow Watch (sans les addons locaux de l'appli Stremio, injoignables d'ici). */
export const toAddons = (list: Descriptor[]): Addon[] =>
  list.filter(d => d.transportUrl && d.manifest?.id && !/^https?:\/\/(127\.0\.0\.1|localhost)/.test(d.transportUrl))
    .map(d => ({ url: d.transportUrl, manifest: d.manifest }));

const episode = (videoId?: string | null) => { const m = videoId?.match(/:(\d+):(\d+)$/); return m ? `S${m[1]} · É${m[2]}` : undefined; };

/** Bibliothèque Stremio → reprise, avec la règle de « Continuer à regarder » de Stremio
 *  (stremio-core, LibraryItem::is_in_continue_watching) : commencé, et pas retiré sauf s'il est « temp »
 *  (vu sans être ajouté à la bibliothèque). La durée peut être inconnue (0). */
export const toProgress = (items: LibraryItem[]): Progress[] =>
  items.filter(i => i.type !== "other" && (!i.removed || i.temp) && i.state?.timeOffset > 0)
    .map(i => ({
      meta: { id: i._id, type: i.type, name: i.name, poster: i.poster || undefined },
      videoId: i.state.video_id || i._id,
      label: episode(i.state.video_id),
      time: i.state.timeOffset / 1000,
      duration: (i.state.duration || 0) / 1000,
      updatedAt: Date.parse(i.state.lastWatched || i._mtime) || Date.now(),
    }));

/** Bibliothèque Stremio → bibliothèque Meow Watch : les titres ajoutés et pas retirés (« temp » = seulement vus).
 *  Vu : coché « vu » dans Stremio, ou film vu jusqu'au bout (pour une série, timesWatched compte un seul épisode). */
export const toLibrary = (items: LibraryItem[]): Item[] =>
  items.filter(i => i.type !== "other" && !i.removed && !i.temp)
    .map(i => {
      const addedAt = Date.parse(i._ctime || i._mtime) || Date.now();
      const watched = !!i.state?.flaggedWatched || (i.type === "movie" && !!i.state?.timesWatched);
      return { meta: { id: i._id, type: i.type, name: i.name, poster: i.poster || undefined }, addedAt, updatedAt: addedAt, ...(watched && { watched }) };
    });

/** Ajoute les addons importés après ceux déjà installés, sans doublon. */
export const mergeAddons = (mine: Addon[], theirs: Addon[]) => {
  const have = new Set(mine.map(a => a.url));
  const added = theirs.filter(a => !have.has(a.url));
  return { addons: [...mine, ...added], added };
};
