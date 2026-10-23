import { Image } from "expo-image";

/** Logo de la marque (kit d'Eric) : comme le petit logo de Meow Recipes, mais en rouge. */
export function BrandMark({ size }: { size: number }) {
  return <Image source={require("../../assets/brand/chat-rouge-net.svg")} style={{ width: size, height: size }} contentFit="contain" />;
}
