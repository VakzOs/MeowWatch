// Parcours complet de la connexion avec un faux Discord : propriétaire, refus, invitation, révocation.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { gzipSync } from "node:zlib";
import { decodeSubtitle, isPrivate, start, toVtt } from "./server.mjs";

const PEOPLE = { "code-eric": { id: "1", username: "eric" }, "code-ami": { id: "2", username: "ami", global_name: "Ami", avatar: "abc" }, "code-x": { id: "3", username: "x" } };
const discord = createServer((req, res) => {
  let b = ""; req.on("data", c => (b += c)).on("end", () => {
    res.setHeader("content-type", "application/json");
    if (req.url === "/api/oauth2/token") return res.end(JSON.stringify({ access_token: new URLSearchParams(b).get("code") }));
    if (req.url === "/api/users/@me") return res.end(JSON.stringify(PEOPLE[req.headers.authorization.slice(7)]));
    res.statusCode = 404; res.end("{}");
  });
}).listen(0);
const D = `http://localhost:${discord.address().port}`;
// Faux TMDB : un film et une série d'une saison, en français.
const tmdbCalls = [];
const tmdbSrv = createServer((req, res) => {
  const u = new URL(req.url, "http://x"); tmdbCalls.push(u.pathname);
  res.setHeader("content-type", "application/json");
  const send = o => res.end(JSON.stringify(o));
  if (u.searchParams.get("api_key") !== "cle" || u.searchParams.get("language") !== "fr-FR") { res.statusCode = 401; return send({}); }
  if (u.pathname === "/3/find/tt0460681") return send({ movie_results: [], tv_results: [{ id: 1622 }] });
  if (u.pathname === "/3/find/tt0120737") return send({ movie_results: [{ id: 120 }], tv_results: [] });
  if (u.pathname === "/3/tv/1622") return send({ name: "Supernatural", overview: "Deux frères chassent le surnaturel.", genres: [{ name: "Drame" }], seasons: [{ season_number: 1 }] });
  if (u.pathname === "/3/tv/1622/season/1") return send({ episodes: [{ season_number: 1, episode_number: 1, name: "La Dame blanche", overview: "Sam et Dean…" }] });
  if (u.pathname === "/3/movie/120") return send({ title: "Le Seigneur des anneaux : La Communauté de l'anneau", overview: "Un hobbit…", genres: [{ name: "Aventure" }] });
  res.statusCode = 404; send({});
}).listen(0);
// Faux IMDb : jeux de données gzippés (en-tête, \\N pour les épisodes sans numéro, un épisode sans note).
const IMDB = {
  "/title.ratings.tsv.gz": "tconst\taverageRating\tnumVotes\ntt1\t8.6\t6729\ntt2\t9.6\t14604\ntt9\t7.0\t10\n",
  "/title.episode.tsv.gz": "tconst\tparentTconst\tseasonNumber\tepisodeNumber\ntt1\ttt0460681\t5\t1\ntt2\ttt0460681\t5\t8\ntt3\ttt0460681\t5\t9\ntt9\ttt0460681\t\\N\t\\N\n",
};
const imdbSrv = createServer((req, res) => (IMDB[req.url] ? res.end(gzipSync(IMDB[req.url])) : ((res.statusCode = 404), res.end()))).listen(0);
const app = await start({ PORT: "0", DB_PATH: ":memory:", DISCORD_CLIENT_ID: "id", DISCORD_CLIENT_SECRET: "s", OWNER_DISCORD_ID: "1", DISCORD_URL: D, WEB_DIR: "/nonexistent", TMDB_API_KEY: "cle", TMDB_URL: `http://localhost:${tmdbSrv.address().port}`, IMDB_URL: `http://localhost:${imdbSrv.address().port}` });
const A = `http://localhost:${app.server.address().port}`;

const setCookies = r => r.headers.getSetCookie().map(c => c.split(";")[0]);
/** Se connecte comme `who` (code du faux Discord), avec une invitation éventuelle. Renvoie [redirection, cookie de session]. */
async function login(who, invite = "") {
  const go = await fetch(`${A}/api/auth/discord?invite=${invite}`, { redirect: "manual" });
  const state = new URL(go.headers.get("location")).searchParams.get("state");
  const back = await fetch(`${A}/api/auth/discord/callback?code=${who}&state=${state}`, { redirect: "manual", headers: { cookie: setCookies(go)[0] } });
  return [back.headers.get("location"), setCookies(back).find(c => c.startsWith("mw_session=") && c.length > 11)];
}
const api = (path, cookie, init = {}) => fetch(A + path, { ...init, headers: { cookie: cookie ?? "", "content-type": "application/json" } });

