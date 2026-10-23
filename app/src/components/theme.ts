import type { TextStyle } from "react-native";

// DA validée (C3) : graphite, rouge du logo, Instrument Sans.
export const C = {
  ground: "#121214",
  chrome: "#0B0B0C",
  raised: "#18181B",
  raisedHover: "#24242A",
  field: "#1C1C1F",
  ink: "#FFFFFF",
  soft: "#D4D4D8",
  mute: "#A8A8AD",
  faint: "#8A8A90",
  red: "#D6182A",
};

const FAMILY = { 400: "InstrumentSans_400Regular", 500: "InstrumentSans_500Medium", 600: "InstrumentSans_600SemiBold", 700: "InstrumentSans_700Bold" };
export const font = (weight: keyof typeof FAMILY, size: number, color: string = C.ink): TextStyle => ({ fontFamily: FAMILY[weight], fontSize: size, color });

export const TYPE_FR: Record<string, string> = { movie: "Films", series: "Séries", channel: "Chaînes", tv: "TV", anime: "Animés" };
const GENRE_FR: Record<string, string> = {
  Drama: "Drame", Action: "Action", Adventure: "Aventure", Comedy: "Comédie", Thriller: "Thriller", Horror: "Horreur",
  Crime: "Policier", "Sci-Fi": "SF", Fantasy: "Fantastique", Mystery: "Mystère", Animation: "Animation", Biography: "Biopic",
  History: "Histoire", Documentary: "Documentaire", Family: "Famille", War: "Guerre", Romance: "Romance", Music: "Musique", Western: "Western",
};
// Noms des catalogues de Cinemeta (en anglais) ; ceux des autres addons restent tels quels.
const CATALOG_FR: Record<string, string> = { Popular: "Populaires", New: "Nouveautés", Featured: "À la une", Top: "Les mieux notés", Trending: "Tendances" };
export const catalogName = (name?: string, id?: string) => CATALOG_FR[name ?? ""] ?? name ?? id ?? "";
export const genreList = (g?: string[]) => (g ?? []).map(x => GENRE_FR[x] ?? x);
export const genres = (g?: string[]) => genreList(g).slice(0, 2).join(", ");
