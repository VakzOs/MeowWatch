import { useEvent, useEventListener } from "expo";
import { router, useLocalSearchParams } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEffect, useRef } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Icon } from "../components/Icon";
import { C, font } from "../components/theme";
import { saveProgress } from "../lib/store";

type Params = { url: string; id: string; type: string; name: string; poster: string; background: string; videoId: string; label: string; start: string };

export default function Play() {
  const p = useLocalSearchParams<Params>();
  const player = useVideoPlayer(p.url, pl => { pl.timeUpdateEventInterval = 5; });
  const { status, error } = useEvent(player, "statusChange", { status: player.status });
  // Sur le web, la vidéo n'existe qu'une fois montée : on se place et on lance quand elle est prête.
  const started = useRef(false);
  useEffect(() => {
    if (status !== "readyToPlay" || started.current) return;
    started.current = true;
    if (+p.start > 0) player.currentTime = +p.start;
    player.play();
  }, [status]);

  // Position enregistrée toutes les 5 s : sert à « Reprendre ».
  useEventListener(player, "timeUpdate", ({ currentTime }) => {
    if (currentTime < 5 || !player.duration) return;
    saveProgress({
      meta: { id: p.id, type: p.type, name: p.name, poster: p.poster || undefined, background: p.background || undefined },
      videoId: p.videoId, label: p.label || undefined, time: currentTime, duration: player.duration, updatedAt: Date.now(),
    });
  });

  const back = () => (router.canGoBack() ? router.back() : router.replace("/"));
  return (
    <View style={st.root}>
      <View style={StyleSheet.absoluteFill}><VideoView player={player} style={{ width: "100%", height: "100%" }} nativeControls fullscreenOptions={{ enable: true }} allowsPictureInPicture contentFit="contain" /></View>
      <Pressable onPress={back} style={st.back} accessibilityLabel="Retour">
        <Icon name="back" color={C.ink} />
        <Text style={font(600, 15)} numberOfLines={1}>{p.name}{p.label ? ` · ${p.label}` : ""}</Text>
      </Pressable>
      {status === "error" ? (
        <View style={st.error}>
          <Text style={[font(700, 20), { marginBottom: 8 }]}>Ce flux ne se lit pas ici</Text>
          <Text style={[font(400, 15, C.soft), { lineHeight: 22, marginBottom: 20 }]}>
            Le navigateur ne connaît pas toujours le format (MKV, HEVC, audio DTS ou TrueHD). Essaie un autre flux, ou ouvre le lien dans VLC. Les applis Meow Watch (PC, Apple TV) auront un lecteur qui lit tout.{error?.message ? `\n\nDétail : ${error.message}` : ""}
          </Text>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <Pressable onPress={back} style={[st.btn, { backgroundColor: C.red }]}><Text style={font(700, 15)}>Choisir un autre flux</Text></Pressable>
            <Pressable onPress={() => Linking.openURL(p.url)} style={[st.btn, { backgroundColor: "rgba(255,255,255,0.14)" }]}><Text style={font(700, 15)}>Ouvrir le lien</Text></Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  back: { position: "absolute", top: 20, left: 20, flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, backgroundColor: "rgba(0,0,0,0.55)", maxWidth: "70%" },
  error: { position: "absolute", alignSelf: "center", top: "30%", maxWidth: 520, padding: 28, borderRadius: 14, backgroundColor: C.raised },
  btn: { height: 46, paddingHorizontal: 20, borderRadius: 10, justifyContent: "center" },
});
