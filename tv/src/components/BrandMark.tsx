import { Image } from "expo-image";

/** Logo du kit (comme le site). */
export function BrandMark({ size = 28 }: { size?: number }) {
  return <Image source={require("../../../app/assets/brand/chat-rouge-net.svg")} style={{ width: size, height: size }} contentFit="contain" />;
}
