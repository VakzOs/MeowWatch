#!/bin/bash
# Recompile public/wasm/truehd-simd.wasm : le décodeur TrueHD / MLP de FFmpeg au format des modules de libmedia
# (libmedia 1.3.1 n'en fournit pas). Linux ou WSL, avec git, make, node et python3. Sources : FFmpeg (LGPL/GPL)
# dans la version adaptée par libmedia, scripts de compilation de libmedia (LGPL v3).
# Emscripten 3.1.74 obligatoire : les versions 4.x ajoutent des imports (GOT.mem __stack_low…) que libmedia ne
# fournit pas, et la 6.x ne produit plus de module relogeable : le lecteur se fige.
set -euo pipefail
OUT=$(cd "$(dirname "$0")/.." && pwd)/public/wasm
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
./build/build-ffmpeg-decoder.sh truehd 1 1 0
./build/build-decoder.sh truehd 1 1 0 || true # sa dernière étape (wasm-opt --bss) manque de dépendances : refaite ci-dessous
(mkdir -p ../deps && cd ../deps && npm init -y >/dev/null && npm i -s commander @libmedia/common)
NODE_PATH=../deps/node_modules node packages/cheap/build/wasm-opt.cjs -i dist/decode/truehd-simd.wasm --bss -o dist/decode/truehd-simd.wasm
mkdir -p "$OUT" && cp dist/decode/truehd-simd.wasm "$OUT/"
echo "OK : $OUT/truehd-simd.wasm"
