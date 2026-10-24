// L'appli télé réutilise le code du site (app/src/lib, le thème, les avatars) : Metro surveille ce dossier, mais résout toutes les
// dépendances dans tv/node_modules (sinon React serait chargé deux fois, depuis app/ et depuis tv/).
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
config.watchFolders = [path.resolve(__dirname, "../app/src"), path.resolve(__dirname, "../app/assets")];
config.resolver.nodeModulesPaths = [path.resolve(__dirname, "node_modules")];
config.resolver.disableHierarchicalLookup = true;
module.exports = config;
