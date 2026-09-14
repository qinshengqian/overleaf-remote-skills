#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
SKILL_DIR="$(dirname -- "$SCRIPT_DIR")"
SOURCE_DIR="$SKILL_DIR/assets/olcli"
INSTALL_ROOT="${XDG_DATA_HOME:-$HOME/.local/share}/overleaf-remote"
INSTALL_DIR="$INSTALL_ROOT/olcli"

command -v node >/dev/null 2>&1 || {
  echo "Node.js is required. Install Node.js 18.17 or newer first." >&2
  exit 1
}
command -v npm >/dev/null 2>&1 || {
  echo "npm is required and normally ships with Node.js." >&2
  exit 1
}

NODE_OK="$(node -p 'const [major, minor] = process.versions.node.split(".").map(Number); major > 18 || (major === 18 && minor >= 17)')"
if [ "$NODE_OK" != "true" ]; then
  echo "Node.js 18.17 or newer is required; found $(node --version)." >&2
  exit 1
fi

mkdir -p "$INSTALL_ROOT"
if [ -e "$INSTALL_DIR" ]; then
  BACKUP_DIR="$INSTALL_ROOT/olcli.backup.$(date +%Y%m%d%H%M%S)"
  mv "$INSTALL_DIR" "$BACKUP_DIR"
  echo "Previous bundled installation moved to: $BACKUP_DIR"
fi

mkdir -p "$INSTALL_DIR"
tar -C "$SOURCE_DIR" --exclude=node_modules -cf - . | tar -C "$INSTALL_DIR" -xf -
cd "$INSTALL_DIR"
# dist/ is bundled and verified in CI. Avoid two redundant prepare/build runs.
npm ci --omit=dev --ignore-scripts
npm link --ignore-scripts

echo
echo "Installed: $(command -v olcli)"
olcli --version
echo "Next: read references/setup-and-cookie.md, then pipe the cookie to olcli auth --stdin."
