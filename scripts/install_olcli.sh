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

# Convenience: put the tmux session helper on PATH next to the `olcli` this
# shell resolves, by automating the `ln -s` documented in
# references/commands.md. macOS/Linux only; the helper is a bash script and
# there is no PowerShell twin, so Windows is deliberately left alone.
#
# The helper is linked from the skill directory rather than copied, so a later
# `git pull` of the skill keeps it current. Every step is best-effort: the
# install has already succeeded, and `set -e` must not let a permission
# problem, an unusual PATH, or an unrelated file of the same name turn a
# finished install into an aborted one.
HELPER_SOURCE="$SKILL_DIR/scripts/olcli-live"
OLCLI_PATH="$(command -v olcli 2>/dev/null || true)"
OLCLI_BIN_DIR=""
if [ -n "$OLCLI_PATH" ]; then
  candidate="$(dirname -- "$OLCLI_PATH")"
  if [ "$candidate" != "." ] && [ -d "$candidate" ]; then
    OLCLI_BIN_DIR="$candidate"
  fi
fi

if [ -f "$HELPER_SOURCE" ]; then
  if [ -z "$OLCLI_BIN_DIR" ]; then
    echo "Note: olcli is not on PATH yet, so olcli-live was not linked."
    echo "      Once olcli is callable, link the helper with:"
    echo "      ln -sfn \"$HELPER_SOURCE\" ~/.local/bin/olcli-live"
  else
    HELPER_LINK="$OLCLI_BIN_DIR/olcli-live"
    if [ -e "$HELPER_LINK" ] && [ ! -L "$HELPER_LINK" ]; then
      echo "Note: $HELPER_LINK already exists and is not a symlink; left untouched." >&2
    elif ln -sfn "$HELPER_SOURCE" "$HELPER_LINK" 2>/dev/null; then
      echo "Linked:   $HELPER_LINK -> $HELPER_SOURCE"
    else
      echo "Note: could not create $HELPER_LINK; run the helper as $HELPER_SOURCE" >&2
    fi
  fi
fi

echo
echo "Installed: $(command -v olcli)"
olcli --version
echo "Next: read references/setup-and-cookie.md, then pipe the cookie to olcli auth --stdin."
