import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeUrl, supports, homeCatalogs, searchCatalogs, discoverCatalogs, genreOptions, filledGenres, catalogUrl, configureUrl, describe, imdbEquivalent, streamTags, nextEpisode, pickNextStream, fromStremio, fromStremioFR, searchCatalog, hostInstalled, type Addon } from "./addons.ts";

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

test("describe garde tout le texte de l'addon et ne prend pas un débit pour une taille", () => {
  const d = describe({ addon: "Lumio", url: "https://x", name: "[AD] Lumio", title: "Lumio · 1080p · BluRay · ~5,1 Mb/s\nFrieren.S01E01.MULTi.1080p.mkv\n🔊 FR, JA · AAC 2.0", behaviorHints: { filename: "Frieren.S01E01.MULTi.1080p.mkv" } });
  assert.equal(d.size, "");
  assert.deepEqual(d.details, ["Frieren.S01E01.MULTi.1080p.mkv", "FR, JA · AAC 2.0"]);
  assert.deepEqual(describe({ addon: "A", url: "https://x", title: "Ligne", behaviorHints: { filename: "f.mkv", videoSize: 2e9 } }), { quality: "Flux", source: "A · Ligne", details: ["f.mkv"], file: "f.mkv", chips: [], langs: [], multi: false, size: "2,0 Go", playable: true, external: false });
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

test("pastilles et drapeaux d'un flux façon Lumio", () => {
  const t = streamTags({ name: "[AD] Lumio", title: "Lumio · Salon · 1080p · BluRay REMUX · 29 Mb/s\n🇫🇷 🇯🇵 ✓ · 💾 5,2 Go · 🔍 DMM | YGG\nH264 · DTS-HD MA 2.0", behaviorHints: { filename: "Shingeki.No.Kyojin.S01E01.MULTi.1080p.BluRay.REMUX.AVC.DTS-HDMA.2.0-Psaro.mkv" } });
  assert.deepEqual(t, { chips: ["1080p", "REMUX", "H264", "DTS-HD MA 2.0", "29 Mb/s"], langs: ["fr", "jp"], multi: true });
  assert.deepEqual(streamTags({ title: "Film.2160p.WEB-DL.DV.HDR.x265.TrueHD.Atmos.7.1.VFF.mkv" }), { chips: ["4K", "WEB-DL", "Dolby Vision", "HEVC", "Atmos 7.1"], langs: ["fr"], multi: false });
});

test("épisode suivant et son flux (même groupe que l'épisode en cours)", () => {
  const v = (season: number | undefined, episode: number, released = "2020-01-01") => ({ id: `tt1:${season}:${episode}`, season, episode, released });
  const videos = [v(1, 2), v(0, 1), v(1, 1), v(2, 1), v(2, 2, "2999-01-01")];
  assert.equal(nextEpisode(videos, "tt1:1:1")?.id, "tt1:1:2");
  assert.equal(nextEpisode(videos, "tt1:1:2")?.id, "tt1:2:1"); // saison suivante, spéciaux sautés
  assert.equal(nextEpisode(videos, "tt1:2:1"), null); // pas encore sorti
  assert.equal(nextEpisode(videos, "inconnu"), null);
  const s = (addon: string, binge?: string, url = "https://x") => ({ addon, url, behaviorHints: { bingeGroup: binge } });
  const list = [{ addon: "A", title: "avis" }, s("A", "a-720"), s("B", "b-1080"), s("A", "a-1080")];
  assert.equal(pickNextStream(list, "a-1080", "A")?.behaviorHints?.bingeGroup, "a-1080");
  assert.equal(pickNextStream(list, "z", "B")?.addon, "B");
  assert.equal(pickNextStream(list)?.behaviorHints?.bingeGroup, "a-720");
});

test("filledGenres retire les genres vides et garde ceux en erreur", async () => {
  const kitsu: Addon = { url: "https://k.dev/manifest.json", manifest: { id: "k", name: "Kitsu", resources: ["catalog"], types: ["anime"], catalogs: [
    { type: "anime", id: "airing", extra: [{ name: "genre", options: ["Action", "Cars", "Slice of Life", "Panne"] }] }] } };
  const real = globalThis.fetch;
  globalThis.fetch = (async (u: string) => {
    if (u.includes("Panne")) return new Response("", { status: 500 });
    return Response.json({ metas: /Action|Slice%20of%20Life/.test(u) ? [{ id: "kitsu:1" }] : [] });
  }) as typeof fetch;
  try {
    assert.deepEqual(await filledGenres(kitsu, kitsu.manifest.catalogs![0]), ["Action", "Slice of Life", "Panne"]);
  } finally { globalThis.fetch = real; }
});

test("catalogues d'addons : Stremio, StremioFR, recherche et addons déjà installés", () => {
  const stremio = fromStremio([
    { transportUrl: "https://t.dev/manifest.json", manifest: { id: "t", name: "Torrentio", resources: ["stream"], behaviorHints: { configurable: true } } },
    { transportUrl: "https://c.dev/manifest.json", manifest: { id: "c", name: "Cfg", behaviorHints: { configurationRequired: true } } },
    { transportUrl: "stremio://x", manifest: { id: "x", name: "X" } }, { transportUrl: "https://n.dev/manifest.json" },
  ]);
  assert.deepEqual(stremio.map(e => e.hosts[0]), [{ manifest: "https://t.dev/manifest.json" }, { configure: "https://c.dev/configure" }]);
  assert.equal(stremio[0].tag, "flux");

  const fr = fromStremioFR({
    streaming: [{ id: "lumio", name: "Lumio", description: "Addon français", instances: [{ label: "A", url: "https://l.tv", manifestUrl: "https://l.tv/configure/manifest.json" }] },
      { id: "comet", name: "Comet", instances: [{ label: "E", url: "https://comet.e.com" }, { label: "F", url: "https://comet.f.com" }] }],
    catalogue: [{ id: "vide", name: "Vide", instances: [] }],
  }, { "comet::https://comet.e.com": { state: "up" }, "comet::https://comet.f.com": { state: "down" } });
  assert.deepEqual(fr.map(e => [e.name, e.tag]), [["Lumio", "flux"], ["Comet", "flux"]]);
  assert.deepEqual(fr[1].hosts, [{ label: "E", configure: "https://comet.e.com", up: true }, { label: "F", configure: "https://comet.f.com", up: false }]);
  assert.equal(fr[0].hosts[0].up, undefined);

  assert.deepEqual(searchCatalog([...stremio, ...fr], "FRANÇAIS").map(e => e.name), ["Lumio"]);
  assert.equal(searchCatalog(fr, " ").length, 2);
  const mine = [{ url: "https://comet.e.com/eyJjb25maWciOjF9/manifest.json", manifest: { id: "comet", name: "Comet" } }];
  assert.deepEqual(fr[1].hosts.map(h => hostInstalled(h, mine)), [true, false]);
});
