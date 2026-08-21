#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
SKILL_DIR="$(dirname -- "$SCRIPT_DIR")"
SOURCE_DIR="$SKILL_DIR/assets/olcli"
INSTALL_ROOT="${XDG_DATA_HOME:-$HOME/.local/share}/overleaf-remote"
INSTALL_DIR="$INSTALL_ROOT/olcli"

command -v node >/dev/null 2>&1 || {
  echo "Node.js is required. Install Node.js 18 or newer first." >&2
  exit 1
}
command -v npm >/dev/null 2>&1 || {
  echo "npm is required and normally ships with Node.js." >&2
  exit 1
}

NODE_MAJOR="$(node -p 'Number(process.versions.node.split(".")[0])')"
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "Node.js 18 or newer is required; found $(node --version)." >&2
  exit 1
fi

mkdir -p "$INSTALL_ROOT"
if [ -e "$INSTALL_DIR" ]; then
  BACKUP_DIR="$INSTALL_ROOT/olcli.backup.$(date +%Y%m%d%H%M%S)"
  mv "$INSTALL_DIR" "$BACKUP_DIR"
  echo "Previous bundled installation moved to: $BACKUP_DIR"
fi

cp -R "$SOURCE_DIR" "$INSTALL_DIR"
cd "$INSTALL_DIR"
npm install
npm run build
npm link

echo
echo "Installed: $(command -v olcli)"
olcli --version
echo "Next: read references/setup-and-cookie.md, then run olcli auth --cookie 'VALUE'."
