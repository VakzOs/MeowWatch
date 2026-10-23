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
  assert.deepEqual(await (await api("/api/auth/me", eric)).json(), { id: "1", name: "eric", avatar: null, owner: true });

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

test.after(async () => { await app.close(); discord.close(); });
