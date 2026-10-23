// Serveur MeowWatch : sert l'appli web et l'API, connexion Discord réservée au propriétaire et à ses invités.
// Aucune dépendance : node:http + node:sqlite.
import { createHash, randomBytes } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, normalize } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const SESSION_DAYS = 60, INVITE_DAYS = 7;
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".ttf": "font/ttf", ".woff2": "font/woff2" };

export function start(env = process.env) {
  const cfg = {
    port: +(env.PORT ?? 3500),
    publicUrl: (env.PUBLIC_URL ?? "http://localhost:3500").replace(/\/$/, ""),
    clientId: env.DISCORD_CLIENT_ID ?? "",
    clientSecret: env.DISCORD_CLIENT_SECRET ?? "",
    owner: env.OWNER_DISCORD_ID ?? "",
    discord: (env.DISCORD_URL ?? "https://discord.com").replace(/\/$/, ""), // remplaçable pour les tests
    web: env.WEB_DIR ?? join(dirname(fileURLToPath(import.meta.url)), "../app/dist"),
    db: env.DB_PATH ?? "./data/meowwatch.db",
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
    PRAGMA foreign_keys = ON;`);
  const q = Object.fromEntries(Object.entries({
    user: "SELECT * FROM users WHERE id = ?",
    upsertUser: "INSERT INTO users (id, name, avatar, created_at, invited_by) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, avatar = excluded.avatar",
    users: "SELECT id, name, avatar, created_at, invited_by FROM users ORDER BY created_at",
    deleteUser: "DELETE FROM users WHERE id = ?",
    session: "SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.hash = ? AND s.expires_at > ?",
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
    progress: "SELECT data FROM progress WHERE user_id = ? ORDER BY updated_at DESC LIMIT 500",
    // La plus récente gagne : un appareil en retard n'écrase pas une position plus neuve.
    saveProgress: "INSERT INTO progress (user_id, meta_id, data, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, meta_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at WHERE excluded.updated_at > progress.updated_at",
  }).map(([k, sql]) => [k, db.prepare(sql)]));

  const hash = t => createHash("sha256").update(t).digest("hex");
  const token = (n = 32) => randomBytes(n).toString("base64url");
  const cookies = req => Object.fromEntries((req.headers.cookie ?? "").split(";").map(c => c.trim().split("=")).filter(([k]) => k).map(([k, ...v]) => [k, decodeURIComponent(v.join("="))]));
  const cookie = (name, value, maxAge) => `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
  const json = (res, code, body, headers = {}) => { res.writeHead(code, { "content-type": "application/json", "cache-control": "no-store", ...headers }); res.end(JSON.stringify(body)); };
  const redirect = (res, to, headers = {}) => { res.writeHead(302, { location: to, "cache-control": "no-store", ...headers }); res.end(); };
  const view = u => u && { id: u.id, name: u.name, avatar: u.avatar, owner: u.id === cfg.owner };
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
    "GET /api/invite": (req, res, url) => json(res, q.invite.get(url.searchParams.get("code") ?? "", Date.now()) ? 200 : 404, {}),

    // Synchro des addons et de la reprise, par compte.
    "GET /api/sync": member((req, res, url, u) => json(res, 200, {
      addons: (r => (r ? JSON.parse(r.data) : null))(q.addons.get(u.id)),
      progress: q.progress.all(u.id).map(r => JSON.parse(r.data)),
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
      q.saveProgress.run(u.id, p.meta.id.slice(0, 200), JSON.stringify(p), Math.min(p.updatedAt, Date.now() + 6e4));
      json(res, 200, { ok: true });
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
  function owner(fn) { return (req, res, url) => (me(req)?.id === cfg.owner ? fn(req, res, url) : json(res, 403, { error: "réservé au propriétaire" })); }

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
  return new Promise(ok => server.listen(cfg.port, () => ok({ server, db, close: () => new Promise(r => server.close(() => { db.close(); r(); })) })));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { server } = await start();
  console.log(`MeowWatch sur le port ${server.address().port}`);
}
