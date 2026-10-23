// Protocole des addons Stremio : https://github.com/Stremio/stremio-addon-sdk/blob/master/docs/protocol.md

export type Extra = { name: string; isRequired?: boolean; options?: string[] };
export type Catalog = { type: string; id: string; name?: string; extra?: Extra[]; extraRequired?: string[]; extraSupported?: string[] };
export type Resource = string | { name: string; types?: string[]; idPrefixes?: string[] };
export type Manifest = {
  id: string; name: string; version?: string; description?: string; logo?: string;
  types?: string[]; idPrefixes?: string[]; resources?: Resource[]; catalogs?: Catalog[];
  behaviorHints?: { configurable?: boolean; configurationRequired?: boolean };
};
export type Addon = { url: string; manifest: Manifest };

export type Video = { id: string; title?: string; name?: string; season?: number; episode?: number; released?: string; thumbnail?: string; overview?: string;
  imdb_id?: string; imdbSeason?: number; imdbEpisode?: number }; // correspondance IMDb fournie par les addons d'animés (Kitsu)
export type Meta = {
  id: string; type: string; name: string; poster?: string; background?: string; logo?: string;
  description?: string; releaseInfo?: string; imdbRating?: string; genres?: string[]; runtime?: string; videos?: Video[];
  imdb_id?: string; cast?: string[]; director?: string[]; trailerStreams?: { ytId: string; title?: string }[];
};
export type Stream = {
  url?: string; infoHash?: string; ytId?: string; externalUrl?: string;
  name?: string; title?: string; description?: string;
  behaviorHints?: { notWebReady?: boolean; filename?: string; videoSize?: number; bingeGroup?: string };
};

export const CINEMETA = "https://v3-cinemeta.strem.io/manifest.json";

