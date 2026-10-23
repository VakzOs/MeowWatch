import { test } from "node:test";
import assert from "node:assert/strict";
import { isDone, mergeNewest, type Progress } from "./sync.ts";

const p = (id: string, updatedAt: number, time = 100, done?: boolean): Progress =>
  ({ meta: { id, type: "movie", name: id }, videoId: id, time, duration: 1000, updatedAt, done });

test("la reprise la plus récente gagne, et seul le plus récent local remonte au serveur", () => {
  const local = { a: p("a", 5, 500), b: p("b", 1), c: p("c", 9) };
  const remote = [p("a", 3, 300), p("b", 4, 0, true), p("d", 2)];
  const { merged, toPush } = mergeNewest(local, remote);
  assert.equal(merged.a.time, 500);
  assert.equal(merged.b.done, true); // fini sur un autre appareil : l'ancienne reprise locale ne revient pas
  assert.ok(merged.c && merged.d);
  assert.deepEqual(toPush.map(x => x.meta.id).sort(), ["a", "c"]);
});

test("fini à 95 %", () => {
  assert.ok(isDone({ time: 960, duration: 1000 }));
  assert.ok(!isDone({ time: 940, duration: 1000 }));
  assert.ok(!isDone({ time: 10, duration: 0 }));
});
