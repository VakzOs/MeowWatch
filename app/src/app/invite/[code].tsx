import { Redirect } from "expo-router";

// Déjà connecté : l'invitation ne sert plus, retour à l'accueil.
export default function Invite() {
  return <Redirect href="/" />;
}
