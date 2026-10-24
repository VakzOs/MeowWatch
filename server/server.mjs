// Serveur MeowWatch : sert l'appli web et l'API, connexion Discord réservée au propriétaire et à ses invités.
// Aucune dépendance : node:http + node:sqlite.
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, statSync } from "node:fs";
import { lookup } from "node:dns/promises";
import { createServer } from "node:http";
import { isIP } from "node:net";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { createGunzip } from "node:zlib";
import { dirname, extname, join, normalize } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const SESSION_DAYS = 60, INVITE_DAYS = 7, MAX_PROFILES = 6;
export const COLORS = ["#D6182A", "#E8833A", "#E5B92E", "#3FA66B", "#2F8FD8", "#8B5CF6"];
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".ttf": "font/ttf", ".woff2": "font/woff2", ".wasm": "application/wasm" };

const MOJIBAKE = /[ÃÂâ][\u0080-\u00BF\u0152-\u2122]/g; // « Ã© », « â€™ » : de l'UTF-8 lu comme du Latin-1 / Windows-1252
/** Texte d'un fichier de sous-titres : UTF-8 (même avec quelques octets abîmés), sinon Windows-1252 ; répare aussi
 *  les fichiers doublement encodés (« MajestÃ© »), fréquents sur OpenSubtitles. */
export function decodeSubtitle(buf) {
  const utf8 = new TextDecoder("utf-8").decode(buf);
  const bad = (utf8.match(/\uFFFD/g) ?? []).length;
  let text = utf8;
  if (bad) {
    const cp1252 = fromCp1252(buf);
    // Vrai Windows-1252 : ses accents ne forment pas de « Ã© » ; UTF-8 abîmé : relu en 1252, il en est plein.
    if ((cp1252.match(MOJIBAKE) ?? []).length < bad) text = cp1252;
  }
  // Une seule séquence suffit : relu en octets, un vrai texte français ne forme presque jamais de l'UTF-8 valide.
  if (text.search(MOJIBAKE) >= 0) {
    const bytes = toCp1252(text);
    if (bytes) try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { }
  }
  return text;
}

// Caractères de Windows-1252 entre 0x80 et 0x9F (le reste correspond au Latin-1).
const CP1252 = "€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008DŽ\u008F\u0090‘’“”•–—˜™š›œ\u009DžŸ";
/** Octets Windows-1252 → texte (le décodeur « windows-1252 » de Node se comporte en Latin-1 pour 0x80-0x9F). */
const fromCp1252 = buf => Array.from(buf, b => (b >= 0x80 && b <= 0x9f ? CP1252[b - 0x80] : String.fromCharCode(b))).join("");
/** Texte → octets Windows-1252 (null si un caractère n'y existe pas) : défait un double encodage. */
function toCp1252(text) {
  const out = Buffer.alloc(text.length);
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i), j = CP1252.indexOf(text[i]);
    if (j >= 0) out[i] = 0x80 + j; else if (c <= 0xff) out[i] = c; else return null;
  }
  return out;
}

/** SRT (ou WebVTT) → WebVTT, que lisent le navigateur et libmedia. */
export function toVtt(text) {
  const t = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").trim();
  if (t.startsWith("WEBVTT")) return t + "\n";
  if (!/-->/.test(t)) throw new Error("format de sous-titres non reconnu");
  return "WEBVTT\n\n" + t.replace(/(\d\d:\d\d:\d\d),(\d{3})/g, "$1.$2") + "\n";
}

/** Adresse locale, privée ou réservée (IPv4 et IPv6). */
export function isPrivate(ip) {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v.startsWith("::ffff:")) return isPrivate(v.slice(7));
    return v === "::1" || v === "::" || /^f[cd]/.test(v) || /^fe[89ab]/.test(v);
  }
  const [a, b] = ip.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

