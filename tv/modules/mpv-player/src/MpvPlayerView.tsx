import { requireNativeView } from "expo";
import { forwardRef, type ComponentType, type Ref } from "react";
import { Platform, View } from "react-native";
import type { MpvPlayerRef, MpvPlayerViewProps } from "./MpvPlayer.types";

const NativeView: ComponentType<MpvPlayerViewProps & { ref?: Ref<MpvPlayerRef> }> = Platform.OS === "android" ? requireNativeView("MpvPlayer") : View as any; // aperçu web : écran noir

/** Vue native où mpv dessine la vidéo (Android). */
export const MpvPlayerView = forwardRef<MpvPlayerRef, MpvPlayerViewProps>((props, ref) => <NativeView {...props} ref={ref} />);
export * from "./MpvPlayer.types";
