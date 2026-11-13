#!/usr/bin/env bash
# Build a copy of dist/ suitable for publishing as a claude.ai Artifact (stable names, served file types only).
set -e
cd "$(dirname "$0")/.."
npx vite build >/dev/null
rm -rf dist-artifact && mkdir -p dist-artifact/assets/world
JS=$(ls dist/assets/index-*.js); CSS=$(ls dist/assets/index-*.css)
cp "$JS" dist-artifact/assets/game.js; cp "$CSS" dist-artifact/assets/game.css
for f in dist/assets/selftest-*.js; do cp "$f" dist-artifact/assets/; done
# .hdr is not a served type: ship the same bytes under a .wasm name (loaded as ArrayBuffer, MIME irrelevant)
cp dist/assets/world/venice_sunset_1k.hdr dist-artifact/assets/world/venice_sunset_1k.hdr.wasm
sed -i 's#venice_sunset_1k\.hdr#venice_sunset_1k.hdr.wasm#g' dist-artifact/assets/game.js
sed -e "s#\./assets/index-[^\"]*\.js#./assets/game.js#" -e "s#\./assets/index-[^\"]*\.css#./assets/game.css#" dist/index.html > dist-artifact/index.html
ls -la dist-artifact dist-artifact/assets
# HD soldiers: .glb is not a served type -> same .wasm trick; basis transcoder .js/.wasm are served as-is
if [ -d dist/assets/soldiers ]; then
  mkdir -p dist-artifact/assets/soldiers/basis
  cp dist/assets/soldiers/soldier.glb dist-artifact/assets/soldiers/soldier.glb.wasm
  cp dist/assets/soldiers/basis/* dist-artifact/assets/soldiers/basis/
  sed -i "s#'soldier\.glb'#'soldier.glb.wasm'#g; s#\"soldier\.glb\"#\"soldier.glb.wasm\"#g" dist-artifact/assets/game.js
  grep -c "soldier.glb.wasm" dist-artifact/assets/game.js
fi
