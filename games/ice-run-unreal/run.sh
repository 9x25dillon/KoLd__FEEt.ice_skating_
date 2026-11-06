#!/usr/bin/env bash
# Prepares and opens the Unreal client. Arguments pass to the game, e.g. -IceSetup=simulation.
set -euo pipefail
game_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
engine="${UE_ROOT:-$HOME/UnrealEngine/Linux_Unreal_Engine_5.8.4}"
node "${game_root}/tools/prepare.mjs"
exec "${engine}/Engine/Binaries/Linux/UnrealEditor" "${game_root}/IceRun.uproject" -game -windowed -ResX=1600 -ResY=900 "$@"