/** Accepte une URL d'addon telle qu'on la copie (stremio://, avec ou sans /manifest.json). */
export function normalizeUrl(input: string): string {
  let u = input.trim().replace(/^stremio:\/\//i, "https://");
  if (!/^https?:\/\//i.test(u)) u = "https://" + u;
  u = u.replace(/\/+$/, "");
  return u.endsWith("/manifest.json") ? u : u + "/manifest.json";
}

const base = (a: Addon) => a.url.replace(/\/manifest\.json$/, "");
/** Page de réglages d'un addon configurable (convention Stremio : <base>/configure). */
export const configureUrl = (a: Addon) => (a.manifest.behaviorHints?.configurable || a.manifest.behaviorHints?.configurationRequired ? `${base(a)}/configure` : null);

/** L'addon sait-il répondre à `resource` pour ce type et cet identifiant ? */
export function supports(m: Manifest, resource: string, type: string, id?: string): boolean {
  for (const r of m.resources ?? []) {
    const name = typeof r === "string" ? r : r.name;
    if (name !== resource) continue;
    const types = (typeof r === "object" && r.types) || m.types || [];
    const prefixes = (typeof r === "object" && r.idPrefixes) || m.idPrefixes;
    if (!types.includes(type)) continue;
    if (id && prefixes?.length && !prefixes.some(p => id.startsWith(p))) continue;
    return true;
  }
  return false;
}

const required = (c: Catalog) => [...(c.extra ?? []).filter(e => e.isRequired).map(e => e.name), ...(c.extraRequired ?? [])];
const hasExtra = (c: Catalog, name: string) => (c.extra ?? []).some(e => e.name === name) || (c.extraSupported ?? []).includes(name);

/** Catalogues affichables tels quels sur l'accueil (aucun paramètre obligatoire). */
export const homeCatalogs = (addons: Addon[]) =>
  addons.flatMap(a => (a.manifest.catalogs ?? []).filter(c => required(c).length === 0).map(c => ({ addon: a, catalog: c })));

/** Catalogues qui acceptent une recherche. */
export const searchCatalogs = (addons: Addon[]) =>
  addons.flatMap(a => (a.manifest.catalogs ?? []).filter(c => hasExtra(c, "search") && required(c).every(n => n === "search")).map(c => ({ addon: a, catalog: c })));

/** Catalogues parcourables dans Découvrir : sans paramètre obligatoire, ou avec seulement un genre à choisir. */
export const discoverCatalogs = (addons: Addon[]) =>
  addons.flatMap(a => (a.manifest.catalogs ?? []).filter(c => {
    const req = required(c);
    return req.every(n => n === "genre") && (!req.length || genreOptions(c).length > 0);
  }).map(c => ({ addon: a, catalog: c })));
export const genreOptions = (c: Catalog) => (c.extra ?? []).find(e => e.name === "genre")?.options ?? [];
export const genreRequired = (c: Catalog) => required(c).includes("genre");
export const canSkip = (c: Catalog) => hasExtra(c, "skip");

export function catalogUrl(a: Addon, c: Catalog, extra?: Record<string, string>): string {
  const e = extra && Object.entries(extra).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
  return `${base(a)}/catalog/${c.type}/${encodeURIComponent(c.id)}${e ? "/" + e : ""}.json`;
}
export const resourceUrl = (a: Addon, resource: "meta" | "stream", type: string, id: string) =>
  `${base(a)}/${resource}/${type}/${encodeURIComponent(id)}.json`;

// Une seule requête par URL, même si plusieurs écrans la demandent.
const cache = new Map<string, Promise<any>>();
export function getJSON<T = any>(url: string): Promise<T> {
  if (!cache.has(url)) {
    const p = fetch(url).then(r => { if (!r.ok) throw new Error(`${r.status} ${url}`); return r.json(); });
    p.catch(() => cache.delete(url));
    cache.set(url, p);
  }
  return cache.get(url)!;
}

export async function fetchManifest(input: string): Promise<Addon> {
  const url = normalizeUrl(input);
  const manifest = await getJSON<Manifest>(url);
  if (!manifest?.id || !manifest?.name) throw new Error("Ce lien ne renvoie pas un manifeste d'addon Stremio.");
  return { url, manifest };
}

export async function fetchCatalog(a: Addon, c: Catalog, extra?: Record<string, string>): Promise<Meta[]> {
  const r = await getJSON<{ metas?: Meta[] }>(catalogUrl(a, c, extra));
  return r.metas ?? [];
}

/** La fiche complète, auprès du premier addon qui la fournit. */
export async function fetchMeta(addons: Addon[], type: string, id: string): Promise<Meta | null> {
  for (const a of addons.filter(a => supports(a.manifest, "meta", type, id))) {
    try { const r = await getJSON<{ meta?: Meta }>(resourceUrl(a, "meta", type, id)); if (r.meta) return r.meta; } catch { }
  }
  return null;
}

export type FoundStream = Stream & { addon: string };

/** Les flux de tous les addons, dans l'ordre des addons puis de leurs réponses. */
export async function fetchStreams(addons: Addon[], type: string, id: string): Promise<FoundStream[]> {
  const lists = await Promise.all(addons.filter(a => supports(a.manifest, "stream", type, id)).map(a =>
    getJSON<{ streams?: Stream[] }>(resourceUrl(a, "stream", type, id))
      .then(r => (r.streams ?? []).map(s => ({ ...s, addon: a.manifest.name })))
      .catch(() => [] as FoundStream[])));
  return lists.flat();
}

/** Équivalent IMDb d'un titre ou d'un épisode d'un autre catalogue (Kitsu…), pour les addons de flux qui ne
 *  connaissent que les identifiants tt… (comme Stremio le fait avec les correspondances de l'addon Kitsu). */
export function imdbEquivalent(meta: Pick<Meta, "id" | "imdb_id">, video?: Video | null): { type: string; id: string } | null {
  if (meta.id.startsWith("tt")) return null;
  const imdb = video?.imdb_id ?? meta.imdb_id;
  if (!imdb?.startsWith("tt")) return null;
  if (video && video.imdbSeason != null && video.imdbEpisode != null) return { type: "series", id: `${imdb}:${video.imdbSeason}:${video.imdbEpisode}` };
  return video && video.id !== meta.id ? null : { type: "movie", id: imdb };
}

/** Flux de l'identifiant d'origine et de son équivalent IMDb, sans doublon : lisibles d'abord, avis des addons ensuite. */
export async function fetchStreamsFor(addons: Addon[], type: string, id: string, alt: { type: string; id: string } | null) {
  const [own, other] = await Promise.all([fetchStreams(addons, type, id), alt ? fetchStreams(addons, alt.type, alt.id) : []]);
  const seen = new Set<string>(), all = [...own, ...other].filter(s => !s.url || (!seen.has(s.url) && seen.add(s.url)));
  return [...all.filter(s => s.url), ...all.filter(s => !s.url)];
}

// --- Présentation d'un flux ---------------------------------------------------

const clean = (s = "") => s.replace(/\p{Extended_Pictographic}|️/gu, "").replace(/[ \t]+/g, " ").trim();
const SIZE = /(\d+(?:[.,]\d+)?)\s?(GB|MB|Go|Mo|GiB|MiB)\b(?!\/s)/i; // pas un débit (« 29 Mb/s »)

// Repères lus dans le texte et le nom du fichier, dans l'ordre d'affichage. Le premier qui correspond dans un groupe gagne.
const TAGS: [RegExp, string][][] = [
  [[/\b(2160p|4k|uhd)\b/i, "4K"], [/\b1440p\b/i, "1440p"], [/\b1080p\b/i, "1080p"], [/\b720p\b/i, "720p"], [/\b(576|480)p\b/i, "SD"]],
  [[/\bremux\b/i, "REMUX"], [/\bblu-?ray\b/i, "BluRay"], [/\bweb-?dl\b/i, "WEB-DL"], [/\bweb-?rip\b/i, "WEBRip"], [/\bbr-?rip\b/i, "BRRip"], [/\bhdtv\b/i, "HDTV"]],
  [[/\b(dv|dovi|dolby ?vision)\b/i, "Dolby Vision"], [/\bhdr10\+/i, "HDR10+"], [/\bhdr(10)?\b/i, "HDR"]],
  [[/\b(hevc|[xh]\.?265)\b/i, "HEVC"], [/\bav1\b/i, "AV1"], [/\b(avc|[xh]\.?264)\b/i, "H264"]],
  [[/\batmos\b/i, "Atmos"], [/\btrue-?hd\b/i, "TrueHD"], [/\bdts-?hd[ .-]?ma\b/i, "DTS-HD MA"], [/\bdts(-?x)?\b/i, "DTS"], [/\b(ddp|dd\+|e-?ac-?3)/i, "DD+"], [/\b(ac-?3|DD)\b/, "AC3"], [/\bflac\b/i, "FLAC"], [/\b(aac|opus)\b/i, "AAC"]],
];
const FR_WORDS = /\b(vff|vfq|vfi|vf2|truefrench|french|vostfr)\b/i;

/** Pastilles (qualité, source, HDR, codec, audio, débit) et langues (codes pays des drapeaux) d'un flux. */
export function streamTags(s: Pick<Stream, "name" | "title" | "description" | "behaviorHints">) {
  const raw = [s.name, s.title ?? s.description, s.behaviorHints?.filename].filter(Boolean).join("\n");
  const chips = TAGS.map(group => group.find(([re]) => re.test(raw))?.[1]).filter((t): t is string => !!t);
  const ch = raw.match(/\b([257]\.1|2\.0)\b/)?.[1];
  if (ch && chips.length && /Atmos|TrueHD|DTS|DD|AC3|FLAC|AAC/.test(chips[chips.length - 1])) chips[chips.length - 1] += ` ${ch}`;
  const rate = raw.match(/~?\d+(?:[.,]\d+)?\s?Mb\/s/i)?.[0];
  if (rate) chips.push(rate.replace(/\s/, " "));
  // Drapeaux : deux « lettres régionales » Unicode → code pays (Windows les affiche en lettres, d'où les images).
  const langs = [...raw.matchAll(/([\u{1F1E6}-\u{1F1FF}])([\u{1F1E6}-\u{1F1FF}])/gu)].map(m => String.fromCharCode(...[m[1], m[2]].map(c => c.codePointAt(0)! - 0x1F1E6 + 97)));
  if (FR_WORDS.test(raw)) langs.unshift("fr");
  return { chips, langs: [...new Set(langs)], multi: /\bmulti\b/i.test(raw) };
}

/** Ce qu'on affiche d'un flux : qualité, source, détails (le reste du texte de l'addon, comme Stremio), taille, et s'il est lisible (debrid/HTTP). */
export function describe(s: FoundStream) {
  const nameLines = clean(s.name).split("\n").map(l => l.trim()).filter(Boolean);
  const text = clean(s.title ?? s.description);
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  const size = (s.behaviorHints?.videoSize ? formatSize(s.behaviorHints.videoSize) : text.match(SIZE)?.slice(1).join(" ").replace(/GB|GiB/i, "Go").replace(/MB|MiB/i, "Mo")) || "";
  const file = s.behaviorHints?.filename;
  return {
    quality: nameLines.slice(1).join(" · ") || nameLines[0] || "Flux",
    source: [nameLines.length > 1 ? nameLines[0] : s.addon, lines[0]].filter(Boolean).join(" · "),
    details: [...lines.slice(1), ...(file && !text.includes(file) ? [file] : [])],
    file: file ?? lines.find(l => /\.(mkv|mp4|avi|m2ts|ts|webm)$/i.test(l)),
    ...streamTags(s),
    size,
    playable: !!s.url,
    external: !s.url && !!s.externalUrl,
  };
}

export const formatSize = (bytes: number) => bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1).replace(".", ",")} Go` : `${Math.round(bytes / 1e6)} Mo`;
