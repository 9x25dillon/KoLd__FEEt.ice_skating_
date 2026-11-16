#!/bin/sh
# Stands in for Node as ICE_RUN_NODE, to watch the clients' tick-debt counter:
#
#   ICE_RUN_NODE="$PWD/games/ice-run-godot/tools/stall_node.sh" \
#     godot4 --headless --path games/ice-run-godot -- --smoke-test
#
# It runs the real host with stall.mjs preloaded. ICE_STALL_NODE names the Node to use.
here=$(cd "$(dirname "$0")" && pwd)
exec "${ICE_STALL_NODE:-node}" --import "$here/stall.mjs" "$@"
