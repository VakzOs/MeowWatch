import { test } from "node:test";
import assert from "node:assert/strict";
import { chooseTracks, flagOf, isAnime, parseVtt, langCode, langName, trackLabel } from "./lang.ts";

test("codes de langue des pistes", () => {
  assert.equal(langCode("fre"), "fr");
  assert.equal(langCode("jpn"), "ja");
  assert.equal(langCode("en-US"), "en");
  assert.equal(langCode("und", "VFF 5.1"), "fr");
  assert.equal(langCode("", "Japanese"), "ja");
  assert.equal(langCode("und"), "");
});

test("noms, drapeaux et libellés en français", () => {
  assert.equal(langName("ja"), "Japonais");
  assert.equal(langName(""), "Langue inconnue");
  assert.equal(flagOf("ja"), "jp");
  assert.equal(flagOf("fr"), "fr");
  assert.equal(trackLabel("fr", "Français", ["5.1"]), "Français · 5.1");
  assert.equal(trackLabel("ja", "Signs & Songs"), "Japonais · Signs & Songs");
});

test("pistes choisies au lancement selon les préférences", () => {
  const audio = [{ id: 1, lang: "ja" }, { id: 2, lang: "fr" }];
  const subs = [{ id: 3, lang: "fr", forced: true }, { id: 4, lang: "fr" }, { id: 5, lang: "en" }];
  assert.deepEqual(chooseTracks({ audio: "ja", subs: "fr" }, audio, 1, subs, []), { audio: 1, sub: { id: 4 } });
  // Audio français sans sous-titres : on garde les forcés français.
  assert.deepEqual(chooseTracks({ audio: "fr", subs: "" }, audio, 1, subs, []), { audio: 2, sub: { id: 3 } });
  // Langue absente : piste par défaut ; sous-titres pris chez les addons.
  assert.deepEqual(chooseTracks({ audio: "de", subs: "es" }, audio, 1, subs, [{ lang: "en" }, { lang: "es" }]), { audio: undefined, sub: { ext: 1 } });
  assert.deepEqual(chooseTracks({ audio: "vo", subs: "it" }, audio, 1, [], []), { audio: undefined, sub: null });
  // Second choix quand le premier n'existe pas.
  assert.deepEqual(chooseTracks({ audio: "de", audio2: "fr", subs: "it", subs2: "en" }, audio, 1, subs, []), { audio: 2, sub: { id: 5 } });
  assert.deepEqual(chooseTracks({ audio: "de", audio2: "vo", subs: "", subs2: "en" }, audio, 1, [], []), { audio: undefined, sub: null });
});

test("répliques d'un WebVTT", () => {
  const cues = parseVtt("WEBVTT\n\n1\n00:00:01.500 --> 00:00:03.000 align:center\n<i>Salut</i>\nça va ?\n\n2\n01:02.000 --> 01:04.250\nFin\n");
  assert.deepEqual(cues, [{ start: 1.5, end: 3, text: "Salut\nça va ?" }, { start: 62, end: 64.25, text: "Fin" }]);
});

test("reconnaître un animé", () => {
  assert.ok(isAnime("series", "tt0112159", ["Animation", "Drama"], "Japan"));
  assert.ok(isAnime("anime", "kitsu:1"));
  assert.ok(isAnime("series", "tt1", ["Animation"], "", "ja"));
  assert.ok(!isAnime("series", "tt11126994", ["Animation"], "United States")); // Arcane
  assert.equal(langCode("pob"), "pt");
});
