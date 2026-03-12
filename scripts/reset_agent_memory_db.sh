#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DATA_DIR="$ROOT_DIR/data"

FILES=(
  "$DATA_DIR/agent_memory_db"
  "$DATA_DIR/agent_memory_db.wal"
  "$DATA_DIR/agent_memory_db.shm"
)

echo "Agent memory DB reset"
echo "Root: $ROOT_DIR"
echo "Targets:"
for file in "${FILES[@]}"; do
  echo " - $file"
done

read -r -p "Proceed? [y/N] " answer
case "$answer" in
  y|Y|yes|YES)
    ;;
  *)
    echo "Canceled."
    exit 0
    ;;
esac

for file in "${FILES[@]}"; do
  if [[ -e "$file" ]]; then
    rm -f "$file"
  fi
done

echo "Done. agent_memory_db files removed."