test("connexion Discord réservée au propriétaire et à ses invités", async () => {
  const [to, eric] = await login("code-eric");
  assert.equal(to, "/");
  assert.deepEqual(await (await api("/api/auth/me", eric)).json(), { id: "1", name: "eric", avatar: null, owner: true, translate: true, profile: null });

  assert.equal((await api("/api/admin", eric)).status, 403); // pas encore de profil ouvert
  const main = (await (await api("/api/profiles", eric)).json()).profiles[0];
  assert.equal(main.main, true);
  await api("/api/profiles/select", eric, { method: "POST", body: JSON.stringify({ id: main.id }) });
  assert.deepEqual(await login("code-ami"), ["/?erreur=non-invite", undefined]);
  assert.equal((await api("/api/admin", eric.replace(/=.*/, "=faux"))).status, 403);

  const { code } = await (await api("/api/admin/invites", eric, { method: "POST", body: JSON.stringify({ note: "Ami" }) })).json();
  assert.equal((await api(`/api/invite?code=${code}`)).status, 200);
  const [to2, ami] = await login("code-ami", code);
  assert.equal(to2, "/");
  assert.equal((await (await api("/api/auth/me", ami)).json()).owner, false);
  assert.equal((await api("/api/admin", ami)).status, 403);

  // Invitation à usage unique ; l'invité revient ensuite sans elle.
  assert.equal((await login("code-x", code))[0], "/?erreur=invitation");
  assert.equal((await login("code-ami"))[0], "/");

  const admin = await (await api("/api/admin", eric)).json();
  assert.deepEqual(admin.users.map(u => u.name), ["eric", "Ami"]);
  assert.equal(admin.invites.length, 0);

  await api("/api/admin/users?id=2", eric, { method: "DELETE" });
  assert.equal((await api("/api/auth/me", ami)).status, 401);
  assert.equal((await login("code-ami"))[0], "/?erreur=non-invite");

  await api("/api/auth/logout", eric, { method: "POST" });
  assert.equal((await api("/api/auth/me", eric)).status, 401);
});

test("état anti-CSRF obligatoire", async () => {
  const r = await fetch(`${A}/api/auth/discord/callback?code=code-eric&state=pirate`, { redirect: "manual" });
  assert.equal(r.headers.get("location"), "/?erreur=etat");
});

test("synchro par compte : addons, reprise la plus récente, comptes séparés", async () => {
  const [, eric] = await login("code-eric");
  const put = (path, cookie, body) => api(path, cookie, { method: "PUT", body: JSON.stringify(body) });
  assert.equal((await api("/api/sync")).status, 401);
  assert.deepEqual(await (await api("/api/sync", eric)).json(), { addons: null, progress: [], library: [] });

  const addons = [{ url: "https://x/manifest.json", manifest: { id: "x", name: "X" } }];
  assert.equal((await put("/api/sync/addons", eric, { addons })).status, 200);
  assert.equal((await put("/api/sync/addons", eric, { addons: [{ nope: 1 }] })).status, 400);

  assert.equal((await put("/api/sync/progress", eric, { meta: { id: "tt1" }, time: 1, updatedAt: 1 })).status, 409); // aucun profil ouvert
  const { profiles } = await (await api("/api/profiles", eric)).json();
  await api("/api/profiles/select", eric, { method: "POST", body: JSON.stringify({ id: profiles[0].id }) });
  const prog = (time, updatedAt) => ({ meta: { id: "tt1", type: "movie", name: "Film" }, videoId: "tt1", time, duration: 6000, updatedAt });
  await put("/api/sync/progress", eric, prog(300, 2000));
  await put("/api/sync/progress", eric, prog(100, 1000)); // appareil en retard : ignoré
  const sync = await (await api("/api/sync", eric)).json();
  assert.deepEqual(sync.addons, addons);
  assert.deepEqual(sync.progress.map(p => p.time), [300]);

  const item = (id, updatedAt, removed) => ({ meta: { id, type: "movie", name: id }, addedAt: 1, updatedAt, removed });
  assert.equal((await put("/api/sync/library", eric, [{ nope: 1 }])).status, 400);
  await put("/api/sync/library", eric, [item("tt1", 1000), item("tt2", 1000)]);
  await put("/api/sync/library", eric, [item("tt1", 3000, true), item("tt2", 500, true)]); // tt2 : retrait plus ancien, ignoré
  const lib = (await (await api("/api/sync", eric)).json()).library;
  assert.deepEqual(lib.map(i => [i.meta.id, !!i.removed]), [["tt1", true], ["tt2", false]]);

  const { code } = await (await api("/api/admin/invites", eric, { method: "POST", body: "{}" })).json(); // eric a ouvert son profil principal plus haut
  const [, ami] = await login("code-ami", code);
  assert.deepEqual(await (await api("/api/sync", ami)).json(), { addons: null, progress: [], library: [] });
});

