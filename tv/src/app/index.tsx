import { useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { catalogName, TYPE_FR } from "../../../app/src/components/theme";
import { fetchCatalog, homeCatalogs, type Meta } from "../../../app/src/lib/addons";
import { useStore, visibleAddons } from "../../../app/src/lib/store";
import { Backdrop, HeroText } from "../components/Hero";
import { Shelf, type Tile } from "../components/Shelf";
import { openTitle } from "../lib/nav";

/** Accueil (maquette B) : grand visuel du titre sélectionné, puis Reprendre, Ma bibliothèque et les catalogues. */
export default function Home() {
  const addons = useStore(visibleAddons);
  const progress = useStore(s => s.progress), library = useStore(s => s.library);
  const [hero, setHero] = useState<{ meta: Meta; sub?: string } | null>(null);
  const resume = useMemo(() => Object.values(progress).filter(p => !p.done).sort((a, b) => b.updatedAt - a.updatedAt), [progress]);
  const saved = useMemo(() => Object.values(library).filter(i => !i.removed).sort((a, b) => b.addedAt - a.addedAt), [library]);
  const loadResume = useMemo(() => async (): Promise<Tile[]> => resume.map(p => ({ meta: p.meta as Meta, wide: true, progress: p.duration ? p.time / p.duration : 0, sub: p.label })), [resume]);
  const loadSaved = useMemo(() => async (): Promise<Tile[]> => saved.map(i => ({ meta: i.meta as Meta })), [saved]);
  const rows = useMemo(() => homeCatalogs(addons).map(({ addon, catalog }) => ({
    key: `${addon.url}|${catalog.type}|${catalog.id}`,
    title: `${catalogName(catalog.name, catalog.id)} · ${TYPE_FR[catalog.type] ?? catalog.type}`,
    note: addon.manifest.name,
    load: async (): Promise<Tile[]> => (await fetchCatalog(addon, catalog)).map(meta => ({ meta: { ...meta, type: meta.type || catalog.type } })),
  })), [addons]);
  const focus = (sub?: string) => (meta: Meta) => setHero({ meta, sub });

  return (
    <View style={{ flex: 1 }}>
      <Backdrop meta={hero?.meta} />
      <View style={{ paddingHorizontal: 28, paddingTop: 44 }}><HeroText meta={hero?.meta} sub={hero?.sub} /></View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 60 }}>
        {resume.length ? <Shelf first title="Reprendre" note="sur tous tes appareils" load={loadResume} onFocus={m => focus(resume.find(p => p.meta.id === m.id)?.label)(m)} onOpen={openTitle} /> : null}
        {saved.length ? <Shelf first={!resume.length} title="Ma bibliothèque" note="derniers ajouts" load={loadSaved} onFocus={focus()} onOpen={openTitle} /> : null}
        {rows.map((r, i) => <Shelf key={r.key} first={!resume.length && !saved.length && i === 0} title={r.title} note={r.note} load={r.load} onFocus={focus()} onOpen={openTitle} />)}
      </ScrollView>
    </View>
  );
}
