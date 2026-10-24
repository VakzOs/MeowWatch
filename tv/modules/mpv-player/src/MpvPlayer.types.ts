import type { StyleProp, ViewStyle } from "react-native";

export type MpvTrack = { id: number; type: "video" | "audio" | "sub" | string; lang: string; title: string; codec: string; channels: number; height: number; selected: boolean; forced: boolean };
export type MpvLoaded = { tracks: MpvTrack[]; chapters: { title: string; start: number }[]; duration: number };
export type MpvProgress = { time: number; duration: number; paused: boolean };

export type MpvPlayerViewProps = {
  style?: StyleProp<ViewStyle>;
  onLoaded?: (e: { nativeEvent: MpvLoaded }) => void;
  onProgress?: (e: { nativeEvent: MpvProgress }) => void;
  onEnded?: (e: { nativeEvent: { reason: "eof" | "error" } }) => void;
};

/** Commandes du lecteur (ref de la vue). */
export type MpvPlayerRef = {
  load(url: string, start: number): Promise<void>;
  command(args: string[]): Promise<void>;
  set(name: string, value: string): Promise<void>;
};
