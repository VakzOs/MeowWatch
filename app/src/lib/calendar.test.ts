import { test } from "node:test";
import assert from "node:assert/strict";
import { dayKey, episodesByDay, monthGrid } from "./calendar.ts";

test("grille du mois : 6 semaines, lundi en premier", () => {
  const g = monthGrid(2026, 9); // octobre 2026 commence un jeudi
  assert.equal(g.length, 42);
  assert.equal(dayKey(g[0]), "2026-09-28");
  assert.equal(g[0].getDay(), 1);
});

test("épisodes rangés par jour, hors du mois écartés", () => {
  const meta = (name: string, released: string[]) => ({ id: name, type: "series", name, videos: released.map((r, i) => ({ id: `${name}:1:${i + 1}`, season: 1, episode: i + 1, released: r })) });
  const days = episodesByDay([meta("B", ["2026-10-05T12:00:00Z", "2026-11-02T12:00:00Z"]), meta("A", ["2026-10-05T12:00:00Z", "pas une date"])], new Date(2026, 9, 1), new Date(2026, 10, 1));
  assert.deepEqual(Object.keys(days), ["2026-10-05"]);
  assert.deepEqual(days["2026-10-05"].map(e => e.meta.name), ["A", "B"]);
});
