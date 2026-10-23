// Avatars de profil : le chat d'Eric (style avatar Discord) dans les couleurs de ses déclinaisons.
// Pour en ajouter : déposer l'image dans assets/avatars/ et l'inscrire ici. Le serveur ne garde que la clé.
export const AVATARS: { key: string; src: number; color: string }[] = [
  { key: "chat-rouge", src: require("../../assets/avatars/chat-rouge.png"), color: "#D6182A" },
  { key: "chat-orange", src: require("../../assets/avatars/chat-orange.png"), color: "#F97316" },
  { key: "chat-tournesol", src: require("../../assets/avatars/chat-tournesol.png"), color: "#F5B014" },
  { key: "chat-lime", src: require("../../assets/avatars/chat-lime.png"), color: "#84CC16" },
  { key: "chat-cyan", src: require("../../assets/avatars/chat-cyan.png"), color: "#14C9D2" },
  { key: "chat-blurple", src: require("../../assets/avatars/chat-blurple.png"), color: "#5865F2" },
  { key: "chat-noir", src: require("../../assets/avatars/chat-noir.png"), color: "#1C1A17" },
];
// Clés des premiers avatars (tampons), déjà enregistrées sur des profils.
const OLD: Record<string, string> = { "chat-vert": "chat-lime", "chat-bleu": "chat-blurple", "chat-violet": "chat-blurple" };
export const avatarSrc = (key?: string | null) => AVATARS.find(a => a.key === (key && OLD[key] || key))?.src;
