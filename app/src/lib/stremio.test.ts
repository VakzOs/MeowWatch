import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeAddons, toAddons, toLibrary, toProgress } from "./stremio.ts";

test("addons Stremio : on garde les addons en ligne, pas l'addon local", () => {
  const m = (id: string) => ({ id, name: id });
  const addons = toAddons([
    { transportUrl: "https://v3-cinemeta.strem.io/manifest.json", manifest: m("cinemeta"), flags: { official: true } },
    { transportUrl: "http://127.0.0.1:11470/local-addon/manifest.json", manifest: m("local") },
    { transportUrl: "https://torrentio.strem.fun/realdebrid=x/manifest.json", manifest: m("torrentio") },
  ]);
  assert.deepEqual(addons.map(a => a.manifest.id), ["cinemeta", "torrentio"]);
  const { addons: merged, added } = mergeAddons([{ url: "https://v3-cinemeta.strem.io/manifest.json", manifest: m("cinemeta") }], addons);
  assert.equal(merged.length, 2);
  assert.deepEqual(added.map(a => a.manifest.id), ["torrentio"]);
});

test("bibliothèque Stremio → reprise, règle de « Continuer à regarder » de Stremio", () => {
  const item = (id: string, timeOffset: number, extra: object = {}) => ({
    _id: id, name: id, type: "series", poster: "", removed: false, temp: false, _mtime: "2026-10-01T10:00:00Z",
    state: { timeOffset, duration: 3_000_000, video_id: `${id}:2:5`, lastWatched: "2026-10-20T21:00:00Z" }, ...extra,
  });
  const p = toProgress([
    item("tt1", 1_200_000),
    item("tt2", 0),                                               // pas commencé
    item("tt3", 2_990_000),                                       // presque fini : Stremio le garde
    item("tt4", 1000, { removed: true }),                         // retiré de la bibliothèque
    item("tt5", 1000, { removed: true, temp: true }),             // vu sans l'ajouter à la bibliothèque : gardé
    item("tt6", 1000, { state: { timeOffset: 1000, duration: 0 } }), // durée inconnue : gardé
    item("tt7", 1000, { type: "other" }),
  ]);
  assert.deepEqual(p.map(x => x.meta.id), ["tt1", "tt3", "tt5", "tt6"]);
  assert.deepEqual(p[0], {
    meta: { id: "tt1", type: "series", name: "tt1", poster: undefined }, videoId: "tt1:2:5", label: "S2 · É5",
    time: 1200, duration: 3000, updatedAt: Date.parse("2026-10-20T21:00:00Z"),
  });
  assert.equal(p[3].duration, 0);
});

test("bibliothèque Stremio : titres ajoutés, ni retirés ni seulement vus", () => {
  const item = (id: string, extra: object = {}) => ({ _id: id, name: id, type: "movie", poster: "", removed: false, temp: false, _ctime: "2026-09-01T10:00:00Z", _mtime: "2026-10-01T10:00:00Z", state: { timeOffset: 0 }, ...extra });
  const lib = toLibrary([item("tt1"), item("tt2", { removed: true }), item("tt3", { temp: true }), item("tt4", { type: "other" })]);
  assert.deepEqual(lib.map(i => i.meta.id), ["tt1"]);
  assert.equal(lib[0].addedAt, Date.parse("2026-09-01T10:00:00Z"));
  // Vu : coché dans Stremio, ou film fini ; une série avec un épisode fini n'est pas « vue ».
  const vus = toLibrary([item("tt5", { state: { timeOffset: 0, timesWatched: 1 } }), item("tt6", { type: "series", state: { timeOffset: 0, timesWatched: 1 } }),
    item("tt7", { type: "series", state: { timeOffset: 0, flaggedWatched: 1 } }), item("tt8")]);
  assert.deepEqual(vus.map(i => !!i.watched), [true, false, true, false]);
});
