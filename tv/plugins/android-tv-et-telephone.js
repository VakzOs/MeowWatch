// Un seul APK pour la télé et le téléphone : lanceur des deux (Leanback et classique), ni télécommande ni écran tactile
// obligatoires ; Android 8 minimum (libmpv) ; seulement les processeurs ARM (télés et téléphones), pas l'émulateur x86 (libmpv pèse lourd).
const { withAndroidManifest, withAppBuildGradle, withGradleProperties } = require("expo/config-plugins");

module.exports = config => {
  config = withAndroidManifest(config, c => {
    const m = c.modResults.manifest;
    m["uses-feature"] = (m["uses-feature"] ?? []).filter(f => !["android.software.leanback", "android.hardware.touchscreen"].includes(f.$["android:name"]));
    m["uses-feature"].push({ $: { "android:name": "android.software.leanback", "android:required": "false" } }, { $: { "android:name": "android.hardware.touchscreen", "android:required": "false" } });
    const main = m.application[0].activity.find(a => a.$["android:name"] === ".MainActivity");
    for (const f of main["intent-filter"] ?? []) {
      if (!f.action?.some(a => a.$["android:name"] === "android.intent.action.MAIN")) continue;
      const cats = (f.category ??= []).map(x => x.$["android:name"]);
      for (const n of ["android.intent.category.LAUNCHER", "android.intent.category.LEANBACK_LAUNCHER"]) if (!cats.includes(n)) f.category.push({ $: { "android:name": n } });
    }
    return c;
  });
  config = withGradleProperties(config, c => {
    c.modResults = c.modResults.filter(p => p.key !== "android.minSdkVersion");
    c.modResults.push({ type: "property", key: "android.minSdkVersion", value: "26" });
    return c;
  });
  return withAppBuildGradle(config, c => {
    let g = c.modResults.contents;
    if (!g.includes("abiFilters")) g = g.replace(/defaultConfig \{/, 'defaultConfig {\n        ndk { abiFilters "arm64-v8a", "armeabi-v7a" }');
    // GitHub Actions : clé de l'appli (MW_KEYSTORE, fichier tiré d'un secret) et numéro de version ; en local, clé de débogage.
    if (!g.includes("MW_KEYSTORE")) g = g
      .replace(/(buildTypes \{[\s\S]*?release \{[\s\S]*?)signingConfig signingConfigs\.debug/, '$1signingConfig System.getenv("MW_KEYSTORE") ? signingConfigs.release : signingConfigs.debug')
      .replace(/signingConfigs \{/, 'signingConfigs {\n        release {\n            if (System.getenv("MW_KEYSTORE")) { storeFile file(System.getenv("MW_KEYSTORE")); storePassword System.getenv("MW_KEYSTORE_PASSWORD"); keyAlias "meowwatch"; keyPassword System.getenv("MW_KEYSTORE_PASSWORD") }\n        }')
      .replace(/versionCode \d+/, 'versionCode Integer.parseInt(System.getenv("MW_VERSION_CODE") ?: "1")');
    c.modResults.contents = g;
    return c;
  });
};
