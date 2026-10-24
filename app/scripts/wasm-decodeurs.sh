#!/bin/bash
# Recompile public/wasm/truehd-simd.wasm et vc1-simd.wasm : les décodeurs TrueHD / MLP et VC-1 de FFmpeg au format
# des modules de libmedia (libmedia 1.3.1 n'en fournit pas). Linux ou WSL, avec git, make, node et python3. Sources : FFmpeg (LGPL/GPL)
# dans la version adaptée par libmedia, scripts de compilation de libmedia (LGPL v3).
# Emscripten 3.1.74 obligatoire : les versions 4.x ajoutent des imports (GOT.mem __stack_low…) que libmedia ne
# fournit pas, et la 6.x ne produit plus de module relogeable : le lecteur se fige.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
OUT=$HERE/../public/wasm
W=${1:-$(mktemp -d)}
cd "$W"
git clone -q --depth 1 https://github.com/emscripten-core/emsdk.git
git clone -q --depth 1 --branch libmedia7.0 https://github.com/zhaohappy/FFmpeg.git    # 3a14ab29692763e561610412cdeb1985da4e3cd8
git clone -q --depth 1 --branch v1.3.1 --recursive https://github.com/zhaohappy/libmedia.git
emsdk/emsdk install 3.1.74 && emsdk/emsdk activate 3.1.74
cd libmedia
# Nouveau décodeur « truehd » : décodeurs truehd + mlp de FFmpeg.
sed -i 's/^if \[\[ \$decode == "h263" \]\]; then/if [[ $decode == "truehd" ]]; then\n  EXTRACOMPONENTS="$EXTRACOMPONENTS --enable-decoder=mlp"\nfi\n\n&/' build/build-ffmpeg-decoder.sh
chmod +x build/*.sh
(mkdir -p ../deps && cd ../deps && npm init -y >/dev/null && npm i -s commander @libmedia/common)
mkdir -p "$OUT"
for d in truehd vc1; do
  ./build/build-ffmpeg-decoder.sh $d 1 1 0
  # VC-1 : horaires remis dans l'ordre d'affichage (MKV « V_MS/VFW », voir le correctif) ; seulement pour ce module.
  [ $d = vc1 ] && patch -p1 < "$HERE/vc1-horaires.patch"
  ./build/build-decoder.sh $d 1 1 0 || true # sa dernière étape (wasm-opt --bss) manque de dépendances : refaite ci-dessous
  [ $d = vc1 ] && patch -R -p1 < "$HERE/vc1-horaires.patch"
  NODE_PATH=../deps/node_modules node packages/cheap/build/wasm-opt.cjs -i dist/decode/$d-simd.wasm --bss -o dist/decode/$d-simd.wasm
  cp dist/decode/$d-simd.wasm "$OUT/"
done
echo "OK : $OUT"
