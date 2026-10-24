import { InstrumentSans_400Regular, InstrumentSans_500Medium, InstrumentSans_600SemiBold, InstrumentSans_700Bold, useFonts } from "@expo-google-fonts/instrument-sans";
import { Stack, usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { View } from "react-native";
import { C } from "../../../app/src/components/theme";
import { useStore } from "../../../app/src/lib/store";
import { Pair } from "../components/Pair";
import { ProfilePicker } from "../components/Profiles";
import { Rail } from "../components/Rail";
import { start } from "../lib/session";

/** Appli télé : connexion par code, « Qui regarde ? », puis rail à gauche et pages (maquette B). */
export default function Root() {
  const [fonts] = useFonts({ InstrumentSans_400Regular, InstrumentSans_500Medium, InstrumentSans_600SemiBold, InstrumentSans_700Bold });
  const ready = useStore(s => s.ready), user = useStore(s => s.user);
  const path = usePathname();
  useEffect(() => { start(); }, []);

  let body;
  if (!fonts || !ready) body = <View style={{ flex: 1 }} />;
  else if (!user) body = <Pair />;
  else if (!user.profile) body = <ProfilePicker />;
  else {
    const full = path.startsWith("/play") || path.startsWith("/title");
    body = (
      <View style={{ flex: 1, flexDirection: "row" }}>
        {full ? null : <Rail />}
        <View style={{ flex: 1 }}><Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.chrome }, animation: "fade" }} /></View>
      </View>
    );
  }
  return <View style={{ flex: 1, backgroundColor: C.chrome }}><StatusBar hidden />{body}</View>;
}
