// Parcours complet de la connexion avec un faux Discord : propriétaire, refus, invitation, révocation.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { start } from "./server.mjs";

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
const app = await start({ PORT: "0", DB_PATH: ":memory:", DISCORD_CLIENT_ID: "id", DISCORD_CLIENT_SECRET: "s", OWNER_DISCORD_ID: "1", DISCORD_URL: D, WEB_DIR: "/nonexistent" });
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
  assert.deepEqual(await (await api("/api/auth/me", eric)).json(), { id: "1", name: "eric", avatar: null, owner: true, profile: null });

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
  assert.deepEqual(await (await api("/api/sync", eric)).json(), { addons: null, progress: [] });

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

  const { code } = await (await api("/api/admin/invites", eric, { method: "POST", body: "{}" })).json(); // eric a ouvert son profil principal plus haut
  const [, ami] = await login("code-ami", code);
  assert.deepEqual(await (await api("/api/sync", ami)).json(), { addons: null, progress: [] });
});

test("profils : PIN, reprise séparée, anti-devinette, modification et suppression", async () => {
  const [, c] = await login("code-eric");
  const post = (path, body, method = "POST") => api(path, c, { method, body: JSON.stringify(body) });
  const { profiles } = await (await api("/api/profiles", c)).json();
  assert.equal(profiles[0].name, "eric");

  const kid = await (await post("/api/profiles", { name: "Enfant", color: "#3FA66B", pin: "1234" })).json();
  assert.deepEqual({ ...kid, id: 0 }, { id: 0, name: "Enfant", color: "#3FA66B", locked: true, main: false, avatar: null });
  assert.equal((await post("/api/profiles", { name: "X", pin: "12" })).status, 400);

  assert.equal((await post("/api/profiles/select", { id: kid.id })).status, 403);
  assert.equal((await post("/api/profiles/select", { id: kid.id, pin: "0000" })).status, 403);
  assert.equal((await post("/api/profiles/select", { id: kid.id, pin: "1234" })).status, 200);
  assert.equal((await (await api("/api/auth/me", c)).json()).profile.name, "Enfant");
  assert.deepEqual((await (await api("/api/sync", c)).json()).progress, []); // reprise propre au profil

  await post("/api/profiles", { pin: null, name: "Enfants", avatar: "chat-vert" }, "PATCH");
  assert.deepEqual((await (await api("/api/auth/me", c)).json()).profile, { id: kid.id, name: "Enfants", color: "#3FA66B", locked: false, main: false, avatar: "chat-vert" });
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

test.after(async () => { await app.close(); discord.close(); });
