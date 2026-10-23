import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Icon } from "./Icon";
import { C, font } from "./theme";

type Opt = { k: string; label: string; note?: string };

/** Menu déroulant (comme les filtres de Stremio) ; un seul ouvert à la fois, un clic ailleurs le ferme. */
export function Select({ id, open, setOpen, items, value, onChange }: { id: string; open: string | null; setOpen: (id: string | null) => void; items: Opt[]; value?: string; onChange: (k: string) => void }) {
  const isOpen = open === id;
  const cur = items.find(i => i.k === value) ?? items[0];
  return (
    <View style={{ zIndex: isOpen ? 20 : 1 }}>
      <Pressable onPress={() => setOpen(isOpen ? null : id)} style={({ hovered }: any) => [st.select, (hovered || isOpen) && { backgroundColor: "rgba(255,255,255,0.12)" }]}>
        <Text style={font(600, 15)} numberOfLines={1}>{cur?.label}</Text>
        <Icon name={isOpen ? "up" : "down"} size={16} color={C.mute} />
      </Pressable>
      {isOpen ? (
        <>
          <Pressable onPress={() => setOpen(null)} style={st.backdrop} accessibilityLabel="Fermer le menu" />
          <ScrollView style={st.menu} contentContainerStyle={{ padding: 6 }}>
            {items.map(i => {
              const on = i.k === cur?.k;
              return (
                <Pressable key={i.k} onPress={() => { onChange(i.k); setOpen(null); }} style={({ hovered }: any) => [st.option, hovered && { backgroundColor: "rgba(255,255,255,0.08)" }]}>
                  <Text style={[font(on ? 700 : 500, 14, on ? C.ink : C.soft), { flex: 1 }]}>{i.label}</Text>
                  {i.note ? <Text style={font(500, 12, C.faint)}>{i.note}</Text> : null}
                  {on ? <View style={st.dot} /> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </>
      ) : null}
    </View>
  );
}

const st = StyleSheet.create({
  select: { flexDirection: "row", alignItems: "center", gap: 10, height: 44, minWidth: 170, paddingHorizontal: 16, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.07)", justifyContent: "space-between" },
  backdrop: { position: "fixed" as any, top: 0, left: 0, right: 0, bottom: 0 },
  menu: { position: "absolute", top: 50, left: 0, minWidth: 220, maxHeight: 380, borderRadius: 12, backgroundColor: "#1A1A1D", boxShadow: "0 12px 32px rgba(0,0,0,0.5)" } as any,
  option: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.red },
});
