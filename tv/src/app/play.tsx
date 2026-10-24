import { router, useLocalSearchParams } from "expo-router";
import { Text, View } from "react-native";
import { C, font } from "../../../app/src/components/theme";
import { Focus } from "../components/Focus";

/** Lecteur : mpv (à venir). */
export default function Play() {
  const p = useLocalSearchParams<{ name: string; label: string }>();
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 16 }}>
      <Text style={font(700, 22)}>{p.name} {p.label}</Text>
      <Text style={font(500, 14, C.mute)}>Le lecteur mpv arrive dans la prochaine étape.</Text>
      <Focus preferred onPress={() => router.back()} style={{ padding: 12, borderRadius: 10, borderWidth: 2, borderColor: "transparent", backgroundColor: "rgba(255,255,255,0.12)" }}><Text style={font(600, 14)}>Retour</Text></Focus>
    </View>
  );
}
