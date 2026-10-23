import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeUrl, supports, homeCatalogs, searchCatalogs, catalogUrl, describe, type Addon } from "./addons.ts";

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
