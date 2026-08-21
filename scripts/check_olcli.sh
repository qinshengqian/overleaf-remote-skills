#!/usr/bin/env bash
set -euo pipefail

command -v olcli >/dev/null 2>&1 || {
  echo "olcli is not on PATH." >&2
  exit 1
}

echo "Executable: $(command -v olcli)"
echo "Version: $(olcli --version)"
olcli check
