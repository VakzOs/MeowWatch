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
  // Genres des addons d'animés (Kitsu…)
  Space: "Espace", "Slice of Life": "Tranche de vie", Supernatural: "Surnaturel", Sports: "Sport", Psychological: "Psychologique",
  Magic: "Magie", School: "École", Military: "Militaire", Historical: "Historique", Mecha: "Mecha", Ecchi: "Ecchi", Shounen: "Shōnen", Shoujo: "Shōjo", Seinen: "Seinen", Josei: "Josei", Isekai: "Isekai",
  "Science Fiction": "Science-fiction", "School Life": "Vie scolaire", Idol: "Idols", "Martial Arts": "Arts martiaux", Swordplay: "Combats au sabre",
  "Super Power": "Super-pouvoirs", "Magical Girl": "Magical girl", Demon: "Démons", Vampire: "Vampires", "Virtual Reality": "Réalité virtuelle",
  Motorsport: "Sport automobile", Cops: "Police", Parody: "Parodie", Kids: "Enfants", Friendship: "Amitié", "Gender Bender": "Changement de sexe",
  "Anime Influenced": "Inspiré des animés", Dementia: "Expérimental", Samurai: "Samouraïs", Detective: "Détective", "Post Apocalypse": "Post-apocalyptique",
  Robot: "Robots", "Piloted Robot": "Robots pilotés", "Super Robot": "Super robots", Alien: "Extraterrestres", Superhero: "Super-héros",
  Henshin: "Transformation (henshin)", "Time Travel": "Voyage dans le temps", "Parallel Universe": "Univers parallèle", "Card Games": "Jeux de cartes",
  Cooking: "Cuisine", "Working Life": "Vie professionnelle", "Coming Of Age": "Passage à l'âge adulte", "Law And Order": "Justice",
  Politics: "Politique", Zombie: "Zombies", Ghost: "Fantômes", Dragon: "Dragons", Elf: "Elfes", Deity: "Divinités", Angel: "Anges", Ninja: "Ninjas",
  Pirate: "Pirates", Mafia: "Mafia", Assassin: "Assassins", Revenge: "Vengeance", Dystopia: "Dystopie", Cyberpunk: "Cyberpunk", Steampunk: "Steampunk",
  "Dark Fantasy": "Dark fantasy", "Space Opera": "Space opera", "Reverse Harem": "Harem inversé", Anthropomorphism: "Animaux humanisés",
  Baseball: "Baseball", Soccer: "Football", Basketball: "Basket", "Musical Band": "Groupe de musique", Disaster: "Catastrophe",
  "Battle Royale": "Battle royale", Countryside: "Campagne", Maid: "Soubrettes", "Fantasy World": "Monde fantastique",
  "Contemporary Fantasy": "Fantastique contemporain", "High School": "Lycée", Slapstick: "Burlesque", Conspiracy: "Complot",
};
// Noms des catalogues de Cinemeta (en anglais) ; ceux des autres addons restent tels quels.
const CATALOG_FR: Record<string, string> = { Popular: "Populaires", New: "Nouveautés", Featured: "À la une", Top: "Les mieux notés", Trending: "Tendances" };
export const catalogName = (name?: string, id?: string) => CATALOG_FR[name ?? ""] ?? name ?? id ?? "";
export const genreList = (g?: string[]) => (g ?? []).map(x => GENRE_FR[x] ?? x);
export const genres = (g?: string[]) => genreList(g).slice(0, 2).join(", ");
