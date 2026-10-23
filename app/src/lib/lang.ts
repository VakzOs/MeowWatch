// Langues des pistes audio et sous-titres : les fichiers donnent des codes ISO 639-2 (« fre », « jpn »), parfois rien.

const ISO3: Record<string, string> = {
  fre: "fr", fra: "fr", eng: "en", jpn: "ja", ger: "de", deu: "de", spa: "es", ita: "it", por: "pt", rus: "ru", kor: "ko",
  chi: "zh", zho: "zh", ara: "ar", hin: "hi", tur: "tr", pol: "pl", dut: "nl", nld: "nl", swe: "sv", nor: "no", nob: "no",
  dan: "da", fin: "fi", cze: "cs", ces: "cs", hun: "hu", gre: "el", ell: "el", heb: "he", tha: "th", vie: "vi", ind: "id",
  ukr: "uk", rum: "ro", ron: "ro", may: "ms", msa: "ms", per: "fa", fas: "fa", cat: "ca", bul: "bg", hrv: "hr", srp: "sr",
  slo: "sk", slk: "sk", slv: "sl", lit: "lt", lav: "lv", est: "et", ice: "is", isl: "is", fil: "tl", tgl: "tl",
  pob: "pt", pb: "pt", zhe: "zh", zht: "zh", zhs: "zh", ze: "zh", scc: "sr", mne: "sr", // codes propres à OpenSubtitles
};
// Quand le fichier ne donne pas de code, le titre de la piste le dit souvent.
const BY_TITLE: [RegExp, string][] = [
  [/fran[cç]ais|french|\bvff?\b|\bvfq\b|truefrench/i, "fr"], [/english|anglais/i, "en"], [/japanese|japonais/i, "ja"],
  [/espa[nñ]ol|spanish|espagnol|castellano/i, "es"], [/deutsch|german|allemand/i, "de"], [/italian|italien/i, "it"], [/korean|cor[ée]en/i, "ko"],
];

/** Code ISO 639-1 (« fr ») d'une piste, ou "" si inconnu. */
export function langCode(raw?: string, title?: string): string {
  const s = (raw ?? "").toLowerCase().trim().split(/[-_]/)[0];
  const code = s.length === 2 ? s : ISO3[s] ?? "";
  return code || (title ? BY_TITLE.find(([re]) => re.test(title))?.[1] ?? "" : "");
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
let names: Intl.DisplayNames | null = null;
/** « fr » → « Français ». */
export function langName(code: string): string {
  if (!code) return "Langue inconnue";
  try { return cap((names ??= new Intl.DisplayNames(["fr"], { type: "language" })).of(code) ?? code); } catch { return code.toUpperCase(); }
}

// Drapeau (code pays de flagcdn.com) d'une langue : souvent le même code, sinon le pays le plus parlant.
const FLAG: Record<string, string> = { en: "gb", ja: "jp", ko: "kr", zh: "cn", ar: "sa", hi: "in", he: "il", el: "gr", cs: "cz", da: "dk", sv: "se", uk: "ua", vi: "vn", fa: "ir", ms: "my", tl: "ph", sl: "si", et: "ee", ca: "es" };
export const flagOf = (code: string) => (code ? FLAG[code] ?? code : "");

/** Libellé d'une piste : « Japonais · Signs & Songs », sans répéter la langue si le titre la redit. */
export function trackLabel(code: string, title?: string, extras: string[] = []) {
  const name = langName(code);
  const t = title?.trim();
  const showTitle = t && langCode("", t) !== code && t.toLowerCase() !== name.toLowerCase();
  return [name, showTitle ? t : "", ...extras].filter(Boolean).join(" · ");
}

// --- Langues préférées d'un profil ---------------------------------------------------------------

/** audio : code de langue, ou "vo" (piste par défaut du fichier). subs : code de langue, ou "" (désactivés).
 *  audio2 / subs2 : second choix si le premier n'est pas dans le fichier ("" : aucun). */
export type LangChoice = { audio: string; subs: string; audio2?: string; subs2?: string };
export type LangPrefs = { films: LangChoice; animes: LangChoice };
/** Par défaut : films et séries en français sans sous-titres ; animés en japonais sous-titrés en français. */
/** Animé : addon d'animés (Kitsu), ou animation japonaise (pays donné par Cinemeta, sinon langue originale TMDB). */
export function isAnime(type: string, id: string, genres: string[] = [], country = "", originalLanguage = "") {
  return type === "anime" || id.startsWith("kitsu:") || (genres.some(g => /anim/i.test(g)) && (/japan|japon/i.test(country) || originalLanguage === "ja"));
}

export const DEFAULT_PREFS: LangPrefs = { films: { audio: "fr", audio2: "vo", subs: "", subs2: "" }, animes: { audio: "ja", audio2: "fr", subs: "fr", subs2: "en" } };

type T = { id: number; lang: string; forced?: boolean };
/** Pistes à choisir au lancement. Sous-titres : ceux du fichier d'abord, sinon ceux des addons (ext). Sans sous-titres
 *  voulus, on garde les « forcés » dans la langue de l'audio (passages dans une autre langue). */
export function chooseTracks(choice: LangChoice, audio: T[], audioId: number, subs: T[], ext: { lang: string }[]) {
  // Premier choix, sinon second ; « vo » (ou rien trouvé) garde la piste par défaut.
  let a: T | undefined;
  for (const l of [choice.audio, choice.audio2]) { if (!l || l === "vo") break; if ((a = audio.find(t => t.lang === l))) break; }
  const heard = (a ?? audio.find(t => t.id === audioId))?.lang ?? "";
  let sub: { id: number } | { ext: number } | null = null;
  if (choice.subs) {
    for (const l of [choice.subs, choice.subs2].filter(Boolean)) {
      const own = subs.find(t => t.lang === l && !t.forced), e = ext.findIndex(t => t.lang === l);
      sub = own ? { id: own.id } : e >= 0 ? { ext: e } : null;
      if (sub) break;
    }
  } else {
    const forced = subs.find(t => t.forced && t.lang === heard);
    sub = forced ? { id: forced.id } : null;
  }
  return { audio: a?.id, sub };
}

// --- Sous-titres des addons ------------------------------------------------------------------------

export type Cue = { start: number; end: number; text: string };
const secs = (t: string) => t.split(":").reduce((acc, x) => acc * 60 + parseFloat(x.replace(",", ".")), 0);
/** Répliques d'un fichier WebVTT (balises de mise en forme retirées). */
export function parseVtt(vtt: string): Cue[] {
  return vtt.replace(/\r/g, "").split(/\n{2,}/).flatMap(block => {
    const lines = block.split("\n"), i = lines.findIndex(l => l.includes("-->"));
    if (i < 0) return [];
    const [a, b] = lines[i].split("-->").map(x => x.trim().split(/\s+/)[0]);
    const text = lines.slice(i + 1).join("\n").replace(/<[^>]+>/g, "").replace(/\{\\[^}]*\}/g, "").trim();
    return text ? [{ start: secs(a), end: secs(b), text }] : [];
  });
}

