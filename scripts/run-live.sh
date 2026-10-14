#!/usr/bin/env bash
# Keep one `olcli live` session running inside a tmux pane.
#
#   tmux new-session -d -s olcli -n <name> "<skill>/scripts/run-live.sh <projectId>"
#
# tmux has no restart-on-crash, so this loop provides it. Running the session
# under a loop rather than a launchd KeepAlive also leaves each crash's exit
# code and timestamp in the pane's scrollback, which is what you need when a
# long-lived connection dies for a reason you did not predict.
#
# One window per project. A tmux server is a single per-user process, so every
# terminal on the machine shares the same session.
#
# Override the CLI to launch with OLCLI_BIN=/path/to/olcli.
set -uo pipefail

if [ -z "${OLCLI_BIN:-}" ]; then
  OLCLI_BIN="$(command -v olcli || true)"
fi
if [ -z "${OLCLI_BIN:-}" ] && [ -x "$HOME/.local/bin/olcli" ]; then
  OLCLI_BIN="$HOME/.local/bin/olcli"
fi
if [ -z "${OLCLI_BIN:-}" ]; then
  echo "run-live.sh: olcli is not on PATH. Install it with scripts/install_olcli.sh," >&2
  echo "or point OLCLI_BIN at the binary." >&2
  exit 1
fi

id="${1:?usage: run-live.sh <projectId>}"

while :; do
  printf '\n[%s] olcli live %s\n' "$(date '+%F %T')" "$id"
  "$OLCLI_BIN" live "$id"
  printf '[%s] olcli exited with %s; restarting in 2s\n' "$(date '+%F %T')" "$?"
  sleep 2
done
