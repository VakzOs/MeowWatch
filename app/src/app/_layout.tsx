import { InstrumentSans_400Regular, InstrumentSans_500Medium, InstrumentSans_600SemiBold, InstrumentSans_700Bold, useFonts } from "@expo-google-fonts/instrument-sans";
import { DarkTheme, Stack, ThemeProvider, useGlobalSearchParams, usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { AppState, Platform, View } from "react-native";
import { Login } from "../components/Login";
import { ProfilePicker } from "../components/Profiles";
import { Shell } from "../components/Shell";
import { C } from "../components/theme";
import { api } from "../lib/api";
import { load, pull, useStore } from "../lib/store";

// Barres de défilement fines et sombres sur le web (celles de Windows sont blanches).
if (Platform.OS === "web" && typeof document !== "undefined") {
  const css = document.createElement("style");
  css.textContent = `* { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.18) transparent; }
  ::-webkit-scrollbar { width: 8px; height: 8px; } ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.18); border-radius: 4px; } ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.3); }`;
  document.head.appendChild(css);
  // Icône d'onglet : nouvelle adresse versionnée, sinon le navigateur garde l'ancienne en cache.
  document.querySelectorAll('link[rel~="icon"]').forEach(l => l.remove());
  for (const [rel, href] of [["icon", "/icon-192.png?v=2"], ["apple-touch-icon", "/apple-touch-icon.png?v=2"]]) {
    const l = document.createElement("link"); l.rel = rel; l.href = href; document.head.appendChild(l);
  }
}

const THEME = { ...DarkTheme, colors: { ...DarkTheme.colors, background: "transparent", card: "transparent" } };

export default function Root() {
  const [fonts] = useFonts({ InstrumentSans_400Regular, InstrumentSans_500Medium, InstrumentSans_600SemiBold, InstrumentSans_700Bold });
  const ready = useStore(s => s.ready);
  const user = useStore(s => s.user);
  const path = usePathname();
  const { erreur } = useGlobalSearchParams<{ erreur?: string }>();
  useEffect(() => { load(); }, []);
  // Retour sur l'appli (autre onglet, autre appareil entre-temps) : on resynchronise.
  useEffect(() => { const sub = AppState.addEventListener("change", s => s === "active" && pull()); return () => sub.remove(); }, []);

  // /invite/<code> : on vérifie le lien avant de proposer la connexion.
  const code = path.match(/^\/invite\/([\w-]+)/)?.[1];
  const [valid, setValid] = useState<boolean | null>(null);
  useEffect(() => { if (code) api(`/api/invite?code=${code}`).then(() => setValid(true), () => setValid(false)); }, [code]);

  if (!fonts || !ready) return <View style={{ flex: 1, backgroundColor: C.chrome }} />;
  if (!user) return <Login error={erreur} invite={code ? { code, valid } : undefined} />;
  if (!user.profile) return <ProfilePicker />;
  return (
    <>
      <StatusBar style="light" />
      {/* Thème sombre au fond transparent : le fond flouté de Shell reste visible derrière chaque page. */}
      <ThemeProvider value={THEME}>
        <Shell bare={path.startsWith("/play")}>
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "transparent" }, animation: "none" }} />
        </Shell>
      </ThemeProvider>
    </>
  );
}
