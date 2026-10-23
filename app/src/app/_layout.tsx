import { InstrumentSans_400Regular, InstrumentSans_500Medium, InstrumentSans_600SemiBold, InstrumentSans_700Bold, useFonts } from "@expo-google-fonts/instrument-sans";
import { Stack, useGlobalSearchParams, usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { Login } from "../components/Login";
import { C } from "../components/theme";
import { api } from "../lib/api";
import { load, useStore } from "../lib/store";

export default function Root() {
  const [fonts] = useFonts({ InstrumentSans_400Regular, InstrumentSans_500Medium, InstrumentSans_600SemiBold, InstrumentSans_700Bold });
  const ready = useStore(s => s.ready);
  const user = useStore(s => s.user);
  const path = usePathname();
  const { erreur } = useGlobalSearchParams<{ erreur?: string }>();
  useEffect(() => { load(); }, []);

  // /invite/<code> : on vérifie le lien avant de proposer la connexion.
  const code = path.match(/^\/invite\/([\w-]+)/)?.[1];
  const [valid, setValid] = useState<boolean | null>(null);
  useEffect(() => { if (code) api(`/api/invite?code=${code}`).then(() => setValid(true), () => setValid(false)); }, [code]);

  if (!fonts || !ready) return <View style={{ flex: 1, backgroundColor: C.chrome }} />;
  if (!user) return <Login error={erreur} invite={code ? { code, valid } : undefined} />;
  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.chrome }, animation: "fade" }} />
    </>
  );
}
