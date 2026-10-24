import { test } from "node:test";
import assert from "node:assert/strict";
import { fromChapters } from "./skip.ts";

test("repères tirés des chapitres nommés", () => {
  const anime = [{ title: "Prologue", start: 0 }, { title: "Opening", start: 90 }, { title: "Partie A", start: 180 }, { title: "Ending", start: 1290 }, { title: "Preview", start: 1380 }];
  assert.deepEqual(fromChapters(anime, 1420), { intro: [90, 180], credits: 1290 });
  // « Générique » seul : intro s'il est au début, générique de fin s'il est à la fin
  assert.deepEqual(fromChapters([{ title: "Générique", start: 0 }, { title: "Épisode", start: 60 }, { title: "Générique", start: 2400 }], 2500), { intro: [0, 60], credits: 2400 });
  // chapitres sans nom : rien (on garde les 20 s avant la fin)
  assert.deepEqual(fromChapters([{ title: "Chapitre 01", start: 0 }, { title: "Chapitre 02", start: 600 }], 2500), {});
});
