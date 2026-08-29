#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

show_help() {
    cat <<'EOF'
사용법: ./trends_local.sh <명령> [옵션]

명령:
  api       Local 트렌드 조회·저장 API 서버 실행
  collect   네이버 트렌드를 수집해 Local API로 전송
  status    Local Trends 환경 설정 상태 확인
  help      이 도움말 표시

예시:
  ./trends_local.sh api
  ./trends_local.sh collect --date=-1d
EOF
}

if [[ $# -eq 0 ]]; then
    show_help
    exit 0
fi

COMMAND="$1"
shift

case "$COMMAND" in
    api)
        if [[ $# -gt 0 ]]; then
            echo "api 명령은 추가 옵션을 받지 않습니다." >&2
            exit 2
        fi
        if [[ ! -f apps/trends/.env.local ]]; then
            echo "apps/trends/.env.local 파일이 필요합니다." >&2
            echo "먼저 apps/trends/.env.local.sample을 복사하고 Local key와 token을 설정해 주세요." >&2
            exit 1
        fi
        exec node scripts/trends-local-api-container.js
        ;;
    collect)
        exec npm run trends:collector:local -- "$@"
        ;;
    status)
        exec npm run trends:env:status -- local
        ;;
    help|-h|--help)
        show_help
        ;;
    *)
        echo "알 수 없는 명령입니다: $COMMAND" >&2
        show_help >&2
        exit 2
        ;;
esac
