// Avatars de profil. Pour en ajouter : déposer l'image dans assets/avatars/ et l'inscrire ici.
// Le serveur ne garde que la clé (minuscules, chiffres, tirets).
export const AVATARS: { key: string; src: number; color: string }[] = [
  { key: "chat-rouge", src: require("../../assets/avatars/chat-rouge.svg"), color: "#D6182A" },
  { key: "chat-orange", src: require("../../assets/avatars/chat-orange.svg"), color: "#E8833A" },
  { key: "chat-tournesol", src: require("../../assets/avatars/chat-tournesol.svg"), color: "#E5B92E" },
  { key: "chat-vert", src: require("../../assets/avatars/chat-vert.svg"), color: "#3FA66B" },
  { key: "chat-bleu", src: require("../../assets/avatars/chat-bleu.svg"), color: "#2F8FD8" },
  { key: "chat-violet", src: require("../../assets/avatars/chat-violet.svg"), color: "#8B5CF6" },
];
export const avatarSrc = (key?: string | null) => AVATARS.find(a => a.key === key)?.src;
