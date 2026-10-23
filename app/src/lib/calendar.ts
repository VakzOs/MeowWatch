import type { Meta, Video } from "./addons";

export type CalEpisode = { meta: Meta; video: Video; date: Date };

/** Clé d'un jour en heure locale (les dates de sortie des addons sont en UTC, minuit). */
export const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Les 6 semaines (lundi en premier) qui couvrent le mois `month` (0 à 11). */
export function monthGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1), offset = (first.getDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, i) => new Date(year, month, 1 - offset + i));
}

/** Épisodes des séries sortis entre `from` et `to` (exclu), rangés par jour puis par série. */
export function episodesByDay(metas: Meta[], from: Date, to: Date): Record<string, CalEpisode[]> {
  const out: Record<string, CalEpisode[]> = {};
  for (const meta of metas) for (const video of meta.videos ?? []) {
    const date = video.released ? new Date(video.released) : null;
    if (!date || isNaN(+date) || date < from || date >= to) continue;
    (out[dayKey(date)] ??= []).push({ meta, video, date });
  }
  for (const k in out) out[k].sort((a, b) => a.meta.name.localeCompare(b.meta.name, "fr") || (a.video.episode ?? 0) - (b.video.episode ?? 0));
  return out;
}
