// Un seul APK pour la télé et le téléphone : lanceur des deux (Leanback et classique), ni télécommande ni écran tactile
// obligatoires ; seulement les processeurs ARM (télés et téléphones), pas l'émulateur x86 (libmpv pèse lourd).
const { withAndroidManifest, withAppBuildGradle } = require("expo/config-plugins");

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
  return withAppBuildGradle(config, c => {
    if (!c.modResults.contents.includes("abiFilters")) c.modResults.contents = c.modResults.contents.replace(/defaultConfig \{/, 'defaultConfig {\n        ndk { abiFilters "arm64-v8a", "armeabi-v7a" }');
    return c;
  });
};
