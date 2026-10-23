// API du serveur MeowWatch (même origine sur le web ; adresse explicite pour les applis natives plus tard).
import type { LangPrefs } from "./lang";

export const API = process.env.EXPO_PUBLIC_API_URL ?? "";

export type Profile = { id: string; name: string; color: string; locked: boolean; main: boolean; avatar: string | null; prefs?: LangPrefs | null };
export type User = { id: string; name: string; avatar: string | null; owner: boolean; translate: boolean; profile: Profile | null };
export type Translation = { name?: string; description?: string; genres?: string[]; originalLanguage?: string; episodes: Record<string, { name?: string; overview?: string }> };
export type Admin = {
  users: (User & { createdAt: number })[];
  invites: { code: string; note: string; link: string; expiresAt: number }[];
};

export async function api<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(API + path, { credentials: "include", ...init, headers: { "content-type": "application/json", ...init.headers } });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.error ?? `Erreur ${r.status}`), { status: r.status });
  return data;
}

export const loginUrl = (invite?: string) => `${API}/api/auth/discord${invite ? `?invite=${encodeURIComponent(invite)}` : ""}`;

export const LOGIN_ERRORS: Record<string, string> = {
  "non-invite": "Ce compte Discord n'est pas invité. Demande un lien d'invitation à Vakz.",
  invitation: "Ce lien d'invitation a déjà servi ou a expiré. Demande-en un nouveau.",
  etat: "La connexion a expiré, réessaie.",
  discord: "Discord n'a pas répondu, réessaie dans un instant.",
};