export function start(env = process.env) {
  const cfg = {
    port: +(env.PORT ?? 3500),
    publicUrl: (env.PUBLIC_URL ?? "http://localhost:3500").replace(/\/$/, ""),
    clientId: env.DISCORD_CLIENT_ID ?? "",
    clientSecret: env.DISCORD_CLIENT_SECRET ?? "",
    owner: env.OWNER_DISCORD_ID ?? "",
    discord: (env.DISCORD_URL ?? "https://discord.com").replace(/\/$/, ""), // remplaçable pour les tests
    tmdbKey: env.TMDB_API_KEY ?? "", // facultatif : fiches traduites (clé v3 ou jeton de lecture v4)
    tmdb: (env.TMDB_URL ?? "https://api.themoviedb.org").replace(/\/$/, ""),
    imdb: (env.IMDB_URL ?? "https://datasets.imdbws.com").replace(/\/$/, ""), // notes d'épisode (jeux de données publics)
    web: env.WEB_DIR ?? join(dirname(fileURLToPath(import.meta.url)), "../app/dist"),
    db: env.DB_PATH ?? "./data/meowwatch.db",
    allowPrivate: env.ALLOW_PRIVATE_FETCH === "1", // tests : sous-titres servis en local
  };
  if (!cfg.clientId || !cfg.clientSecret || !cfg.owner) throw new Error("DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET et OWNER_DISCORD_ID sont obligatoires.");
  const secure = cfg.publicUrl.startsWith("https://");
  const redirectUri = `${cfg.publicUrl}/api/auth/discord/callback`;

  if (cfg.db !== ":memory:") mkdirSync(dirname(cfg.db), { recursive: true });
  const db = new DatabaseSync(cfg.db);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, avatar TEXT, created_at INTEGER NOT NULL, invited_by TEXT);
    CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS invites (code TEXT PRIMARY KEY, note TEXT, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, used_by TEXT, used_at INTEGER);
    CREATE TABLE IF NOT EXISTS addons (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, data TEXT NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS progress (user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, meta_id TEXT NOT NULL, data TEXT NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (user_id, meta_id));
    CREATE TABLE IF NOT EXISTS profiles (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, name TEXT NOT NULL, color TEXT NOT NULL, pin TEXT, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS profile_progress (profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE, meta_id TEXT NOT NULL, data TEXT NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (profile_id, meta_id));
    CREATE TABLE IF NOT EXISTS profile_library (profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE, meta_id TEXT NOT NULL, data TEXT NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (profile_id, meta_id));
    CREATE TABLE IF NOT EXISTS episode_ratings (show TEXT NOT NULL, season INTEGER NOT NULL, episode INTEGER NOT NULL, rating REAL NOT NULL, votes INTEGER NOT NULL, PRIMARY KEY (show, season, episode)) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    PRAGMA foreign_keys = ON;`);
  // Bases créées avant les profils : la session retient le profil choisi.
  try { db.exec("ALTER TABLE sessions ADD COLUMN profile_id TEXT"); } catch { }
  try { db.exec("ALTER TABLE profiles ADD COLUMN avatar TEXT"); } catch { }
  try { db.exec("ALTER TABLE profiles ADD COLUMN prefs TEXT"); } catch { }
  const q = Object.fromEntries(Object.entries({
    user: "SELECT * FROM users WHERE id = ?",
    upsertUser: "INSERT INTO users (id, name, avatar, created_at, invited_by) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, avatar = excluded.avatar",
    users: "SELECT id, name, avatar, created_at, invited_by FROM users ORDER BY created_at",
    deleteUser: "DELETE FROM users WHERE id = ?",
    session: "SELECT u.*, s.profile_id FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.hash = ? AND s.expires_at > ?",
    addSession: "INSERT INTO sessions (hash, user_id, expires_at) VALUES (?, ?, ?)",
    deleteSession: "DELETE FROM sessions WHERE hash = ?",
    deleteSessionsOf: "DELETE FROM sessions WHERE user_id = ?",
    purge: "DELETE FROM sessions WHERE expires_at < ?",
    invite: "SELECT * FROM invites WHERE code = ? AND used_by IS NULL AND expires_at > ?",
    addInvite: "INSERT INTO invites (code, note, created_at, expires_at) VALUES (?, ?, ?, ?)",
    useInvite: "UPDATE invites SET used_by = ?, used_at = ? WHERE code = ? AND used_by IS NULL",
    invites: "SELECT * FROM invites WHERE used_by IS NULL AND expires_at > ? ORDER BY created_at DESC",
    deleteInvite: "DELETE FROM invites WHERE code = ? AND used_by IS NULL",
    addons: "SELECT data FROM addons WHERE user_id = ?",
    saveAddons: "INSERT INTO addons (user_id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at",
    progress: "SELECT data FROM profile_progress WHERE profile_id = ? ORDER BY updated_at DESC LIMIT 500",
    profiles: "SELECT * FROM profiles WHERE user_id = ? ORDER BY created_at",
    profile: "SELECT * FROM profiles WHERE id = ? AND user_id = ?",
    addProfile: "INSERT INTO profiles (id, user_id, name, color, pin, created_at, avatar) VALUES (?, ?, ?, ?, ?, ?, ?)",
    editProfile: "UPDATE profiles SET name = ?, color = ?, pin = ?, avatar = ? WHERE id = ? AND user_id = ?",
    savePrefs: "UPDATE profiles SET prefs = ? WHERE id = ? AND user_id = ?",
    deleteProfile: "DELETE FROM profiles WHERE id = ? AND user_id = ?",
    selectProfile: "UPDATE sessions SET profile_id = ? WHERE hash = ?",
    leaveProfile: "UPDATE sessions SET profile_id = NULL WHERE profile_id = ?",
    // Reprise d'avant les profils : elle revient au premier profil du compte.
    adoptProgress: "INSERT OR IGNORE INTO profile_progress SELECT ?, meta_id, data, updated_at FROM progress WHERE user_id = ?",
    // La plus récente gagne : un appareil en retard n'écrase pas une position plus neuve.
    saveProgress: "INSERT INTO profile_progress (profile_id, meta_id, data, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(profile_id, meta_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at WHERE excluded.updated_at > profile_progress.updated_at",
    // Bibliothèque : même règle ; un titre retiré reste en base (removed) pour que les autres appareils l'apprennent.
    library: "SELECT data FROM profile_library WHERE profile_id = ? ORDER BY updated_at DESC LIMIT 5000",
    ratings: "SELECT season, episode, rating FROM episode_ratings WHERE show = ?",
    kv: "SELECT value FROM kv WHERE key = ?",
    setKv: "INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    saveLibrary: "INSERT INTO profile_library (profile_id, meta_id, data, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(profile_id, meta_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at WHERE excluded.updated_at > profile_library.updated_at",
  }).map(([k, sql]) => [k, db.prepare(sql)]));

  const hash = t => createHash("sha256").update(t).digest("hex");
  const token = (n = 32) => randomBytes(n).toString("base64url");
  const cookies = req => Object.fromEntries((req.headers.cookie ?? "").split(";").map(c => c.trim().split("=")).filter(([k]) => k).map(([k, ...v]) => [k, decodeURIComponent(v.join("="))]));
  const cookie = (name, value, maxAge) => `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
  const json = (res, code, body, headers = {}) => { res.writeHead(code, { "content-type": "application/json", "cache-control": "no-store", ...headers }); res.end(JSON.stringify(body)); };
  const redirect = (res, to, headers = {}) => { res.writeHead(302, { location: to, "cache-control": "no-store", ...headers }); res.end(); };
  // Le premier profil du compte est le principal : lui seul gère les accès, et il ne se supprime pas.
  const mainId = userId => q.profiles.get(userId)?.id;
  const profileView = p => p && { id: p.id, name: p.name, color: p.color, locked: !!p.pin, main: p.id === mainId(p.user_id), avatar: p.avatar, prefs: p.prefs ? JSON.parse(p.prefs) : null };
  // Les images des avatars sont dans l'appli ; le serveur ne garde que leur nom.
  const avatarKey = a => (typeof a === "string" && /^[a-z0-9-]{1,40}$/.test(a) ? a : null);
  const view = u => u && { id: u.id, name: u.name, avatar: u.avatar, owner: u.id === cfg.owner, translate: !!cfg.tmdbKey, profile: u.profile_id ? profileView(q.profile.get(u.profile_id, u.id)) ?? null : null };
  /** Les profils du compte ; le premier est créé au nom Discord et récupère l'ancienne reprise. */
  function profilesOf(u) {
    let list = q.profiles.all(u.id);
    if (!list.length) {
      const id = token(9);
      q.addProfile.run(id, u.id, u.name.slice(0, 20), COLORS[0], null, Date.now(), "chat-rouge");
      q.adoptProgress.run(id, u.id);
      list = q.profiles.all(u.id);
    }
    return list;
  }
  const pinHash = pin => { const salt = randomBytes(16); return `${salt.toString("hex")}:${scryptSync(pin, salt, 32).toString("hex")}`; };
  const pinOk = (pin, stored) => { const [salt, h] = stored.split(":"); return timingSafeEqual(scryptSync(String(pin), Buffer.from(salt, "hex"), 32), Buffer.from(h, "hex")); };
  const validPin = pin => /^\d{4}$/.test(pin);
  // Fiches traduites par TMDB, à partir de l'identifiant IMDb (tt…) que donnent Cinemeta et les addons de flux.
  // ponytail: cache en mémoire (7 jours, 2000 fiches max, perdu au redémarrage) ; passer en table SQLite si besoin.
  const tmdbCache = new Map();
  async function tmdb(path, lang) {
    const v4 = cfg.tmdbKey.length > 40; // jeton de lecture v4 (long) ou clé v3
    const u = `${cfg.tmdb}/3${path}${path.includes("?") ? "&" : "?"}language=${lang}${v4 ? "" : `&api_key=${cfg.tmdbKey}`}`;
    const r = await fetch(u, { headers: v4 ? { authorization: `Bearer ${cfg.tmdbKey}` } : {} });
    if (!r.ok) throw new Error(`TMDB ${r.status}`);
    return r.json();
  }
  // Notes d'épisode (comme SeriesGraph) : jeux de données publics d'IMDb (usage personnel), rechargés chaque jour.
  // Les notes vont dans une table temporaire, puis on ne garde que celles des épisodes. Les lignes sont écrites par
  // paquets dans une transaction sans await : les requêtes des utilisateurs ne s'y mêlent jamais.
  async function* tsv(name) {
    const r = await fetch(`${cfg.imdb}/${name}`);
    if (!r.ok) throw new Error(`${name} ${r.status}`);
    let batch = [], head = true;
    for await (const line of createInterface({ input: Readable.fromWeb(r.body).pipe(createGunzip()), crlfDelay: Infinity })) {
      if (head) { head = false; continue; }
      batch.push(line.split("\t"));
      if (batch.length === 50000) { yield batch; batch = []; }
    }
    if (batch.length) yield batch;
  }
  const tx = fn => { db.exec("BEGIN"); try { fn(); db.exec("COMMIT"); } catch (e) { db.exec("ROLLBACK"); throw e; } };
  let importing = false;
  async function refreshRatings(force = false) {
    if (importing || (!force && Date.now() - +(q.kv.get("ratings_at")?.value ?? 0) < 20 * 36e5)) return;
    importing = true;
    try {
      db.exec("CREATE TEMP TABLE IF NOT EXISTS r (id TEXT PRIMARY KEY, rating REAL, votes INTEGER) WITHOUT ROWID; DELETE FROM r;" +
        "CREATE TEMP TABLE IF NOT EXISTS e AS SELECT * FROM episode_ratings WHERE 0; DELETE FROM e;");
      const addR = db.prepare("INSERT OR IGNORE INTO r VALUES (?, ?, ?)"), getR = db.prepare("SELECT rating, votes FROM r WHERE id = ?");
      const addE = db.prepare("INSERT OR IGNORE INTO e VALUES (?, ?, ?, ?, ?)");
      for await (const b of tsv("title.ratings.tsv.gz")) tx(() => { for (const [id, rating, votes] of b) addR.run(id, +rating, +votes); });
      for await (const b of tsv("title.episode.tsv.gz")) tx(() => {
        for (const [id, show, season, episode] of b) {
          const r = season !== "\\N" && episode !== "\\N" && getR.get(id);
          if (r) addE.run(show, +season, +episode, r.rating, r.votes);
        }
      });
      tx(() => { db.exec("DELETE FROM episode_ratings; INSERT OR IGNORE INTO episode_ratings SELECT * FROM e; DELETE FROM r; DELETE FROM e;"); q.setKv.run("ratings_at", String(Date.now())); });
      console.log("Notes IMDb importées :", db.prepare("SELECT count(*) n FROM episode_ratings").get().n, "épisodes");
    } catch (e) { console.error("Notes IMDb :", e.message); }
    finally { importing = false; }
  }

  async function translated(type, imdb, lang) {
    const key = `${lang}:${type}:${imdb}`, hit = tmdbCache.get(key);
    if (hit && hit.at > Date.now() - 7 * 864e5) return hit.data;
    const found = await tmdb(`/find/${imdb}?external_source=imdb_id`, lang);
    const item = (type === "series" ? found.tv_results : found.movie_results)?.[0];
    let data = null;
    if (item) {
      const d = await tmdb(type === "series" ? `/tv/${item.id}` : `/movie/${item.id}`, lang);
      data = { name: d.title ?? d.name, description: d.overview || undefined, genres: (d.genres ?? []).map(g => g.name), originalLanguage: d.original_language, episodes: {} };
      if (type === "series") {
        const seasons = (d.seasons ?? []).map(x => x.season_number).slice(0, 40);
        const lists = await Promise.all(seasons.map(n => tmdb(`/tv/${item.id}/season/${n}`, lang).catch(() => null)));
        for (const l of lists) for (const e of l?.episodes ?? []) data.episodes[`${e.season_number}:${e.episode_number}`] = { name: e.name, overview: e.overview || undefined };
      }
    }
    if (tmdbCache.size > 2000) tmdbCache.delete(tmdbCache.keys().next().value);
    tmdbCache.set(key, { at: Date.now(), data });
    return data;
  }
  // ponytail: cache des sous-titres en mémoire (300 fichiers, perdu au redémarrage).
  const subCache = new Map();
  /** Télécharge un petit fichier texte public (pas d'adresse interne : les invités ne doivent pas sonder le VPS). */
  async function fetchText(src) {
    const u = new URL(src);
    if (!/^https?:$/.test(u.protocol)) throw new Error("lien invalide");
    if (!cfg.allowPrivate) {
      const { address } = await lookup(u.hostname.replace(/^\[|\]$/g, ""));
      if (isPrivate(address)) throw new Error("adresse refusée");
    }
    // ponytail: pas de redirection suivie (elle pourrait viser une adresse interne après le contrôle).
    const r = await fetch(u, { signal: AbortSignal.timeout(10000), redirect: "error" });
    if (!r.ok) throw new Error(`sous-titres indisponibles (${r.status})`);
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 5e6) throw new Error("fichier trop gros");
    return decodeSubtitle(buf);
  }

  // Anti-devinette : 5 mauvais codes bloquent le profil 5 minutes.
  const fails = new Map();
  /** Vérifie le code d'un profil verrouillé ; renvoie [statut, message] en cas de refus. */
  function checkPin(p, pin) {
    if (!p.pin) return null;
    const f = fails.get(p.id) ?? { n: 0, until: 0 };
    if (f.until > Date.now()) return [429, "Trop d'essais. Réessaie dans quelques minutes."];
    if (!pin || !pinOk(pin, p.pin)) {
      f.n++; if (f.n >= 5) { f.n = 0; f.until = Date.now() + 5 * 6e4; } fails.set(p.id, f);
      return [403, "Code incorrect."];
    }
    fails.delete(p.id);
    return null;
  }
  const me = req => { const t = cookies(req).mw_session; return t ? q.session.get(hash(t), Date.now()) : undefined; };
  const body = (req, max = 1e4) => new Promise((ok, ko) => { let d = ""; req.on("data", c => { d += c; if (d.length > max) { ko(Object.assign(new Error("trop gros"), { status: 413 })); req.destroy(); } }).on("end", () => { try { ok(d ? JSON.parse(d) : {}); } catch (e) { ko(e); } }); });

  async function discordUser(code) {
    const t = await fetch(`${cfg.discord}/api/oauth2/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, grant_type: "authorization_code", code, redirect_uri: redirectUri }) });
    if (!t.ok) throw new Error(`token ${t.status}`);
    const { access_token } = await t.json();
    const u = await fetch(`${cfg.discord}/api/users/@me`, { headers: { authorization: `Bearer ${access_token}` } });
    if (!u.ok) throw new Error(`users/@me ${u.status}`);
    return u.json();
  }

  const routes = {
    // Départ vers Discord ; le code d'invitation voyage avec l'état anti-CSRF.
    "GET /api/auth/discord": (req, res, url) => {
      const state = token(16), invite = (url.searchParams.get("invite") ?? "").slice(0, 64);
      const to = `${cfg.discord}/oauth2/authorize?` + new URLSearchParams({ client_id: cfg.clientId, response_type: "code", scope: "identify", redirect_uri: redirectUri, state, prompt: "none" });
      redirect(res, to, { "set-cookie": cookie("mw_state", `${state}.${invite}`, 600) });
    },
    "GET /api/auth/discord/callback": async (req, res, url) => {
      const [state, invite] = (cookies(req).mw_state ?? "").split(".");
      const clear = cookie("mw_state", "", 0);
      if (!state || url.searchParams.get("state") !== state || !url.searchParams.get("code")) return redirect(res, "/?erreur=etat", { "set-cookie": clear });
      let d;
      try { d = await discordUser(url.searchParams.get("code")); } catch (e) { console.error("Discord :", e.message); return redirect(res, "/?erreur=discord", { "set-cookie": clear }); }
      const now = Date.now(), known = q.user.get(d.id);
      if (d.id !== cfg.owner && !known) {
        // Inconnu : il lui faut une invitation valide, consommée à l'instant.
        if (!invite || !q.invite.get(invite, now) || q.useInvite.run(d.id, now, invite).changes !== 1) return redirect(res, `/?erreur=${invite ? "invitation" : "non-invite"}`, { "set-cookie": clear });
      }
      q.upsertUser.run(d.id, d.global_name || d.username, d.avatar ? `https://cdn.discordapp.com/avatars/${d.id}/${d.avatar}.png?size=128` : null, now, known ? known.invited_by : d.id === cfg.owner ? null : cfg.owner);
      const t = token();
      q.purge.run(now);
      q.addSession.run(hash(t), d.id, now + SESSION_DAYS * 864e5);
      redirect(res, "/", { "set-cookie": [clear, cookie("mw_session", t, SESSION_DAYS * 86400)] });
    },
    "GET /api/auth/me": (req, res) => { const u = me(req); u ? json(res, 200, view(u)) : json(res, 401, { error: "non connecté" }); },
    "POST /api/auth/logout": (req, res) => { const t = cookies(req).mw_session; if (t) q.deleteSession.run(hash(t)); json(res, 200, { ok: true }, { "set-cookie": cookie("mw_session", "", 0) }); },
    "GET /api/translate": member(async (req, res, url) => {
      if (!cfg.tmdbKey) return json(res, 404, { error: "Traduction non configurée (TMDB_API_KEY)." });
      const type = url.searchParams.get("type"), id = url.searchParams.get("id") ?? "", lang = url.searchParams.get("lang") ?? "fr-FR";
      if (!["movie", "series"].includes(type) || !/^tt\d{5,10}$/.test(id) || !/^[a-z]{2}-[A-Z]{2}$/.test(lang)) return json(res, 400, { error: "requête invalide" });
      try { const data = await translated(type, id, lang); data ? json(res, 200, data, { "cache-control": "private, max-age=86400" }) : json(res, 404, { error: "introuvable sur TMDB" }); }
      catch (e) { console.error("TMDB :", e.message); json(res, 502, { error: "TMDB indisponible" }); }
    }),
    "GET /api/ratings": member((req, res, url) => {
      const id = url.searchParams.get("id") ?? "";
      if (!/^tt\d{5,10}$/.test(id)) return json(res, 400, { error: "requête invalide" });
      json(res, 200, Object.fromEntries(q.ratings.all(id).map(r => [`${r.season}:${r.episode}`, r.rating])), { "cache-control": "private, max-age=3600" });
    }),
    "GET /api/invite": (req, res, url) => json(res, q.invite.get(url.searchParams.get("code") ?? "", Date.now()) ? 200 : 404, {}),

    // Profils (façon Netflix) : la reprise est propre à chaque profil, les addons sont communs au compte.
    "GET /api/profiles": member((req, res, url, u) => json(res, 200, { profiles: profilesOf(u).map(profileView), max: MAX_PROFILES, colors: COLORS })),
    "POST /api/profiles/select": member(async (req, res, url, u) => {
      const { id, pin } = await body(req), p = q.profile.get(String(id), u.id);
      if (!p) return json(res, 404, { error: "profil introuvable" });
      const refused = checkPin(p, pin);
      if (refused) return json(res, refused[0], { error: refused[1] });
      q.selectProfile.run(p.id, hash(cookies(req).mw_session));
      json(res, 200, profileView(p));
    }),
    "POST /api/profiles/leave": member((req, res) => { q.selectProfile.run(null, hash(cookies(req).mw_session)); json(res, 200, { ok: true }); }),
    "POST /api/profiles": member(async (req, res, url, u) => {
      const { name, color, pin, avatar } = await body(req);
      if (profilesOf(u).length >= MAX_PROFILES) return json(res, 400, { error: `${MAX_PROFILES} profils au maximum.` });
      if (!String(name ?? "").trim()) return json(res, 400, { error: "Donne un nom au profil." });
      if (pin && !validPin(pin)) return json(res, 400, { error: "Le code doit faire 4 chiffres." });
      const id = token(9);
      q.addProfile.run(id, u.id, String(name).trim().slice(0, 20), COLORS.includes(color) ? color : COLORS[0], pin ? pinHash(pin) : null, Date.now(), avatarKey(avatar));
      json(res, 201, profileView(q.profile.get(id, u.id)));
    }),
    // Modifier ou supprimer : seulement le profil ouvert. Toucher au code ou supprimer un profil
    // verrouillé demande en plus le code actuel (`currentPin`).
    "PATCH /api/profiles": member(async (req, res, url, u) => {
      const p = u.profile_id && q.profile.get(u.profile_id, u.id);
      if (!p) return json(res, 409, { error: "Choisis d'abord un profil." });
      const b = await body(req);
      if (b.pin && !validPin(b.pin)) return json(res, 400, { error: "Le code doit faire 4 chiffres." });
      const refused = b.pin !== undefined && checkPin(p, b.currentPin);
      if (refused) return json(res, refused[0], { error: refused[1] });
      const name = b.name !== undefined ? String(b.name).trim().slice(0, 20) : p.name;
      if (!name) return json(res, 400, { error: "Donne un nom au profil." });
      q.editProfile.run(name, COLORS.includes(b.color) ? b.color : p.color, b.pin === null ? null : b.pin ? pinHash(b.pin) : p.pin, b.avatar !== undefined ? avatarKey(b.avatar) : p.avatar, p.id, u.id);
      json(res, 200, profileView(q.profile.get(p.id, u.id)));
    }),
    "DELETE /api/profiles": member(async (req, res, url, u) => {
      const p = u.profile_id && q.profile.get(u.profile_id, u.id);
      if (!p) return json(res, 409, { error: "Choisis d'abord un profil." });
      if (p.id === mainId(u.id)) return json(res, 400, { error: "Le profil principal ne peut pas être supprimé." });
      const refused = checkPin(p, (await body(req)).currentPin);
      if (refused) return json(res, refused[0], { error: refused[1] });
      q.leaveProfile.run(p.id); q.deleteProfile.run(p.id, u.id);
      json(res, 200, { ok: true });
    }),

    // Synchro : addons du compte, reprise et bibliothèque du profil ouvert.
    "GET /api/sync": member((req, res, url, u) => json(res, 200, {
      addons: (r => (r ? JSON.parse(r.data) : null))(q.addons.get(u.id)),
      progress: u.profile_id ? q.progress.all(u.profile_id).map(r => JSON.parse(r.data)) : [],
      library: u.profile_id ? q.library.all(u.profile_id).map(r => JSON.parse(r.data)) : [],
    })),
    "PUT /api/sync/addons": member(async (req, res, url, u) => {
      const { addons } = await body(req, 2e6);
      if (!Array.isArray(addons) || addons.length > 100 || !addons.every(a => typeof a?.url === "string" && a.manifest?.id)) return json(res, 400, { error: "liste d'addons invalide" });
      q.saveAddons.run(u.id, JSON.stringify(addons), Date.now());
      json(res, 200, { ok: true });
    }),
    "PUT /api/sync/progress": member(async (req, res, url, u) => {
      const p = await body(req, 2e4);
      if (typeof p?.meta?.id !== "string" || typeof p.updatedAt !== "number" || typeof p.time !== "number") return json(res, 400, { error: "reprise invalide" });
      if (!u.profile_id) return json(res, 409, { error: "Choisis d'abord un profil." });
      q.saveProgress.run(u.profile_id, p.meta.id.slice(0, 200), JSON.stringify(p), Math.min(p.updatedAt, Date.now() + 6e4));
      json(res, 200, { ok: true });
    }),
    "PUT /api/sync/library": member(async (req, res, url, u) => {
      const items = await body(req, 2e6);
      if (!Array.isArray(items) || items.length > 5000 || !items.every(i => typeof i?.meta?.id === "string" && typeof i.updatedAt === "number")) return json(res, 400, { error: "bibliothèque invalide" });
      if (!u.profile_id) return json(res, 409, { error: "Choisis d'abord un profil." });
      for (const i of items) q.saveLibrary.run(u.profile_id, i.meta.id.slice(0, 200), JSON.stringify(i), Math.min(i.updatedAt, Date.now() + 6e4));
      json(res, 200, { ok: true });
    }),

    // Langues préférées du profil ouvert (audio et sous-titres, règle à part pour les animés).
    "PUT /api/profiles/prefs": member(async (req, res, url, u) => {
      const b = await body(req, 4e3), lang = v => v === "" || v === "vo" || /^[a-z]{2}$/.test(v);
      const ok = ["films", "animes"].every(k => b?.[k] && ["audio", "subs", "audio2", "subs2"].every(f => lang(b[k][f] ?? "")));
      if (!ok) return json(res, 400, { error: "préférences invalides" });
      if (!u.profile_id) return json(res, 409, { error: "Choisis d'abord un profil." });
      const prefs = Object.fromEntries(["films", "animes"].map(k => [k, { audio: b[k].audio || "vo", audio2: b[k].audio2 ?? "", subs: b[k].subs, subs2: b[k].subs2 ?? "" }]));
      q.savePrefs.run(JSON.stringify(prefs), u.profile_id, u.id);
      json(res, 200, prefs);
    }),

    // Sous-titres des addons : récupérés ici (le navigateur n'y a pas toujours droit, CORS) et convertis en WebVTT.
    "GET /api/subtitle.vtt": member(async (req, res, url) => {
      const src = url.searchParams.get("url") ?? "";
      let vtt = subCache.get(src);
      if (!vtt) {
        try { vtt = toVtt(await fetchText(src)); }
        catch (e) { return json(res, 400, { error: e.message }); }
        if (subCache.size > 300) subCache.delete(subCache.keys().next().value);
        subCache.set(src, vtt);
      }
      res.writeHead(200, { "content-type": "text/vtt; charset=utf-8", "cache-control": "private, max-age=86400" });
      res.end(vtt);
    }),

    // Réservé au propriétaire.
    "GET /api/admin": owner((req, res) => json(res, 200, {
      users: q.users.all().map(u => ({ ...view(u), createdAt: u.created_at })),
      invites: q.invites.all(Date.now()).map(i => ({ code: i.code, note: i.note, link: `${cfg.publicUrl}/invite/${i.code}`, expiresAt: i.expires_at })),
    })),
    "POST /api/admin/invites": owner(async (req, res) => {
      const { note = "" } = await body(req), code = token(9), now = Date.now();
      q.addInvite.run(code, String(note).slice(0, 80), now, now + INVITE_DAYS * 864e5);
      json(res, 201, { code, link: `${cfg.publicUrl}/invite/${code}` });
    }),
    "DELETE /api/admin/invites": owner((req, res, url) => { q.deleteInvite.run(url.searchParams.get("code") ?? ""); json(res, 200, { ok: true }); }),
    "DELETE /api/admin/users": owner((req, res, url) => {
      const id = url.searchParams.get("id") ?? "";
      if (id === cfg.owner) return json(res, 400, { error: "Impossible de te retirer toi-même." });
      q.deleteSessionsOf.run(id); q.deleteUser.run(id); json(res, 200, { ok: true });
    }),
  };
  function member(fn) { return (req, res, url) => { const u = me(req); return u ? fn(req, res, url, u) : json(res, 401, { error: "non connecté" }); }; }
  function owner(fn) { return (req, res, url) => { const u = me(req); return u?.id === cfg.owner && u.profile_id === mainId(u.id) ? fn(req, res, url) : json(res, 403, { error: "réservé au propriétaire, depuis son profil principal" }); }; }

  function serveStatic(req, res, path) {
    let f = normalize(join(cfg.web, decodeURIComponent(path)));
    if (!f.startsWith(normalize(cfg.web))) return json(res, 400, {});
    const asset = existsSync(f) && statSync(f).isFile();
    if (!asset) f = join(cfg.web, "index.html"); // appli monopage : toute route renvoie l'appli
    if (!existsSync(f)) return json(res, 404, { error: "appli web non construite" });
    res.writeHead(200, { "content-type": TYPES[extname(f)] ?? "application/octet-stream", "cache-control": asset && path.startsWith("/_expo/") ? "public, max-age=31536000, immutable" : "no-cache" });
    createReadStream(f).pipe(res);
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://x");
    const route = routes[`${req.method} ${url.pathname}`];
    try {
      if (route) return await route(req, res, url);
      if (url.pathname.startsWith("/api/")) return json(res, 404, { error: "introuvable" });
      if (req.method === "GET" || req.method === "HEAD") return serveStatic(req, res, url.pathname);
      json(res, 405, {});
    } catch (e) {
      if (e.status === 413 || e instanceof SyntaxError) return res.headersSent || json(res, e.status ?? 400, { error: e.message });
      console.error(e); if (!res.headersSent) json(res, 500, { error: "erreur serveur" });
    }
  });
  return new Promise(ok => server.listen(cfg.port, () => ok({ server, db, refreshRatings, close: () => new Promise(r => server.close(() => { db.close(); r(); })) })));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { server, refreshRatings } = await start();
  // Notes d'épisode : au démarrage puis vérifiées toutes les 6 h (rechargées si elles ont plus de 20 h).
  setTimeout(refreshRatings, 5000);
  setInterval(refreshRatings, 6 * 36e5);
  console.log(`MeowWatch sur le port ${server.address().port}`);
}