test("profils : PIN, reprise séparée, anti-devinette, modification et suppression", async () => {
  const [, c] = await login("code-eric");
  const post = (path, body, method = "POST") => api(path, c, { method, body: JSON.stringify(body) });
  const { profiles } = await (await api("/api/profiles", c)).json();
  assert.equal(profiles[0].name, "eric");

  const kid = await (await post("/api/profiles", { name: "Enfant", color: "#3FA66B", pin: "1234" })).json();
  assert.deepEqual({ ...kid, id: 0 }, { id: 0, name: "Enfant", color: "#3FA66B", locked: true, main: false, avatar: null, prefs: null });
  assert.equal((await post("/api/profiles", { name: "X", pin: "12" })).status, 400);

  assert.equal((await post("/api/profiles/select", { id: kid.id })).status, 403);
  assert.equal((await post("/api/profiles/select", { id: kid.id, pin: "0000" })).status, 403);
  assert.equal((await post("/api/profiles/select", { id: kid.id, pin: "1234" })).status, 200);
  assert.equal((await (await api("/api/auth/me", c)).json()).profile.name, "Enfant");
  assert.deepEqual((await (await api("/api/sync", c)).json()).progress, []); // reprise propre au profil

  assert.equal((await post("/api/profiles", { pin: null }, "PATCH")).status, 403); // retirer le code demande le code
  assert.equal((await post("/api/profiles", { pin: "5555", currentPin: "0000" }, "PATCH")).status, 403);
  await post("/api/profiles", { pin: null, currentPin: "1234", name: "Enfants", avatar: "chat-vert" }, "PATCH");
  assert.deepEqual((await (await api("/api/auth/me", c)).json()).profile, { id: kid.id, name: "Enfants", color: "#3FA66B", locked: false, main: false, avatar: "chat-vert", prefs: null });
  assert.equal((await api("/api/admin", c)).status, 403); // un profil secondaire ne gère pas les accès
  await post("/api/profiles/leave", {});
  assert.equal((await (await api("/api/auth/me", c)).json()).profile, null);

  const lock = await (await post("/api/profiles", { name: "Coffre", pin: "4321" })).json();
  for (let i = 0; i < 5; i++) await post("/api/profiles/select", { id: lock.id, pin: "9999" });
  assert.equal((await post("/api/profiles/select", { id: lock.id, pin: "4321" })).status, 429); // bloqué même avec le bon code

  await post("/api/profiles/select", { id: profiles[0].id });
  assert.equal((await api("/api/profiles", c, { method: "DELETE" })).status, 400); // principal
  await post("/api/profiles/select", { id: kid.id });
  assert.equal((await api("/api/profiles", c, { method: "DELETE" })).status, 200);
  assert.equal((await (await api("/api/profiles", c)).json()).profiles.length, 2);
});

test("fiches traduites par TMDB, avec cache", async () => {
  const [, c] = await login("code-eric");
  assert.equal((await api("/api/translate?type=series&id=tt0460681")).status, 401);
  const tv = await (await api("/api/translate?type=series&id=tt0460681&lang=fr-FR", c)).json();
  assert.equal(tv.description, "Deux frères chassent le surnaturel.");
  assert.deepEqual(tv.episodes["1:1"], { name: "La Dame blanche", overview: "Sam et Dean…" });
  const film = await (await api("/api/translate?type=movie&id=tt0120737", c)).json();
  assert.equal(film.name, "Le Seigneur des anneaux : La Communauté de l'anneau");
  const n = tmdbCalls.length;
  await api("/api/translate?type=movie&id=tt0120737", c);
  assert.equal(tmdbCalls.length, n); // servi par le cache
  assert.equal((await api("/api/translate?type=movie&id=pas-un-id", c)).status, 400);
});

