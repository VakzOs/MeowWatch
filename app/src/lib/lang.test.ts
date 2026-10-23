import { test } from "node:test";
import assert from "node:assert/strict";
import { flagOf, langCode, langName, trackLabel } from "./lang.ts";

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
