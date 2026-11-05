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
  ./apps/trends/trends-collector/commands/collect_development.sh --date 2026-11-02 --force-newsletter-resend

재발송 테스트:
  --force-newsletter-resend 는 해당 날짜의 완료 signal에 forceResend=true를 넣어
  새 발송 회차를 요청합니다. Development에서만 사용할 수 있고, Dev Newsletter
  Worker의 NEWSLETTER_RESEND_ENABLED=true 설정이 배포되어 있어야 합니다.
  이전 발송 이력은 유지됩니다. 날짜 하나를 지정해 실행하세요.
EOF
}

if [[ "${1:-}" == "help" || "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
    show_help
    exit 0
fi

exec npm run trends:collector:development -- "$@"
