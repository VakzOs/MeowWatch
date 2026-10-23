import { InstrumentSans_400Regular, InstrumentSans_500Medium, InstrumentSans_600SemiBold, InstrumentSans_700Bold, useFonts } from "@expo-google-fonts/instrument-sans";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { View } from "react-native";
import { C } from "../components/theme";
import { load, useStore } from "../lib/store";

export default function Root() {
  const [fonts] = useFonts({ InstrumentSans_400Regular, InstrumentSans_500Medium, InstrumentSans_600SemiBold, InstrumentSans_700Bold });
  const ready = useStore(s => s.ready);
  useEffect(() => { load(); }, []);
  if (!fonts || !ready) return <View style={{ flex: 1, backgroundColor: C.chrome }} />;
  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.chrome }, animation: "fade" }} />
    </>
  );
}
