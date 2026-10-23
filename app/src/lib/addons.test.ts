import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeUrl, supports, homeCatalogs, searchCatalogs, discoverCatalogs, genreOptions, catalogUrl, configureUrl, describe, imdbEquivalent, type Addon } from "./addons.ts";

test("normalizeUrl accepte les liens tels qu'on les copie", () => {
  assert.equal(normalizeUrl("stremio://torrentio.strem.fun/abc/manifest.json"), "https://torrentio.strem.fun/abc/manifest.json");
  assert.equal(normalizeUrl("https://x.dev/cfg/"), "https://x.dev/cfg/manifest.json");
  assert.equal(normalizeUrl(" x.dev "), "https://x.dev/manifest.json");
});

const cinemeta: Addon = { url: "https://v3-cinemeta.strem.io/manifest.json", manifest: {
  id: "cinemeta", name: "Cinemeta", types: ["movie", "series"], idPrefixes: ["tt"], resources: ["catalog", "meta"],
  catalogs: [
    { type: "movie", id: "top", name: "Popular", extra: [{ name: "search" }, { name: "skip" }] },
    { type: "movie", id: "year", extra: [{ name: "genre", isRequired: true }] },
    { type: "series", id: "search", extraRequired: ["search"], extraSupported: ["search"] },
  ] } };
const torrentio: Addon = { url: "https://t.dev/cfg/manifest.json", manifest: {
  id: "t", name: "Torrentio", types: ["movie", "series"], resources: [{ name: "stream", types: ["movie", "series"], idPrefixes: ["tt", "kitsu"] }], catalogs: [] } };

test("supports respecte types et préfixes", () => {
  assert.ok(supports(cinemeta.manifest, "meta", "movie", "tt123"));
  assert.ok(!supports(cinemeta.manifest, "stream", "movie", "tt123"));
  assert.ok(supports(torrentio.manifest, "stream", "series", "tt1:1:2"));
  assert.ok(!supports(torrentio.manifest, "stream", "series", "yt:abc"));
});

test("catalogues d'accueil et de recherche", () => {
  assert.deepEqual(homeCatalogs([cinemeta, torrentio]).map(c => c.catalog.id), ["top"]);
  assert.deepEqual(searchCatalogs([cinemeta]).map(c => c.catalog.id), ["top", "search"]);
  assert.equal(catalogUrl(cinemeta, cinemeta.manifest.catalogs![0], { search: "slow horses" }), "https://v3-cinemeta.strem.io/catalog/movie/top/search=slow%20horses.json");
});

test("describe lit les flux façon Torrentio, sans emojis", () => {
  const d = describe({ addon: "Torrentio", url: "https://rd/x.mkv", name: "[RD+] Torrentio\n4k DV | HDR", title: "Slow.Horses.S04E03.2160p\n👤 12 💾 21.4 GB ⚙️ ThePirateBay" });
  assert.equal(d.quality, "4k DV | HDR");
  assert.equal(d.source, "[RD+] Torrentio · Slow.Horses.S04E03.2160p");
  assert.equal(d.size, "21.4 Go");
  assert.ok(d.playable);
  assert.ok(!describe({ addon: "T", infoHash: "abc" }).playable);
});

test("configureUrl : page de réglages seulement pour les addons configurables", () => {
  assert.equal(configureUrl({ url: "https://t.dev/opts/manifest.json", manifest: { id: "t", name: "T", behaviorHints: { configurable: true } } }), "https://t.dev/opts/configure");
  assert.equal(configureUrl(cinemeta), null);
});

test("Découvrir : catalogues sans paramètre ou à genre obligatoire (avec choix)", () => {
  const a: Addon = { url: "https://x/manifest.json", manifest: { id: "x", name: "X", catalogs: [
    { type: "movie", id: "top", extra: [{ name: "genre", options: ["Action"] }, { name: "skip" }] },
    { type: "movie", id: "year", extra: [{ name: "genre", isRequired: true, options: ["2026", "2025"] }] },
    { type: "movie", id: "vide", extra: [{ name: "genre", isRequired: true }] },
    { type: "series", id: "search", extraRequired: ["search"] },
  ] } };
  assert.deepEqual(discoverCatalogs([a]).map(c => c.catalog.id), ["top", "year"]);
  assert.deepEqual(genreOptions(a.manifest.catalogs![1]), ["2026", "2025"]);
  assert.equal(catalogUrl(a, a.manifest.catalogs![0], { genre: "Sci-Fi", skip: "100" }), "https://x/catalog/movie/top/genre=Sci-Fi&skip=100.json");
});

test("équivalent IMDb pour les animés Kitsu", () => {
  const meta = { id: "kitsu:1", imdb_id: "tt0213338" };
  assert.deepEqual(imdbEquivalent(meta, { id: "kitsu:1:3", episode: 3, imdb_id: "tt0213338", imdbSeason: 1, imdbEpisode: 3 }), { type: "series", id: "tt0213338:1:3" });
  assert.equal(imdbEquivalent(meta, { id: "kitsu:1:3", episode: 3 }), null); // épisode sans correspondance
  assert.deepEqual(imdbEquivalent({ id: "kitsu:9", imdb_id: "tt0245429" }), { type: "movie", id: "tt0245429" }); // film
  assert.equal(imdbEquivalent({ id: "tt0903747" }), null); // déjà IMDb
});
