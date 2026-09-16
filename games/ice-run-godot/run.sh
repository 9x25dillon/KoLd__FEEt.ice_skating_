#!/usr/bin/env bash
set -euo pipefail
game_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
node "${game_root}/tools/prepare.mjs"
"${GODOT_BIN:-godot4}" --headless --path "${game_root}" --editor --import --quit
exec "${GODOT_BIN:-godot4}" --path "${game_root}" "$@"
