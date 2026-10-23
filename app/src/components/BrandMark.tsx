import { Image } from "expo-image";
import { View } from "react-native";

/** Logo de la marque, comme sur Meow Recipes et Meow Bot : le chat plat dans un carré arrondi au liseré crème. */
export function BrandMark({ size }: { size: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.24, borderWidth: Math.max(2, size / 16), borderColor: "#F5F0E6", overflow: "hidden" }}>
      <Image source={require("../../assets/avatars/chat-rouge.png")} style={{ flex: 1 }} contentFit="cover" />
    </View>
  );
}
