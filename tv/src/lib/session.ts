// Session de la télé : jeton reçu par la connexion par code, gardé sur l'appareil.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { setToken } from "../../../app/src/lib/api";
import { load, logout } from "../../../app/src/lib/store";

const KEY = "meowwatch:tv-token";

/** Au démarrage : reprend le jeton enregistré, puis charge le compte (comme le site). */
export async function start() {
  setToken((await AsyncStorage.getItem(KEY).catch(() => null)) ?? "");
  await load();
}

/** Après validation du code sur le site. */
export async function signIn(token: string) {
  await AsyncStorage.setItem(KEY, token).catch(() => {});
  setToken(token);
  await load();
}

export async function signOut() {
  await logout();
  await AsyncStorage.removeItem(KEY).catch(() => {});
  setToken("");
}
