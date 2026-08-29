#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
cd "$REPO_ROOT"

show_help() {
    cat <<'EOF'
사용법: ./apps/trends/trends-collector/commands/collect_development.sh [수집 옵션]

네이버 Creator Advisor 트렌드를 수집해 Development Trends API로 전송합니다.

예시:
  ./apps/trends/trends-collector/commands/collect_development.sh
  ./apps/trends/trends-collector/commands/collect_development.sh --date=-1d
EOF
}

if [[ "${1:-}" == "help" || "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
    show_help
    exit 0
fi

exec npm run trends:collector:development -- "$@"
