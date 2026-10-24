import QRCode from "qrcode";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import Svg, { Rect } from "react-native-svg";
import { API } from "../../../app/src/lib/api";
import { C, font } from "../../../app/src/components/theme";
import { BrandMark } from "./BrandMark";
import { signIn } from "../lib/session";

type Pending = { code: string; secret: string; expiresAt: number };

/** Premier lancement : code + QR code à valider sur le site (meowwatch.vkzdev.com/tv) depuis un appareil connecté. */
export function Pair() {
  const [p, setP] = useState<Pending | null>(null);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  const ask = () => fetch(`${API}/api/tv/start`, { method: "POST" }).then(r => r.json()).then(setP, () => setError("Pas de connexion au serveur Meow Watch. Vérifie le réseau de la télé."));
  useEffect(() => { ask(); }, []);
  // La télé demande toutes les 2 s si le code a été validé ; un code expiré est remplacé.
  useEffect(() => {
    if (!p) return;
    const t = setInterval(async () => {
      setNow(Date.now());
      if (Date.now() > p.expiresAt) { setP(null); return ask(); }
      const r = await fetch(`${API}/api/tv/poll?code=${p.code}&secret=${p.secret}`).then(x => x.json()).catch(() => null);
      if (r?.token) { clearInterval(t); await signIn(r.token); }
    }, 2000);
    return () => clearInterval(t);
  }, [p]);
  const url = p ? `${API}/tv?code=${p.code}` : "";
  const qr = useMemo(() => (url ? QRCode.create(url, { errorCorrectionLevel: "M" }).modules : null), [url]);
  const minutes = p ? Math.max(1, Math.ceil((p.expiresAt - now) / 60000)) : 0;

  return (
    <View style={st.page}>
      <View style={st.brand}><BrandMark size={28} /><Text style={font(700, 16)}>Meow Watch</Text></View>
      <View style={st.row}>
        <View style={{ maxWidth: 400 }}>
          <Text style={font(700, 30)}>Connecte ta télé</Text>
          <Text style={[font(400, 14, C.soft), st.p]}>Sur ton téléphone ou ton ordinateur, déjà connecté à Meow Watch, va sur</Text>
          <Text style={font(700, 16)}>{API.replace(/^https?:\/\//, "")}/tv</Text>
          <View style={st.code}>
            {p ? [...p.code].map((c, i) => <View key={i} style={[st.char, i === 3 && { marginLeft: 16 }]}><Text style={font(700, 32)}>{c}</Text></View>) : <ActivityIndicator color={C.ink} />}
          </View>
          <Text style={font(400, 14, C.soft)}>et saisis ce code, ou scanne le QR code.</Text>
          <Text style={[font(400, 12, C.faint), { marginTop: 16 }]}>{error || (p ? `En attente de validation… le code change dans ${minutes} min` : "")}</Text>
        </View>
        <View style={st.qr}>
          {qr ? (
            <Svg width={176} height={176} viewBox={`0 0 ${qr.size} ${qr.size}`}>
              {Array.from(qr.data).map((on, i) => (on ? <Rect key={i} x={i % qr.size} y={Math.floor(i / qr.size)} width={1.02} height={1.02} fill="#000" /> : null))}
            </Svg>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  page: { flex: 1, backgroundColor: C.chrome, padding: 48 },
  brand: { flexDirection: "row", alignItems: "center", gap: 10 },
  row: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 70 },
  p: { marginTop: 10, marginBottom: 6, lineHeight: 20 },
  code: { flexDirection: "row", gap: 7, marginVertical: 22, minHeight: 60, alignItems: "center" },
  char: { width: 46, height: 60, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" },
  qr: { width: 200, height: 200, borderRadius: 12, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
});
