#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
cd "$REPO_ROOT"

show_help() {
    cat <<'EOF'
사용법: ./apps/trends/trends-collector/commands/collect_production.sh [수집 옵션]

네이버 Creator Advisor 트렌드를 한 번 수집한 뒤 Production 반영 방식을 결정합니다.

기본 동작:
  인자 없음 또는 --date만 지정하면 수집 결과를 먼저 보여주고 PRODUCTION 입력을 확인합니다.

옵션:
  -h, --help                 도움말만 표시합니다.
  -d, --date <날짜>          수집 날짜를 지정합니다.
      --dry-run              수집·요약만 하고 Production에는 반영하지 않습니다.
      --confirm-production   대화 없이 Production에 반영합니다. CI/cron에서만 신중히 사용하세요.

예시:
  ./apps/trends/trends-collector/commands/collect_production.sh
  ./apps/trends/trends-collector/commands/collect_production.sh --date=-1d
  ./apps/trends/trends-collector/commands/collect_production.sh --dry-run --date=-1d
  ./apps/trends/trends-collector/commands/collect_production.sh --confirm-production --date=-1d
EOF
}

if [[ "${1:-}" == "help" || "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
    show_help
    exit 0
fi

exec npm run trends:collector:production -- "$@"
