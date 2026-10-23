// Langues des pistes audio et sous-titres : les fichiers donnent des codes ISO 639-2 (« fre », « jpn »), parfois rien.

const ISO3: Record<string, string> = {
  fre: "fr", fra: "fr", eng: "en", jpn: "ja", ger: "de", deu: "de", spa: "es", ita: "it", por: "pt", rus: "ru", kor: "ko",
  chi: "zh", zho: "zh", ara: "ar", hin: "hi", tur: "tr", pol: "pl", dut: "nl", nld: "nl", swe: "sv", nor: "no", nob: "no",
  dan: "da", fin: "fi", cze: "cs", ces: "cs", hun: "hu", gre: "el", ell: "el", heb: "he", tha: "th", vie: "vi", ind: "id",
  ukr: "uk", rum: "ro", ron: "ro", may: "ms", msa: "ms", per: "fa", fas: "fa", cat: "ca", bul: "bg", hrv: "hr", srp: "sr",
  slo: "sk", slk: "sk", slv: "sl", lit: "lt", lav: "lv", est: "et", ice: "is", isl: "is", fil: "tl", tgl: "tl",
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
