// Repères d'un épisode : intro (bouton « Passer l'intro ») et début du générique de fin (carte « Épisode suivant »).
// D'abord les chapitres nommés du fichier, sinon les bases communautaires : TheIntroDB (séries et films, par identifiant
// IMDb), AniSkip (animés Kitsu).

export type Chapter = { title: string; start: number };
export type Markers = { intro?: [number, number]; recap?: [number, number]; credits?: number };

const INTRO = /^(op|opening|intro|introduction|ouverture|g[ée]n[ée]rique (de )?d[ée]but)\b/i;
const CREDITS = /^(ed|ending|credits?|end credits|outro|g[ée]n[ée]rique( de fin)?)\b/i;
const GENERIC = /^g[ée]n[ée]rique$/i; // « Générique » seul : intro au début, générique de fin à la fin

export function fromChapters(chapters: Chapter[], duration: number): Markers {
  const m: Markers = {};
  chapters.forEach((c, i) => {
    const t = c.title.trim(), end = chapters[i + 1]?.start ?? duration;
    if (!m.intro && c.start < duration * 0.4 && (INTRO.test(t) || GENERIC.test(t)) && end > c.start) m.intro = [c.start, end];
    else if (m.credits === undefined && c.start > duration * 0.6 && CREDITS.test(t)) m.credits = c.start;
  });
  return m;
}

const json = async (url: string) => { const r = await fetch(url, { signal: AbortSignal.timeout(8000) }); if (!r.ok) throw new Error(String(r.status)); return r.json(); };

/** Épisode d'un addon Kitsu (« kitsu:1:2 ») : identifiant MyAnimeList par Kitsu, puis opening / ending par AniSkip. */
export async function fromAniSkip(videoId: string): Promise<Markers> {
  const id = /^kitsu:(\d+):(\d+)$/.exec(videoId);
  if (!id) return {};
  const map = await json(`https://kitsu.io/api/edge/anime/${id[1]}/mappings?filter[externalSite]=myanimelist/anime`);
  const mal = map.data?.[0]?.attributes?.externalId;
  if (!mal) return {};
  // ponytail: horaires donnés pour la durée d'épisode la plus courante ; une release avec un récap en plus serait décalée.
  const r = await json(`https://api.aniskip.com/v2/skip-times/${mal}/${id[2]}?types[]=op&types[]=ed&episodeLength=0`);
  const of = (type: string) => r.results?.find((x: any) => x.skipType === type)?.interval;
  const op = of("op"), ed = of("ed");
  return { ...(op && { intro: [op.startTime, op.endTime] as [number, number] }), ...(ed && { credits: ed.startTime }) };
}

/** Film (« tt… ») ou épisode (« tt…:saison:épisode ») : intro, récap et générique de fin par TheIntroDB. */
export async function fromIntroDb(videoId: string): Promise<Markers> {
  const id = /^(tt\d+)(?::(\d+):(\d+))?$/.exec(videoId);
  if (!id) return {};
  const r = await json(`https://api.theintrodb.org/v4/media?imdb_id=${id[1]}${id[2] ? `&season=${id[2]}&episode=${id[3]}` : ""}`);
  const span = (x: any): [number, number] | undefined => (x?.end_ms ? [(x.start_ms ?? 0) / 1000, x.end_ms / 1000] : undefined);
  const intro = span(r.intro?.[0]), recap = span(r.recap?.[0]), credits = r.credits?.[0]?.start_ms;
  return { ...(intro && { intro }), ...(recap && { recap }), ...(credits && { credits: credits / 1000 }) };
}