test("préférences de langue du profil et relais des sous-titres", async () => {
  const [, c] = await login("code-eric");
  const { profiles } = await (await api("/api/profiles", c)).json();
  await api("/api/profiles/select", c, { method: "POST", body: JSON.stringify({ id: profiles[0].id }) });
  const prefs = { films: { audio: "fr", audio2: "vo", subs: "", subs2: "" }, animes: { audio: "ja", audio2: "fr", subs: "fr", subs2: "en" } };
  const put = b => api("/api/profiles/prefs", c, { method: "PUT", body: JSON.stringify(b) });
  assert.equal((await put({ films: { audio: "français" } })).status, 400);
  assert.equal((await put(prefs)).status, 200);
  assert.deepEqual((await (await api("/api/auth/me", c)).json()).profile.prefs, { ...prefs, adult: true });
  assert.equal((await (await put({ ...prefs, adult: false })).json()).adult, false);
  // Relais : connecté seulement, et jamais vers une adresse interne du VPS.
  assert.equal((await api("/api/subtitle.vtt?url=https://x.dev/a.srt")).status, 401);
  assert.equal((await (await api(`/api/subtitle.vtt?url=${encodeURIComponent("http://127.0.0.1:22/x")}`, c)).json()).error, "adresse refusée");
  assert.equal((await api(`/api/subtitle.vtt?url=${encodeURIComponent("file:///etc/passwd")}`, c)).status, 400);
  assert.ok(isPrivate("192.168.1.10") && isPrivate("::1") && isPrivate("fd00::1") && !isPrivate("1.1.1.1"));
  assert.equal(toVtt("\uFEFF1\r\n00:00:01,000 --> 00:00:02,500\r\nSalut\r\n"), "WEBVTT\n\n1\n00:00:01.000 --> 00:00:02.500\nSalut\n");
  assert.throws(() => toVtt("[Script Info]"), /non reconnu/);
  // Encodages : UTF-8, UTF-8 avec un octet abîmé, Windows-1252, et UTF-8 doublement encodé (« MajestÃ© »).
  const phrase = "Sa Majesté va ériger notre statue";
  assert.equal(decodeSubtitle(Buffer.from(phrase)), phrase);
  assert.equal(decodeSubtitle(Buffer.concat([Buffer.from(phrase), Buffer.from([0xff])])), phrase + "\uFFFD");
  assert.equal(decodeSubtitle(Buffer.from(phrase, "latin1")), phrase);
  assert.equal(decodeSubtitle(Buffer.from(Buffer.from(phrase).toString("latin1"))), phrase);
  // Double encodage passé par Windows-1252 (« € », « ’ ») avec une espace fine avant « ? ».
  const fr = "Tu parles du voyage\u202F? Il a duré dix ans. C’est fini.";
  const CP = "€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008DŽ\u008F\u0090‘’“”•–—˜™š›œ\u009DžŸ";
  const twice = Buffer.from(Array.from(Buffer.from(fr), b => (b >= 0x80 && b <= 0x9f ? CP[b - 0x80] : String.fromCharCode(b))).join(""));
  assert.equal(decodeSubtitle(Buffer.from([0x43, 0x92, 0x65, 0x73, 0x74, 0x20, 0xe9, 0x74, 0xe9])), "C’est été"); // vrai Windows-1252
  assert.equal(decodeSubtitle(twice), fr);
  assert.equal(decodeSubtitle(twice), fr); // deux fois de suite : pas d'état gardé entre deux fichiers
});

test.after(async () => { await app.close(); discord.close(); tmdbSrv.close(); imdbSrv.close(); });

test("notes d'épisode importées depuis IMDb", async () => {
  const [, c] = await login("code-eric");
  await app.refreshRatings(true);
  assert.equal((await api("/api/ratings?id=tt0460681")).status, 401);
  assert.deepEqual(await (await api("/api/ratings?id=tt0460681", c)).json(), { "5:1": 8.6, "5:8": 9.6 });
  assert.equal((await api("/api/ratings?id=x", c)).status, 400);
  await app.refreshRatings(); // moins de 20 h : rien n'est retéléchargé, les notes restent
  assert.equal(Object.keys(await (await api("/api/ratings?id=tt0460681", c)).json()).length, 2);
});
