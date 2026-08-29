#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

show_help() {
    cat <<'EOF'
사용법: ./collect_trends_local.sh [수집 옵션]

네이버 Creator Advisor 트렌드를 수집해 Local Trends API로 전송합니다.

예시:
  ./collect_trends_local.sh
  ./collect_trends_local.sh --date=-1d
EOF
}

if [[ "${1:-}" == "help" || "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
    show_help
    exit 0
fi

exec npm run trends:collector:local -- "$@"
