import type { Meta } from "./addons";

export type Progress = {
  meta: Pick<Meta, "id" | "type" | "name" | "poster" | "background">;
  videoId: string; label?: string; time: number; duration: number; updatedAt: number;
  /** Vu jusqu'au bout : gardé (pour que les autres appareils l'apprennent) mais hors de « Reprendre ». */
  done?: boolean;
};

/** Titre de la bibliothèque d'un profil. Retiré : gardé avec `removed` pour que les autres appareils l'apprennent. */
export type LibraryItem = { meta: Pick<Meta, "id" | "type" | "name" | "poster" | "background" | "releaseInfo">; addedAt: number; updatedAt: number; removed?: boolean };

/** Fusion de deux listes (reprise, bibliothèque) : pour chaque titre, la plus récente gagne. Renvoie aussi ce que le serveur n'a pas encore. */
export function mergeNewest<T extends { meta: { id: string }; updatedAt: number }>(local: Record<string, T>, remote: T[]) {
  const merged: Record<string, T> = {};
  for (const p of remote) merged[p.meta.id] = p;
  const toPush: T[] = [];
  for (const p of Object.values(local)) {
    const r = merged[p.meta.id];
    if (!r || p.updatedAt > r.updatedAt) { merged[p.meta.id] = p; toPush.push(p); }
  }
  return { merged, toPush };
}

export const isDone = (p: Pick<Progress, "time" | "duration">) => p.duration > 0 && p.time / p.duration > 0.95;
